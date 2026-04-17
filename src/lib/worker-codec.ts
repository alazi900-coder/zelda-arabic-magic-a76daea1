/**
 * Worker codec — packs batches of mostly-string records into a single
 * `ArrayBuffer` so we can transfer them to/from the diagnostic Web Worker
 * with **zero-copy** semantics (`postMessage(msg, [buffer])`).
 *
 * Why bother?
 *   The structured-clone algorithm copies every string in the batch one by
 *   one. For 5–10k entries this is the main cost of `postMessage`. By packing
 *   everything into one binary blob we replace N copies with one pointer
 *   hand-off. The encode/decode passes are O(total bytes) but happen on a
 *   linear sweep with `TextEncoder` / `TextDecoder` which are heavily
 *   optimized in V8/JSC.
 *
 * Wire format (all little-endian):
 *
 *   [u32 recordCount]
 *   for each record:
 *     [u32 fieldCount]
 *     for each field:
 *       [u32 byteLength][...UTF-8 bytes]
 *     [u32 numericFieldCount]
 *     for each numeric field:
 *       [f64 value]
 *
 *   We always emit fields in a fixed order per record-kind (caller's
 *   responsibility to stay in sync). This keeps the decoder branch-free.
 */

const HEADER_BYTES = 4; // recordCount

export interface PackedBatch {
  buffer: ArrayBuffer;
  count: number;
}

class Writer {
  private chunks: Uint8Array[] = [];
  private size = 0;
  private encoder = new TextEncoder();

  u32(value: number): void {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, value >>> 0, true);
    this.chunks.push(new Uint8Array(buf));
    this.size += 4;
  }

  f64(value: number): void {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value, true);
    this.chunks.push(new Uint8Array(buf));
    this.size += 8;
  }

  str(value: string): void {
    const bytes = this.encoder.encode(value);
    this.u32(bytes.byteLength);
    this.chunks.push(bytes);
    this.size += bytes.byteLength;
  }

  finish(): ArrayBuffer {
    const out = new Uint8Array(this.size);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out.buffer;
  }
}

class Reader {
  private view: DataView;
  private offset = 0;
  private decoder = new TextDecoder();

  constructor(private buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  u32(): number {
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  f64(): number {
    const v = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return v;
  }

  str(): string {
    const len = this.u32();
    const bytes = new Uint8Array(this.buffer, this.offset, len);
    this.offset += len;
    return this.decoder.decode(bytes);
  }

  done(): boolean {
    return this.offset >= this.view.byteLength;
  }
}

// ───────────────────────── Rebalance batch ─────────────────────────
// Per record: key, original, translation, englishLineCount(f64)

export interface RebalanceRecord {
  key: string;
  original: string;
  translation: string;
  englishLineCount: number;
}

export function packRebalanceBatch(records: RebalanceRecord[]): PackedBatch {
  const w = new Writer();
  w.u32(records.length);
  for (const r of records) {
    w.str(r.key);
    w.str(r.original);
    w.str(r.translation);
    w.f64(r.englishLineCount);
  }
  return { buffer: w.finish(), count: records.length };
}

export function unpackRebalanceBatch(buffer: ArrayBuffer): RebalanceRecord[] {
  const r = new Reader(buffer);
  const count = r.u32();
  const out: RebalanceRecord[] = new Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = {
      key: r.str(),
      original: r.str(),
      translation: r.str(),
      englishLineCount: r.f64(),
    };
  }
  return out;
}

// ───────────────────────── Rebalance result ─────────────────────────
// Per record: key, fixed

export interface RebalanceResultRecord {
  key: string;
  fixed: string;
}

export function packRebalanceResults(results: RebalanceResultRecord[]): PackedBatch {
  const w = new Writer();
  w.u32(results.length);
  for (const r of results) {
    w.str(r.key);
    w.str(r.fixed);
  }
  return { buffer: w.finish(), count: results.length };
}

export function unpackRebalanceResults(buffer: ArrayBuffer): RebalanceResultRecord[] {
  const r = new Reader(buffer);
  const count = r.u32();
  const out: RebalanceResultRecord[] = new Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = { key: r.str(), fixed: r.str() };
  }
  return out;
}

// ───────────────────────── Detect batch ─────────────────────────
// Per record: msbtFile, indexStr, label, original, maxBytes(f64), translation
// (`index` is coerced to string on the wire — it is read only as part of the
// composite key, so the worker reconstitutes it as a string field.)

export interface DetectRecord {
  msbtFile: string;
  index: string;
  label: string;
  original: string;
  maxBytes: number;
  translation: string;
}

export function packDetectBatch(records: DetectRecord[]): PackedBatch {
  const w = new Writer();
  w.u32(records.length);
  for (const r of records) {
    w.str(r.msbtFile);
    w.str(r.index);
    w.str(r.label);
    w.str(r.original);
    w.f64(r.maxBytes);
    w.str(r.translation);
  }
  return { buffer: w.finish(), count: records.length };
}

export function unpackDetectBatch(buffer: ArrayBuffer): DetectRecord[] {
  const r = new Reader(buffer);
  const count = r.u32();
  const out: DetectRecord[] = new Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = {
      msbtFile: r.str(),
      index: r.str(),
      label: r.str(),
      original: r.str(),
      maxBytes: r.f64(),
      translation: r.str(),
    };
  }
  return out;
}

// ───────────────────────── Detect issues result ─────────────────────────
// Per issue: key, label, original, translation, severityCode(u32), category, message
// severityCode: 0=critical, 1=warning, 2=info

export type SeverityCode = 0 | 1 | 2;

export interface PackedIssue {
  key: string;
  label: string;
  original: string;
  translation: string;
  severity: SeverityCode;
  category: string;
  message: string;
}

const SEVERITY_TO_CODE = { critical: 0, warning: 1, info: 2 } as const;
const CODE_TO_SEVERITY = ["critical", "warning", "info"] as const;

export function severityToCode(s: "critical" | "warning" | "info"): SeverityCode {
  return SEVERITY_TO_CODE[s];
}

export function codeToSeverity(c: number): "critical" | "warning" | "info" {
  return CODE_TO_SEVERITY[c] ?? "warning";
}

export function packIssueBatch(issues: PackedIssue[]): PackedBatch {
  const w = new Writer();
  w.u32(issues.length);
  for (const issue of issues) {
    w.str(issue.key);
    w.str(issue.label);
    w.str(issue.original);
    w.str(issue.translation);
    w.u32(issue.severity);
    w.str(issue.category);
    w.str(issue.message);
  }
  return { buffer: w.finish(), count: issues.length };
}

export function unpackIssueBatch(buffer: ArrayBuffer): PackedIssue[] {
  const r = new Reader(buffer);
  const count = r.u32();
  const out: PackedIssue[] = new Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = {
      key: r.str(),
      label: r.str(),
      original: r.str(),
      translation: r.str(),
      severity: r.u32() as SeverityCode,
      category: r.str(),
      message: r.str(),
    };
  }
  return out;
}

// Re-export for callers that want a sanity check.
export const _internal = { HEADER_BYTES };
