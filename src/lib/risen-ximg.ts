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

import { type DxtFourCC, isDxtFourCC, decodeDxt } from "./risen-dxt-codec";

const MAGIC = "GR01IM04";
const DDS_OFFSET_FIELD = 0x10;
const DDS_SIZE_FIELD = 0x14;
const DDS_HEADER_SIZE = 128; // "DDS " (4) + DDS_HEADER struct (124)

const DDSD_PITCH = 0x8;
const DDPF_ALPHAPIXELS = 0x1;
const DDPF_FOURCC = 0x4;
const DDPF_RGB = 0x40;

export interface DdsHeaderInfo {
  width: number;
  height: number;
  /** Raw 4-char fourCC read from the DDS header when DDPF_FOURCC is set — "" otherwise
   * (uncompressed RGB DDS files leave this field zeroed/meaningless). */
  fourCC: string;
  /** ddspf.dwFlags — kept for diagnostics on unsupported formats. */
  ddspfFlags: number;
  /** DDPF_RGB set — an uncompressed pixel format described by the masks below. */
  isRawRgb: boolean;
  rgbBitCount: number;
  rMask: number;
  gMask: number;
  bMask: number;
  aMask: number;
  /** Row stride in bytes, only meaningful for uncompressed data when hasPitchFlag is true. */
  pitchOrLinearSize: number;
  hasPitchFlag: boolean;
  /** dwCaps — some writers set legacy bits here (e.g. DDSCAPS_ALPHA = 0x2) that a
   * strict reader may check alongside ddspf.dwFlags. Preserved verbatim on rebuild. */
  caps: number;
}

export interface XimgDds extends DdsHeaderInfo {
  /** Absolute byte offset of the embedded DDS blob's start within the .ximg file. */
  ddsOffset: number;
  ddsBytes: Uint8Array;
}

function readAscii(bytes: Uint8Array, offset: number, len: number): string {
  return new TextDecoder("ascii").decode(bytes.subarray(offset, offset + len));
}

/** Reads the full DDS_HEADER out of a standalone DDS blob (magic "DDS " at offset 0). */
export function readDdsHeader(ddsBytes: Uint8Array): DdsHeaderInfo {
  if (ddsBytes.length < DDS_HEADER_SIZE) throw new Error("ملف DDS غير مكتمل (أقل من ترويسة 128 بايت)");
  if (readAscii(ddsBytes, 0, 4) !== "DDS ") throw new Error('توقيع DDS غير صالح — يجب أن يبدأ بـ "DDS "');
  const view = new DataView(ddsBytes.buffer, ddsBytes.byteOffset, ddsBytes.byteLength);
  const headerFlags = view.getUint32(8, true);
  const height = view.getUint32(12, true);
  const width = view.getUint32(16, true);
  const pitchOrLinearSize = view.getUint32(20, true);
  const ddspfFlags = view.getUint32(80, true);
  const fourCCRaw = readAscii(ddsBytes, 84, 4);
  const rgbBitCount = view.getUint32(88, true);
  const rMask = view.getUint32(92, true);
  const gMask = view.getUint32(96, true);
  const bMask = view.getUint32(100, true);
  const aMask = view.getUint32(104, true);
  const caps = view.getUint32(108, true);

  return {
    width,
    height,
    fourCC: (ddspfFlags & DDPF_FOURCC) ? fourCCRaw : "",
    ddspfFlags,
    isRawRgb: (ddspfFlags & DDPF_RGB) !== 0,
    rgbBitCount,
    rMask,
    gMask,
    bMask,
    aMask,
    pitchOrLinearSize,
    hasPitchFlag: (headerFlags & DDSD_PITCH) !== 0,
    caps,
  };
}

/** Human-readable dump of the fields relevant to the alpha-flag corruption bug —
 * used for the replace-diagnostic report so a user can share exact runtime values
 * without needing browser devtools. */
