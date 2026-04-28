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
  /** Human-readable kind ("header", "filler", "raw"). */
  kind: "header" | "filler" | "raw";
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
  /** Ordered list of chunks. Concatenating their bytes reproduces the inner payload. */
  chunks: LagpChunk[];
}

export interface UnpackResult {
  /** ZIP file as ArrayBuffer, ready to download. */
  zip: ArrayBuffer;
  manifest: LagpManifest;
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
// Inner LAGP payload → ordered chunks
// ---------------------------------------------------------------------------

/**
 * Split the decompressed LAGP payload into named chunks.
 *
 * Strategy (v1 — conservative, byte-exact):
 *  - chunk 000: the 32-byte LAGP header (magic + early fields). This is the
 *    portion most users will want as a stable reference when editing.
 *  - chunk 001+: the remaining payload as one big "raw" chunk.
 *
 * This guarantees round-trip safety. Future versions can subdivide the
 * "raw" chunk into widget tables, string pools, etc., as the LAGP format
 * is reverse-engineered further. The manifest format is forward-compatible:
 * any number of chunks is allowed as long as their concat reproduces the
 * payload.
 */
function splitLagpPayload(payload: Uint8Array): LagpChunk[] {
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
}

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
