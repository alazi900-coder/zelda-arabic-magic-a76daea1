/**
 * Risen 1 `.ximg` (GR01IM04, Genome Engine image resource) parser.
 *
 * Confirmed byte-for-byte against two real files (numbers.ximg, 2,441 bytes,
 * 128x16 DXT3; hint02.ximg, 1,048,969 bytes, 2048x1024 DXT1):
 *
 *   0x00  8   magic "GR01IM04"
 *   0x08  4   uint32 = 40           (constant, unused)
 *   0x0C  4   uint32 = 225 (0xE1)   (constant, unused)
 *   0x10  4   uint32 ddsOffset      (= 0x109 in both samples — offset of the
 *                                     embedded DDS blob start, from file start)
 *   0x14  4   uint32 ddsSize        (byte length of the embedded DDS blob;
 *                                     confirmed == file length - ddsOffset
 *                                     exactly in both samples, i.e. no
 *                                     trailing padding after the DDS blob)
 *   0x18  8   int64  timestamp      (FILETIME, opaque, copied verbatim)
 *   0x20  ..  eCImageResource2 Genome property block (".tga"/".png" + fixed
 *             bytes + Width/Height/SkipMips/PixelFormat) — never parsed;
 *             the embedded DDS's own header is the source of truth for
 *             dimensions and pixel format.
 *   ddsOffset..  a standard DDS file ("DDS " + 124-byte DDS_HEADER + data),
 *                extending to the end of the .ximg file.
 */

import { type DxtFourCC } from "./risen-dxt-codec";

const MAGIC = "GR01IM04";
const DDS_OFFSET_FIELD = 0x10;
const DDS_SIZE_FIELD = 0x14;
const DDS_HEADER_SIZE = 128; // "DDS " (4) + DDS_HEADER struct (124)

export interface XimgDds {
  /** Absolute byte offset of the embedded DDS blob's start within the .ximg file. */
  ddsOffset: number;
  ddsBytes: Uint8Array;
  width: number;
  height: number;
  /** Raw 4-char fourCC read from the DDS header — usually DXT1/DXT3/DXT5, but
   * kept as a plain string so an unrecognized format can still be surfaced
   * to the user instead of throwing. */
  fourCC: string;
}

function readAscii(bytes: Uint8Array, offset: number, len: number): string {
  return new TextDecoder("ascii").decode(bytes.subarray(offset, offset + len));
}

/** Reads width/height/fourCC out of a standalone DDS blob (magic "DDS " at offset 0). */
export function readDdsHeader(ddsBytes: Uint8Array): { width: number; height: number; fourCC: string } {
  if (ddsBytes.length < DDS_HEADER_SIZE) throw new Error("ملف DDS غير مكتمل (أقل من ترويسة 128 بايت)");
  if (readAscii(ddsBytes, 0, 4) !== "DDS ") throw new Error('توقيع DDS غير صالح — يجب أن يبدأ بـ "DDS "');
  const view = new DataView(ddsBytes.buffer, ddsBytes.byteOffset, ddsBytes.byteLength);
  const height = view.getUint32(12, true);
  const width = view.getUint32(16, true);
  const fourCC = readAscii(ddsBytes, 84, 4);
  return { width, height, fourCC };
}

/** Locates and parses the embedded DDS blob inside a full .ximg file buffer. */
export function extractDdsFromXimg(ximgBytes: Uint8Array): XimgDds {
  if (ximgBytes.length < 0x18) throw new Error("ملف .ximg غير مكتمل");
  if (readAscii(ximgBytes, 0, 8) !== MAGIC) {
    throw new Error(`توقيع غير متوقع — ليس ملف .ximg صالح (GR01IM04)`);
  }
  const view = new DataView(ximgBytes.buffer, ximgBytes.byteOffset, ximgBytes.byteLength);
  let ddsOffset = view.getUint32(DDS_OFFSET_FIELD, true);
  let ddsSize = view.getUint32(DDS_SIZE_FIELD, true);

  const looksLikeDds = (off: number) =>
    off + 4 <= ximgBytes.length && readAscii(ximgBytes, off, 4) === "DDS ";

  if (!looksLikeDds(ddsOffset)) {
    // Defensive fallback if the header field ever doesn't hold — scan for the magic directly.
    const scanned = indexOfBytes(ximgBytes, [0x44, 0x44, 0x53, 0x20]); // "DDS "
    if (scanned < 0) throw new Error('لم يتم العثور على بيانات DDS داخل ملف .ximg');
    ddsOffset = scanned;
    ddsSize = ximgBytes.length - ddsOffset;
  }

  const ddsBytes = ximgBytes.subarray(ddsOffset, ddsOffset + ddsSize);
  const { width, height, fourCC } = readDdsHeader(ddsBytes);

  return { ddsOffset, ddsBytes, width, height, fourCC };
}