export function describeDdsHeaderFlags(h: DdsHeaderInfo): string {
  const hasAlpha = (h.ddspfFlags & DDPF_ALPHAPIXELS) !== 0;
  const hasRgb = (h.ddspfFlags & DDPF_RGB) !== 0;
  return [
    `الأبعاد: ${h.width}x${h.height}`,
    `fourCC: ${h.fourCC || "(بدون)"}   rgbBitCount: ${h.rgbBitCount}`,
    `ddspf.dwFlags: 0x${h.ddspfFlags.toString(16)}  (DDPF_ALPHAPIXELS: ${hasAlpha ? "موجود" : "غائب"}, DDPF_RGB: ${hasRgb ? "موجود" : "غائب"})`,
    `dwCaps: 0x${h.caps.toString(16)}`,
    `hasPitchFlag: ${h.hasPitchFlag}   pitchOrLinearSize: ${h.pitchOrLinearSize}`,
    `الأقنعة (masks): R=0x${h.rMask.toString(16)} G=0x${h.gMask.toString(16)} B=0x${h.bMask.toString(16)} A=0x${h.aMask.toString(16)}`,
  ].join("\n");
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
  const headerInfo = readDdsHeader(ddsBytes);

  return { ddsOffset, ddsBytes, ...headerInfo };
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

/** Returns the index of the first byte where `a` and `b` differ, or `-1` if
 * they're identical (including matching length). Used as a post-write safety
 * check — read back what actually landed on disk and confirm it's exactly
 * what was intended, independent of *why* a future write might go wrong. */
export function findFirstByteMismatch(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : len;
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
  let candidate: DdsHeaderInfo;
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

/** Builds a complete, standard 128-byte-header DDS file from raw compressed block data.
 * `caps` should be copied from the original being replaced when available — some writers
 * set legacy bits here (e.g. DDSCAPS_ALPHA) that a strict reader may check; defaults to
 * plain DDSCAPS_TEXTURE for callers (mainly tests) that don't have an original to match. */
export function buildDdsFile(fourCC: DxtFourCC, width: number, height: number, compressedData: Uint8Array, caps = 0x1000): Uint8Array {
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
  view.setUint32(108, caps, true); // dwCaps
  // dwCaps2/3/4, dwReserved2 (112..127) left zeroed
  out.set(compressedData, DDS_HEADER_SIZE);
  return out;
}

// ============================================================================
// Viewer decode dispatch — DXT1/3/5 or uncompressed RGB, with a diagnostic
// result (never a throw) for anything else, e.g. a DX10-extended-header FourCC.
// ============================================================================

function maskBitWidth(mask: number): number {
  let n = 0;
  let m = mask >>> 0;
  while (m) { n += m & 1; m >>>= 1; }
  return n;
}

function maskTrailingZeros(mask: number): number {
  if (mask === 0) return 0;
  let n = 0;
  let m = mask >>> 0;
  while ((m & 1) === 0) { m >>>= 1; n++; }
  return n;
}

function extractChannel(pixel: number, mask: number): number {
  if (mask === 0) return 255; // channel absent (e.g. no alpha mask) -> fully opaque
  const shift = maskTrailingZeros(mask);
  const bits = maskBitWidth(mask);
  const raw = (pixel & mask) >>> shift;
  if (bits >= 8) return raw >>> (bits - 8);
  const maxVal = (1 << bits) - 1;
  return Math.round((raw / maxVal) * 255);
}

/**
 * Decodes an uncompressed (DDPF_RGB) DDS pixel buffer to RGBA, using the
 * file's own bit masks — works for any channel order/width (32-bit with
 * alpha, 24-bit without, 16-bit 565, etc.), not just a hardcoded A8R8G8B8.
 * Returns null if the bit count isn't a supported whole byte count (1-4).
 */
export function decodeRawRgbDds(
  data: Uint8Array,
  width: number,
  height: number,
  bitCount: number,
  rMask: number,
  gMask: number,
  bMask: number,
  aMask: number,
  explicitPitch?: number
): Uint8Array | null {
  const bytesPerPixel = bitCount / 8;
  if (!Number.isInteger(bytesPerPixel) || bytesPerPixel < 1 || bytesPerPixel > 4) return null;
  const stride = explicitPitch && explicitPitch > 0 ? explicitPitch : width * bytesPerPixel;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    for (let x = 0; x < width; x++) {
      const pxOffset = rowStart + x * bytesPerPixel;
      if (pxOffset + bytesPerPixel > data.length) continue;
      let pixel: number;
      if (bytesPerPixel === 4) pixel = view.getUint32(pxOffset, true);
      else if (bytesPerPixel === 3) pixel = data[pxOffset] | (data[pxOffset + 1] << 8) | (data[pxOffset + 2] << 16);
      else if (bytesPerPixel === 2) pixel = view.getUint16(pxOffset, true);
      else pixel = data[pxOffset];

      const o = (y * width + x) * 4;
      out[o] = extractChannel(pixel, rMask);
      out[o + 1] = extractChannel(pixel, gMask);
      out[o + 2] = extractChannel(pixel, bMask);
      out[o + 3] = aMask ? extractChannel(pixel, aMask) : 255;
    }
  }
  return out;
}

export interface DecodedDdsImage {
  supported: true;
  rgba: Uint8Array;
  width: number;
  height: number;
  /** "" for uncompressed formats. */
  fourCC: string;
  /** Bits per pixel for uncompressed formats; 0 for compressed. */
  rgbBitCount: number;
  /** Alpha bit mask for uncompressed formats; 0 when the source has no alpha channel. */
  aMask: number;
}

export interface UnsupportedDdsFormat {
  supported: false;
  /** "" when the file has no FourCC (e.g. it's flagged DDPF_RGB but with an
   * unsupported bit count), shown to the user as "بدون fourCC". */
  fourCC: string;
  ddspfFlags: number;
  rgbBitCount: number;
}

/** Decodes a full DDS blob (with its 128-byte header) to RGBA, or returns a
 * diagnostic instead of throwing when the format isn't one this tool decodes. */
export function decodeDdsToRgba(ddsBytes: Uint8Array): DecodedDdsImage | UnsupportedDdsFormat {
  const header = readDdsHeader(ddsBytes);
  const compressed = ddsBytes.subarray(DDS_HEADER_SIZE);

  if (isDxtFourCC(header.fourCC)) {
    const rgba = decodeDxt(header.fourCC, compressed, header.width, header.height);
    return { supported: true, rgba, width: header.width, height: header.height, fourCC: header.fourCC, rgbBitCount: 0, aMask: 0 };
  }

  if (header.isRawRgb) {
    const rgba = decodeRawRgbDds(
      compressed, header.width, header.height, header.rgbBitCount,
      header.rMask, header.gMask, header.bMask, header.aMask,
      header.hasPitchFlag ? header.pitchOrLinearSize : undefined
    );
    if (rgba) return { supported: true, rgba, width: header.width, height: header.height, fourCC: "", rgbBitCount: header.rgbBitCount, aMask: header.aMask };
  }

  return {
    supported: false,
    fourCC: header.fourCC,
    ddspfFlags: header.ddspfFlags,
    rgbBitCount: header.rgbBitCount,
  };
}

// ============================================================================
// Replace-flow encoding for uncompressed (DDPF_RGB) DDS — mirrors
// decodeRawRgbDds exactly in reverse, so a PNG import can replace a raw-RGB
// GUI image (not just DXT-compressed ones).
// ============================================================================

/** Inverse of extractChannel: packs an 8-bit value into its bit position/width in `mask`. */
function packChannel(value8: number, mask: number): number {
  if (mask === 0) return 0;
  const shift = maskTrailingZeros(mask);
  const bits = maskBitWidth(mask);
  const maxVal = (1 << bits) - 1;
  const scaled = bits >= 8 ? value8 >>> (8 - bits) : Math.round((value8 / 255) * maxVal);
  return (scaled & maxVal) << shift;
}

/**
 * Encodes RGBA pixel data into a raw (uncompressed) DDS pixel buffer using
 * the target bit masks — the exact inverse of decodeRawRgbDds. `totalLength`
 * is the exact byte length to produce (the original pixel data's size),
 * which is what makes the same-size splice constraint hold by construction.
 * Returns null if the bit count isn't a supported whole byte count (1-4).
 */
export function encodeRawRgbDds(
  rgba: Uint8Array,
  width: number,
  height: number,
  bitCount: number,
  rMask: number,
  gMask: number,
  bMask: number,
  aMask: number,
  totalLength: number,
  explicitPitch?: number
): Uint8Array | null {
  const bytesPerPixel = bitCount / 8;
  if (!Number.isInteger(bytesPerPixel) || bytesPerPixel < 1 || bytesPerPixel > 4) return null;
  const stride = explicitPitch && explicitPitch > 0 ? explicitPitch : width * bytesPerPixel;
  const out = new Uint8Array(totalLength);
  const view = new DataView(out.buffer);

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    for (let x = 0; x < width; x++) {
      const pxOffset = rowStart + x * bytesPerPixel;
      if (pxOffset + bytesPerPixel > out.length) continue;
      const o = (y * width + x) * 4;
      let pixel = packChannel(rgba[o], rMask) | packChannel(rgba[o + 1], gMask) | packChannel(rgba[o + 2], bMask);
      if (aMask) pixel |= packChannel(rgba[o + 3], aMask);
      pixel = pixel >>> 0;

      if (bytesPerPixel === 4) view.setUint32(pxOffset, pixel, true);
      else if (bytesPerPixel === 3) {
        out[pxOffset] = pixel & 0xff;
        out[pxOffset + 1] = (pixel >>> 8) & 0xff;
        out[pxOffset + 2] = (pixel >>> 16) & 0xff;
      } else if (bytesPerPixel === 2) view.setUint16(pxOffset, pixel & 0xffff, true);
      else out[pxOffset] = pixel & 0xff;
    }
  }
  return out;
}

