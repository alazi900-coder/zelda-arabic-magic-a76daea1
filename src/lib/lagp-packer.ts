/**
 * LAGP (Monolith UI Layout) packer / unpacker.
 *
 * GOAL: Provide a *neutral* unpack → repack pipeline for `.wilay` files of
 * type LAGP, fully decoupled from the texture-extraction code in
 * `wilay-parser.ts` and `xbc1-utils.ts`.
 *
 * Design principles:
 *  - Byte-exact round-trip: unpacking then repacking with no edits MUST
 *    produce the original file (same SHA-256). This is achieved by storing
 *    every byte of the inner LAGP payload as one of:
 *      • A "section" chunk (named, recognised LAGP region)
 *      • A "_filler_NNN.bin" chunk (raw bytes between/after sections)
 *    The manifest records the exact order, so repack is a simple concat.
 *  - The outer compression layer (xbc1 / zstd / deflate) is preserved by
 *    re-using the existing `unwrapWilaySource` / `rewrapWilayData` helpers.
 *    We do NOT modify those helpers.
 *  - This module is fully self-contained. Deleting this file + its tests +
 *    the UI section that calls it removes the feature with zero impact on
 *    the rest of the app.
 *
 * Output format (ZIP):
 *   manifest.json
 *   chunks/000_header.bin
 *   chunks/001_<section>.bin
 *   chunks/...
 */

import JSZip from "jszip";
import { unwrapWilaySource, rewrapWilayData } from "@/lib/xbc1-utils";

const LAGP_MAGIC = "LAGP";

export interface LagpChunk {
  /** Sequence index — defines the concat order on repack. */
  index: number;
  /** File name inside the ZIP (e.g. "000_header.bin"). */
  name: string;
  /** Byte offset in the (decompressed) LAGP payload. */
  offset: number;
  /** Byte length. */
  length: number;
  /**
   * Human-readable kind. "header"/"filler"/"raw" are reserved; future
   * splitters may emit additional kinds (e.g. "widgets", "strings").
   */
  kind: string;
}

export interface LagpManifest {
  format: "lagp-packer/v1";
  /** Original file name (informational). */
  sourceName: string;
  /** Magic of the inner (decompressed) payload — must be "LAGP". */
  innerMagic: string;
  /** Outer compression chain captured by `unwrapWilaySource`. */
  compressionSteps: string[];
  /** Base64-encoded original xbc1 header (48 bytes), if present. */
  xbc1HeaderBase64: string | null;
  /** Total inner payload size in bytes. */
  innerSize: number;
  /** Name of the splitter that produced these chunks. Informational. */
  splitter: string;
  /** Ordered list of chunks. Concatenating their bytes reproduces the inner payload. */
  chunks: LagpChunk[];
}

export interface UnpackResult {
  /** ZIP file as ArrayBuffer, ready to download. */
  zip: ArrayBuffer;
  manifest: LagpManifest;
}

export interface UnpackOptions {
  /** Splitter name. Defaults to DEFAULT_SPLITTER_NAME. */
  splitter?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMagic(bytes: Uint8Array, offset = 0): string {
  if (bytes.length < offset + 4) return "";
  return String.fromCharCode(
    bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3],
  );
}

function uint8ToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // btoa is available in browsers and modern Node/bun.
  return typeof btoa !== "undefined"
    ? btoa(bin)
    : Buffer.from(bytes).toString("base64");
}

function base64ToUint8(b64: string): Uint8Array {
  if (typeof atob !== "undefined") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}

// ---------------------------------------------------------------------------
// Splitter registry — extensible
// ---------------------------------------------------------------------------

/**
 * A splitter inspects the decompressed LAGP payload and produces an ordered
 * list of chunks. The contract is strict:
 *
 *   1. Chunks must cover EVERY byte of the payload — no gaps, no overlaps.
 *   2. Chunks must be in ascending offset order, and `index` must match
 *      array position.
 *   3. The concat of all chunk slices MUST byte-equal the input payload.
 *
 * Any region the splitter cannot identify must be emitted as a `filler`
 * chunk so round-trip stays byte-exact.
 *
 * To add a new splitter (e.g. one that recognises widget tables / string
 * pools), implement this interface and register it via `registerLagpSplitter`.
 * The active splitter is selected by name when calling `unpackLagp`.
 */
export interface LagpSplitter {
  /** Stable identifier stored in the manifest (e.g. "v1-header-body"). */
  name: string;
  /** Short human description, shown in UI/devtools. */
  description: string;
  /** Produce chunks. MUST satisfy the coverage contract above. */
  split(payload: Uint8Array): LagpChunk[];
}

const splitterRegistry = new Map<string, LagpSplitter>();

export function registerLagpSplitter(splitter: LagpSplitter): void {
  splitterRegistry.set(splitter.name, splitter);
}

export function getLagpSplitter(name: string): LagpSplitter | undefined {
  return splitterRegistry.get(name);
}

export function listLagpSplitters(): LagpSplitter[] {
  return [...splitterRegistry.values()];
}

/**
 * Validate the coverage contract. Throws on violation. Used both by
 * `unpackLagp` (to catch buggy splitters early) and by tests.
 */