function indexOfBytes(haystack: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Replaces the embedded DDS blob in-place. Requires the new blob to be
 * byte-identical in length to the original — this is what makes positional
 * in-place patching of images.pak safe (no offset table to rebuild). Throws
 * a clear error instead of writing anything if sizes differ.
 */
export function spliceReplacementDds(originalXimgBytes: Uint8Array, newDdsBytes: Uint8Array): Uint8Array {
  const original = extractDdsFromXimg(originalXimgBytes);
  if (newDdsBytes.length !== original.ddsBytes.length) {
    throw new Error(
      `حجم DDS الجديد (${newDdsBytes.length} بايت) لا يطابق حجم الأصل (${original.ddsBytes.length} بايت) — ` +
      `الإصدار الحالي من الأداة يدعم فقط استبدال صورة بأخرى بنفس الأبعاد والصيغة.`
    );
  }
  const out = new Uint8Array(originalXimgBytes.length);
  out.set(originalXimgBytes.subarray(0, original.ddsOffset), 0);
  out.set(newDdsBytes, original.ddsOffset);
  return out;
}

export interface DdsValidationResult {
  ok: boolean;
  reason?: string;
}

/** Non-throwing pre-check used by the UI to enable/disable the inject action with a clear message. */
export function validateReplacementDds(originalXimgBytes: Uint8Array, candidateDdsBytes: Uint8Array): DdsValidationResult {
  let original: XimgDds;
  try {
    original = extractDdsFromXimg(originalXimgBytes);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  let candidate: { width: number; height: number; fourCC: string };
  try {
    candidate = readDdsHeader(candidateDdsBytes);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  if (candidate.width !== original.width || candidate.height !== original.height) {
    return {
      ok: false,
      reason: `الأبعاد غير متطابقة: الصورة الجديدة ${candidate.width}×${candidate.height} بينما الأصل ${original.width}×${original.height}`,
    };
  }
  if (candidate.fourCC !== original.fourCC) {
    return { ok: false, reason: `صيغة الضغط غير متطابقة: ${candidate.fourCC} بدل ${original.fourCC}` };
  }
  if (candidateDdsBytes.length !== original.ddsBytes.length) {
    return {
      ok: false,
      reason: `حجم الملف غير متطابق بالبايت: ${candidateDdsBytes.length} بدل ${original.ddsBytes.length}`,
    };
  }
  return { ok: true };
}

/** Builds a complete, standard 128-byte-header DDS file from raw compressed block data. */
export function buildDdsFile(fourCC: DxtFourCC, width: number, height: number, compressedData: Uint8Array): Uint8Array {
  const out = new Uint8Array(DDS_HEADER_SIZE + compressedData.length);
  const view = new DataView(out.buffer);
  out.set([0x44, 0x44, 0x53, 0x20], 0); // "DDS "
  view.setUint32(4, 124, true); // dwSize
  view.setUint32(8, 0x00081007, true); // CAPS|HEIGHT|WIDTH|PIXELFORMAT|LINEARSIZE
  view.setUint32(12, height, true);
  view.setUint32(16, width, true);
  view.setUint32(20, compressedData.length, true); // pitchOrLinearSize
  view.setUint32(24, 0, true); // depth
  view.setUint32(28, 0, true); // mipMapCount
  // bytes 32..75 (dwReserved1[11]) left zeroed
  view.setUint32(76, 32, true); // ddspf.dwSize
  view.setUint32(80, 0x4, true); // ddspf.dwFlags = DDPF_FOURCC
  out.set(new TextEncoder().encode(fourCC), 84); // ddspf.dwFourCC
  // ddspf.dwRGBBitCount / masks (88..107) left zeroed
  view.setUint32(108, 0x1000, true); // dwCaps = DDSCAPS_TEXTURE
  // dwCaps2/3/4, dwReserved2 (112..127) left zeroed
  out.set(compressedData, DDS_HEADER_SIZE);
  return out;
}
