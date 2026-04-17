/**
 * Wrapper around the diagnostic worker — provides Promise-based APIs with
 * automatic main-thread fallback if Web Workers are unavailable (e.g. older
 * mobile browsers, restricted environments, or if the worker fails to spawn).
 *
 * Both directions of the wire (request → worker, response → main) use packed
 * `ArrayBuffer`s passed through the `postMessage` transfer list so we avoid
 * structured-clone copies entirely on big batches.
 *
 * Two operations supported:
 *   • runRebalanceBatch — DP line-balancer for "Fix all" workflows.
 *   • runDetectBatch    — `detectIssues` for the deep diagnostic scan.
 */

import { balanceLines, splitEvenlyByLines } from "@/lib/balance-lines";
import {
  detectIssues,
  type DetectableEntry,
  type DiagnosticIssue,
} from "@/lib/diagnostic-detect";
import {
  packRebalanceBatch,
  unpackRebalanceResults,
  packDetectBatch,
  unpackIssueBatch,
  codeToSeverity,
  type RebalanceRecord,
  type DetectRecord,
} from "@/lib/worker-codec";

// ───────────────────────── Public types ─────────────────────────

export interface RebalanceItem {
  key: string;
  original: string;
  translation: string;
  englishLineCount: number;
}

export interface RebalanceProgress {
  done: number;
  total: number;
}

export interface RebalanceResult {
  key: string;
  fixed: string;
}

export interface DetectItem {
  entry: DetectableEntry;
  translation: string;
}

export interface DetectProgress {
  done: number;
  total: number;
}

// ───────────────────────── Worker plumbing ─────────────────────────

let workerSingleton: Worker | null = null;
let workerUnsupported = false;
let nextId = 1;

function getWorker(): Worker | null {
  if (workerUnsupported) return null;
  if (workerSingleton) return workerSingleton;
  try {
    workerSingleton = new Worker(
      new URL("@/workers/diagnostic.worker.ts", import.meta.url),
      { type: "module" },
    );
    return workerSingleton;
  } catch (err) {
    console.warn("[diagnostic] Web Worker unavailable, falling back to main thread:", err);
    workerUnsupported = true;
    return null;
  }
}

// ───────────────────────── Rebalance API ─────────────────────────

export function runRebalanceBatch(
  batch: RebalanceItem[],
  onProgress?: (p: RebalanceProgress) => void,
): Promise<RebalanceResult[]> {
  const worker = getWorker();
  if (!worker) return runRebalanceMainThread(batch, onProgress);

  const id = nextId++;
  const records: RebalanceRecord[] = batch.map((b) => ({
    key: b.key,
    original: b.original,
    translation: b.translation,
    englishLineCount: b.englishLineCount,
  }));
  const packed = packRebalanceBatch(records);

  return new Promise<RebalanceResult[]>((resolve, reject) => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data;
      if (!msg || msg.id !== id) return;
      if (msg.type === "rebalance:progress" && onProgress) {
        onProgress({ done: msg.done, total: msg.total });
      } else if (msg.type === "rebalance:done") {
        worker.removeEventListener("message", handler);
        try {
          const results = unpackRebalanceResults(msg.buffer as ArrayBuffer);
          resolve(results);
        } catch (err) {
          reject(err);
        }
      }
    };
    const errHandler = (err: ErrorEvent) => {
      worker.removeEventListener("message", handler);
      worker.removeEventListener("error", errHandler);
      console.error("[diagnostic worker] error, falling back:", err.message);
      runRebalanceMainThread(batch, onProgress).then(resolve, reject);
    };
    worker.addEventListener("message", handler);
    worker.addEventListener("error", errHandler, { once: true });
    // Transfer the packed buffer with zero-copy semantics.
    worker.postMessage(
      { type: "rebalance", id, buffer: packed.buffer },
      [packed.buffer],
    );
  });
}

function runRebalanceMainThread(
  batch: RebalanceItem[],
  onProgress?: (p: RebalanceProgress) => void,
): Promise<RebalanceResult[]> {
  return new Promise((resolve) => {
    const results: RebalanceResult[] = [];
    const STEP = 100;
    let i = 0;
    const total = batch.length;
    const tick = () => {
      const end = Math.min(i + STEP, total);
      for (; i < end; i++) {
        const item = batch[i];
        try {
          const fixed = item.englishLineCount > 1
            ? splitEvenlyByLines(item.translation, item.englishLineCount)
            : balanceLines(item.translation);
          if (fixed !== item.translation) {
            results.push({ key: item.key, fixed });
          }
        } catch {
          // skip
        }
      }
      onProgress?.({ done: i, total });
      if (i < total) setTimeout(tick, 0);
      else resolve(results);
    };
    tick();
  });
}

// ───────────────────────── Detect API ─────────────────────────

export function runDetectBatch(
  batch: DetectItem[],
  onProgress?: (p: DetectProgress) => void,
): Promise<DiagnosticIssue[]> {
  const worker = getWorker();
  if (!worker) return runDetectMainThread(batch, onProgress);

  const id = nextId++;
  const records: DetectRecord[] = batch.map((b) => ({
    msbtFile: b.entry.msbtFile,
    // `index` may be a number on the main thread — coerce to string for the
    // wire so we can use the variable-length string codec.
    index: String(b.entry.index),
    label: b.entry.label,
    original: b.entry.original,
    maxBytes: b.entry.maxBytes,
    translation: b.translation,
  }));
  const packed = packDetectBatch(records);

  return new Promise<DiagnosticIssue[]>((resolve, reject) => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data;
      if (!msg || msg.id !== id) return;
      if (msg.type === "detect:progress" && onProgress) {
        onProgress({ done: msg.done, total: msg.total });
      } else if (msg.type === "detect:done") {
        worker.removeEventListener("message", handler);
        try {
          const packedIssues = unpackIssueBatch(msg.buffer as ArrayBuffer);
          const issues: DiagnosticIssue[] = packedIssues.map((p) => ({
            key: p.key,
            label: p.label,
            original: p.original,
            translation: p.translation,
            severity: codeToSeverity(p.severity),
            category: p.category,
            message: p.message,
          }));
          resolve(issues);
        } catch (err) {
          reject(err);
        }
      }
    };
    const errHandler = (err: ErrorEvent) => {
      worker.removeEventListener("message", handler);
      worker.removeEventListener("error", errHandler);
      console.error("[detect worker] error, falling back:", err.message);
      runDetectMainThread(batch, onProgress).then(resolve, reject);
    };
    worker.addEventListener("message", handler);
    worker.addEventListener("error", errHandler, { once: true });
    worker.postMessage(
      { type: "detect", id, buffer: packed.buffer },
      [packed.buffer],
    );
  });
}

function runDetectMainThread(
  batch: DetectItem[],
  onProgress?: (p: DetectProgress) => void,
): Promise<DiagnosticIssue[]> {
  return new Promise((resolve) => {
    const issues: DiagnosticIssue[] = [];
    const STEP = 250;
    let i = 0;
    const total = batch.length;
    const tick = () => {
      const end = Math.min(i + STEP, total);
      for (; i < end; i++) {
        const item = batch[i];
        try {
          const found = detectIssues(item.entry, item.translation);
          if (found.length > 0) {
            for (const issue of found) issues.push(issue);
          }
        } catch {
          // skip
        }
      }
      onProgress?.({ done: i, total });
      if (i < total) setTimeout(tick, 0);
      else resolve(issues);
    };
    tick();
  });
}