/** Builds a complete, standard 128-byte-header uncompressed (DDPF_RGB) DDS file.
 * `hasPitchFlag`/`pitchOrLinearSize`/`ddspfFlags`/`caps` should be copied from the
 * original being replaced, to keep the rebuilt header internally consistent with
 * its layout. Previously `ddspfFlags` was hardcoded to DDPF_RGB alone, silently
 * dropping DDPF_ALPHAPIXELS (and `caps` was hardcoded, dropping legacy bits like
 * DDSCAPS_ALPHA) even when the original declared them and the image genuinely had
 * a meaningful alpha channel — confirmed by a real corrupted-in-game asset where
 * the rebuilt header claimed "no alpha" while its own aMask/pixel data still had
 * real per-pixel transparency, which a strict reader can use to just ignore alpha
 * entirely. Also fixed: `pitchOrLinearSize` used to fall back to `pixelData.length`
 * when `hasPitchFlag` was false, writing a nonzero value into a field the flags
 * declare as unused/invalid instead of the `0` the original actually had. */
export function buildRawRgbDdsFile(
  width: number,
  height: number,
  bitCount: number,
  rMask: number,
  gMask: number,
  bMask: number,
  aMask: number,
  pixelData: Uint8Array,
  hasPitchFlag: boolean,
  pitchOrLinearSize: number,
  ddspfFlags = DDPF_RGB,
  caps = 0x1000
): Uint8Array {
  const out = new Uint8Array(DDS_HEADER_SIZE + pixelData.length);
  const view = new DataView(out.buffer);
  out.set([0x44, 0x44, 0x53, 0x20], 0); // "DDS "
  view.setUint32(4, 124, true); // dwSize
  view.setUint32(8, 0x1007 | (hasPitchFlag ? DDSD_PITCH : 0), true); // CAPS|HEIGHT|WIDTH|PIXELFORMAT[|PITCH]
  view.setUint32(12, height, true);
  view.setUint32(16, width, true);
  view.setUint32(20, hasPitchFlag ? pitchOrLinearSize : 0, true); // pitchOrLinearSize
  view.setUint32(24, 0, true); // depth
  view.setUint32(28, 0, true); // mipMapCount
  view.setUint32(76, 32, true); // ddspf.dwSize
  view.setUint32(80, ddspfFlags, true); // ddspf.dwFlags
  view.setUint32(88, bitCount, true);
  view.setUint32(92, rMask, true);
  view.setUint32(96, gMask, true);
  view.setUint32(100, bMask, true);
  view.setUint32(104, aMask, true);
  view.setUint32(108, caps, true); // dwCaps
  out.set(pixelData, DDS_HEADER_SIZE);
  return out;
}