export function validateChunkCoverage(
  chunks: LagpChunk[],
  payloadSize: number,
): void {
  let expectedOffset = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (c.index !== i) {
      throw new Error(`Splitter bug: chunk[${i}].index = ${c.index}`);
    }
    if (c.offset !== expectedOffset) {
      throw new Error(
        `Splitter bug: chunk[${i}] offset ${c.offset} != expected ${expectedOffset}`,
      );
    }
    if (c.length < 0) {
      throw new Error(`Splitter bug: chunk[${i}] negative length ${c.length}`);
    }
    expectedOffset += c.length;
  }
  if (expectedOffset !== payloadSize) {
    throw new Error(
      `Splitter bug: chunks cover ${expectedOffset} bytes, payload is ${payloadSize}`,
    );
  }
}

// ---- Built-in splitters --------------------------------------------------

/**
 * v1 splitter (default, conservative): exposes a 32-byte header chunk and
 * dumps the rest as a single body chunk. Always produces a valid round-trip.
 */
const splitterV1HeaderBody: LagpSplitter = {
  name: "v1-header-body",
  description: "32-byte header + single body chunk (conservative, always safe)",
  split(payload: Uint8Array): LagpChunk[] {
    const chunks: LagpChunk[] = [];
    if (payload.length === 0) return chunks;

    const HEADER_SIZE = Math.min(32, payload.length);
    chunks.push({
      index: 0,
      name: `chunks/${pad3(0)}_header.bin`,
      offset: 0,
      length: HEADER_SIZE,
      kind: "header",
    });
    if (payload.length > HEADER_SIZE) {
      chunks.push({
        index: 1,
        name: `chunks/${pad3(1)}_body.bin`,
        offset: HEADER_SIZE,
        length: payload.length - HEADER_SIZE,
        kind: "raw",
      });
    }
    return chunks;
  },
};

registerLagpSplitter(splitterV1HeaderBody);

export const DEFAULT_SPLITTER_NAME = splitterV1HeaderBody.name;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Unpack a `.wilay` (LAGP) file into a ZIP archive containing every byte of
 * the inner payload as separate chunks plus a manifest.json describing how
 * to repack.
 *
 * @throws if the file is not a LAGP-typed wilay.
 */
export async function unpackLagp(
  buffer: ArrayBuffer,
  sourceName = "input.wilay",
): Promise<UnpackResult> {
  const unwrapped = await unwrapWilaySource(buffer);

  if (unwrapped.innerMagic !== LAGP_MAGIC) {
    throw new Error(
      `Not a LAGP file. Inner magic is "${unwrapped.innerMagic}" (expected LAGP).`,
    );
  }

  const payload = new Uint8Array(unwrapped.data);
  const chunks = splitLagpPayload(payload);

  const manifest: LagpManifest = {
    format: "lagp-packer/v1",
    sourceName,
    innerMagic: unwrapped.innerMagic,
    compressionSteps: unwrapped.steps,
    xbc1HeaderBase64: unwrapped.xbc1Header
      ? uint8ToBase64(unwrapped.xbc1Header)
      : null,
    innerSize: payload.length,
    chunks,
  };

  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  for (const chunk of chunks) {
    const slice = payload.slice(chunk.offset, chunk.offset + chunk.length);
    zip.file(chunk.name, slice);
  }

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
  return { zip: zipBuffer, manifest };
}

/**
 * Repack a ZIP produced by `unpackLagp` (optionally edited) back into a
 * `.wilay` file using the same compression chain as the original.
 */
export async function repackLagp(zipBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(zipBuffer);

  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error("ZIP is missing manifest.json — cannot repack.");
  }

  const manifestText = await manifestFile.async("string");
  const manifest = JSON.parse(manifestText) as LagpManifest;

  if (manifest.format !== "lagp-packer/v1") {
    throw new Error(`Unsupported manifest format: ${manifest.format}`);
  }

  // Read chunks in the manifest's declared order and concatenate.
  const ordered = [...manifest.chunks].sort((a, b) => a.index - b.index);
  const parts: Uint8Array[] = [];
  let totalLen = 0;

  for (const chunk of ordered) {
    const file = zip.file(chunk.name);
    if (!file) {
      throw new Error(`Missing chunk in ZIP: ${chunk.name}`);
    }
    const data = await file.async("uint8array");
    parts.push(data);
    totalLen += data.length;
  }

  const inner = new Uint8Array(totalLen);
  let off = 0;
  for (const part of parts) {
    inner.set(part, off);
    off += part.length;
  }

  // Sanity check the magic survived edits.
  if (getMagic(inner) !== LAGP_MAGIC) {
    throw new Error(
      `Repacked payload does not start with LAGP magic — refusing to write.`,
    );
  }

  const xbc1Header = manifest.xbc1HeaderBase64
    ? base64ToUint8(manifest.xbc1HeaderBase64)
    : null;

  const innerBuf = inner.buffer.slice(
    inner.byteOffset,
    inner.byteOffset + inner.byteLength,
  ) as ArrayBuffer;

  const wrapped = await rewrapWilayData(
    innerBuf,
    manifest.compressionSteps,
    xbc1Header,
  );

  return wrapped;
}
