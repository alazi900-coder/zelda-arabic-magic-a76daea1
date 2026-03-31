/**
 * WILAY (.wilay) file parser for Xenoblade Chronicles 1 DE / 2 / 3 / X DE.
 *
 * WILAY files contain UI textures.  Three magic variants exist:
 *   LAHD  (Dhal)  – XC1DE, XC2, XC3, XCXDE
 *   LAGP           – XC1DE, XC3, XCXDE
 *   LAPS           – XC2 only (no textures)
 *
 * Textures are stored as Mibl (LBIM) images – Tegra X1 swizzled, block-compressed.
 * Some files also embed uncompressed JPEG textures.
 *
 * Re-uses Tegra X1 deswizzle / BC decode helpers from wifnt-parser.
 */

import { decodeDXT1, decodeBC4 } from './wifnt-parser';

// ── Mibl helpers (shared with wifnt-parser) ──────────────────────────

const MIBL_FOOTER_SIZE = 40;

function divRoundUp(a: number, b: number): number { return Math.ceil(a / b); }
function pow2RoundUp(v: number): number {
  if (v <= 1) return 1;
  v--; v |= v >> 1; v |= v >> 2; v |= v >> 4; v |= v >> 8; v |= v >> 16;
  return v + 1;
}
function getBlockHeight(hInBytes: number): number {
  let bh = pow2RoundUp(divRoundUp(hInBytes, 8));
  if (bh > 16) bh = 16;
  if (bh < 1) bh = 1;
  return bh;
}
function isBC(fmt: number): boolean { return [66, 67, 68, 73, 75, 77, 80].includes(fmt); }
function bpp(fmt: number): number {
  switch (fmt) {
    case 66: case 73: return 8;          // BC1, BC4
    case 67: case 68: case 75: case 77: case 80: return 16; // BC2,BC3,BC5,BC7,BC6H
    case 1: return 1; case 37: case 109: return 4; case 41: return 8; case 57: return 2;
    default: return 8;
  }
}
function fmtName(fmt: number): string {
  const m: Record<number, string> = {
    1: 'R8', 37: 'RGBA8', 41: 'RGBA16F', 57: 'RGBA4',
    66: 'BC1', 67: 'BC2', 68: 'BC3', 73: 'BC4', 75: 'BC5', 77: 'BC7', 80: 'BC6H', 109: 'BGRA8',
  };
  return m[fmt] ?? `Unknown(${fmt})`;
}

// ── Tegra X1 deswizzle ───────────────────────────────────────────────

function getAddrBlockLinear(x: number, y: number, _w: number, bytesPerPx: number, blockH: number, gobsX: number): number {
  const xByte = x * bytesPerPx;
  const gobAddr =
    Math.floor(y / (8 * blockH)) * 512 * blockH * gobsX +
    Math.floor(xByte / 64) * 512 * blockH +
    Math.floor((y % (8 * blockH)) / 8) * 512;
  const xb = xByte;
  const inGob =
    (Math.floor((xb % 64) / 32) * 256) +
    (Math.floor((y % 8) / 2) * 64) +
    (Math.floor((xb % 32) / 16) * 32) +
    ((y % 2) * 16) +
    (xb % 16);
  return gobAddr + inGob;
}

function deswizzle(src: Uint8Array, wUnits: number, hUnits: number, bytesPerPx: number): Uint8Array {
  const byteW = wUnits * bytesPerPx;
  const gobsX = divRoundUp(byteW, 64);
  const blockH = getBlockHeight(hUnits);
  const out = new Uint8Array(wUnits * hUnits * bytesPerPx);
  for (let y = 0; y < hUnits; y++) {
    for (let x = 0; x < wUnits; x++) {
      const lin = (y * wUnits + x) * bytesPerPx;
      const sw = getAddrBlockLinear(x, y, wUnits, bytesPerPx, blockH, gobsX);
      if (sw + bytesPerPx <= src.length) {
        for (let b = 0; b < bytesPerPx; b++) out[lin + b] = src[sw + b];
      }
    }
  }
  return out;
}

function swizzle(src: Uint8Array, wUnits: number, hUnits: number, bytesPerPx: number): Uint8Array {
  const byteW = wUnits * bytesPerPx;
  const gobsX = divRoundUp(byteW, 64);
  const blockH = getBlockHeight(hUnits);
  const gobsY = divRoundUp(hUnits, 8 * blockH);
  const out = new Uint8Array(gobsX * gobsY * blockH * 512);
  for (let y = 0; y < hUnits; y++) {
    for (let x = 0; x < wUnits; x++) {
      const lin = (y * wUnits + x) * bytesPerPx;
      const sw = getAddrBlockLinear(x, y, wUnits, bytesPerPx, blockH, gobsX);
      if (lin + bytesPerPx <= src.length && sw + bytesPerPx <= out.length) {
        for (let b = 0; b < bytesPerPx; b++) out[sw + b] = src[lin + b];
      }
    }
  }
  return out;
}

// ── BC3 (DXT5) decoder ──────────────────────────────────────────────

function decodeBC3(data: Uint8Array, w: number, h: number): Uint8Array {
  const bx = Math.ceil(w / 4), by = Math.ceil(h / 4);
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < by; row++) {
    for (let col = 0; col < bx; col++) {
      const off = (row * bx + col) * 16;
      if (off + 16 > data.length) break;
      // Alpha block (same as BC4)
      const a0 = data[off], a1 = data[off + 1];
      const aPal = [a0, a1, 0, 0, 0, 0, 0, 0];
      if (a0 > a1) { for (let i = 1; i <= 6; i++) aPal[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7); }
      else { for (let i = 1; i <= 4; i++) aPal[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5); aPal[6] = 0; aPal[7] = 255; }
      const aBits = data.subarray(off + 2, off + 8);
      // Color block (same as BC1)
      const c0 = data[off + 8] | (data[off + 9] << 8);
      const c1 = data[off + 10] | (data[off + 11] << 8);
      const cols = [rgb565(c0), rgb565(c1), [0, 0, 0] as number[], [0, 0, 0] as number[]];
      cols[2] = cols[0].map((v, i) => Math.round((2 * v + cols[1][i]) / 3));
      cols[3] = cols[0].map((v, i) => Math.round((v + 2 * cols[1][i]) / 3));
      const idx32 = data[off + 12] | (data[off + 13] << 8) | (data[off + 14] << 16) | (data[off + 15] << 24);
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = col * 4 + px, y = row * 4 + py;
          if (x >= w || y >= h) continue;
          const pi = py * 4 + px;
          // alpha index
          const aBitOff = pi * 3;
          const aByteI = Math.floor(aBitOff / 8), aBitI = aBitOff % 8;
          let aIdx = (aBits[aByteI] >> aBitI) & 7;
          if (aBitI > 5) aIdx = ((aBits[aByteI] >> aBitI) | (aBits[aByteI + 1] << (8 - aBitI))) & 7;
          const ci = (idx32 >>> (pi * 2)) & 3;
          const o = (y * w + x) * 4;
          out[o] = cols[ci][0]; out[o + 1] = cols[ci][1]; out[o + 2] = cols[ci][2]; out[o + 3] = aPal[aIdx];
        }
      }
    }
  }
  return out;
}

// ── BC7 decoder (mode 6 fast path + basic modes) ─────────────────────

function decodeBC7(data: Uint8Array, w: number, h: number): Uint8Array {
  const bx = Math.ceil(w / 4), by = Math.ceil(h / 4);
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < by; row++) {
    for (let col = 0; col < bx; col++) {
      const off = (row * bx + col) * 16;
      if (off + 16 > data.length) break;
      // Detect mode from first byte's trailing zeros
      const b0 = data[off];
      let mode = -1;
      for (let m = 0; m < 8; m++) { if (b0 & (1 << m)) { mode = m; break; } }
      // For simplicity, decode mode 6 fully (most common) and fallback to gray for others
      let rgba: [number, number, number, number][] | null = null;
      if (mode === 6) rgba = decodeBC7Mode6(data, off);
      if (!rgba) {
        // Fallback: treat as uniform gray
        rgba = Array(16).fill([128, 128, 128, 255]) as [number, number, number, number][];
      }
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = col * 4 + px, y = row * 4 + py;
          if (x >= w || y >= h) continue;
          const c = rgba[py * 4 + px];
          const o = (y * w + x) * 4;
          out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = c[3];
        }
      }
    }
  }
  return out;
}

function decodeBC7Mode6(data: Uint8Array, off: number): [number, number, number, number][] {
  // Mode 6: 1 subset, 7-bit endpoints RGBA, 4-bit indices, 1 p-bit per endpoint
  // bit layout: [0] mode bit (bit 6), then 7 bits R0, 7 R1, 7 G0, 7 G1, 7 B0, 7 B1, 7 A0, 7 A1, 1 P0, 1 P1, 63 index bits
  const bits = new Uint8Array(data.buffer, data.byteOffset + off, 16);
  let bitPos = 7; // skip mode bits (7 zeros + 1)

  function readBits(n: number): number {
    let val = 0;
    for (let i = 0; i < n; i++) {
      const byteI = Math.floor(bitPos / 8);
      const bitI = bitPos % 8;
      val |= ((bits[byteI] >> bitI) & 1) << i;
      bitPos++;
    }
    return val;
  }

  const r0 = readBits(7), r1 = readBits(7);
  const g0 = readBits(7), g1 = readBits(7);
  const b0 = readBits(7), b1 = readBits(7);
  const a0 = readBits(7), a1 = readBits(7);
  const p0 = readBits(1), p1 = readBits(1);

  // Expand 7+1 p-bit to 8 bits
  const ep = [
    [(r0 << 1) | p0, (g0 << 1) | p0, (b0 << 1) | p0, (a0 << 1) | p0],
    [(r1 << 1) | p1, (g1 << 1) | p1, (b1 << 1) | p1, (a1 << 1) | p1],
  ];

  // Read 16 4-bit indices (anchor index 0 is 3-bit)
  const indices: number[] = [];
  indices.push(readBits(3)); // anchor
  for (let i = 1; i < 16; i++) indices.push(readBits(4));

  const result: [number, number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const w4 = indices[i];
    const iw = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15][w4]; // weight
    const c: [number, number, number, number] = [0, 0, 0, 0];
    for (let ch = 0; ch < 4; ch++) {
      c[ch] = Math.round(((64 - iw) * ep[0][ch] + iw * ep[1][ch] + 32) / 64);
      if (c[ch] > 255) c[ch] = 255;
    }
    result.push(c);
  }
  return result;
}

function rgb565(c: number): number[] {
  return [
    Math.round(((c >> 11) & 0x1F) * 255 / 31),
    Math.round(((c >> 5) & 0x3F) * 255 / 63),
    Math.round((c & 0x1F) * 255 / 31),
  ];
}

// ── Mibl decoder ─────────────────────────────────────────────────────

interface MiblFooter {
  imageSize: number; unk: number; width: number; height: number;
  depth: number; viewDimension: number; imageFormat: number;
  mipmapCount: number; version: number;
}

function parseMiblFooter(buf: Uint8Array): MiblFooter | null {
  if (buf.length < MIBL_FOOTER_SIZE) return null;
  const off = buf.length - MIBL_FOOTER_SIZE;
  if (buf[off + 36] !== 0x4C || buf[off + 37] !== 0x42 || buf[off + 38] !== 0x49 || buf[off + 39] !== 0x4D) return null;
  const v = new DataView(buf.buffer, buf.byteOffset + off, MIBL_FOOTER_SIZE);
  return {
    imageSize: v.getUint32(0, true), unk: v.getUint32(4, true),
    width: v.getUint32(8, true), height: v.getUint32(12, true),
    depth: v.getUint32(16, true), viewDimension: v.getUint32(20, true),
    imageFormat: v.getUint32(24, true), mipmapCount: v.getUint32(28, true),
    version: v.getUint32(32, true),
  };
}

function decodeMiblToRGBA(miblData: Uint8Array): { rgba: Uint8Array; width: number; height: number; footer: MiblFooter } | null {
  const footer = parseMiblFooter(miblData);
  if (!footer) return null;

  const fmt = footer.imageFormat;
  const w = footer.width, h = footer.height;
  const bc = isBC(fmt);
  const bytesPerPx = bpp(fmt);

  // Compute swizzled size for mip 0 only
  let wU: number, hU: number;
  if (bc) { wU = divRoundUp(w, 4); hU = divRoundUp(h, 4); }
  else { wU = w; hU = h; }

  const linear = deswizzle(miblData, wU, hU, bytesPerPx);

  let rgba: Uint8Array;
  switch (fmt) {
    case 66: rgba = decodeDXT1(linear, w, h); break;
    case 73: rgba = decodeBC4(linear, w, h); break;
    case 68: rgba = decodeBC3(linear, w, h); break;
    case 77: rgba = decodeBC7(linear, w, h); break;
    case 37: // RGBA8 – already decoded
      rgba = new Uint8Array(w * h * 4);
      rgba.set(bc ? linear : deswizzle(miblData, w, h, 4));
      break;
    case 109: // BGRA8 → RGBA8
      rgba = new Uint8Array(w * h * 4);
      const src = deswizzle(miblData, w, h, 4);
      for (let i = 0; i < w * h; i++) {
        rgba[i * 4] = src[i * 4 + 2]; rgba[i * 4 + 1] = src[i * 4 + 1];
        rgba[i * 4 + 2] = src[i * 4]; rgba[i * 4 + 3] = src[i * 4 + 3];
      }
      break;
    default:
      // Unsupported format – show as gray
      rgba = new Uint8Array(w * h * 4);
      for (let i = 0; i < w * h; i++) { rgba[i * 4] = 128; rgba[i * 4 + 1] = 128; rgba[i * 4 + 2] = 128; rgba[i * 4 + 3] = 255; }
  }

  return { rgba, width: w, height: h, footer };
}

// ── Public types ─────────────────────────────────────────────────────

export interface WilayTextureInfo {
  index: number;
  /** Offset of mibl_data within the WILAY file */
  dataOffset: number;
  /** Size of mibl_data */
  dataSize: number;
  /** Mibl footer, if parseable */
  footer: MiblFooter | null;
  width: number;
  height: number;
  formatName: string;
  /** 'mibl' or 'jpeg' */
  type: 'mibl' | 'jpeg';
}

export interface WilayInfo {
  magic: string;
  version: number;
  fileSize: number;
  textures: WilayTextureInfo[];
  valid: boolean;
}

// ── WILAY parser ─────────────────────────────────────────────────────

export function analyzeWilay(data: ArrayBuffer): WilayInfo {
  const bytes = new Uint8Array(data);
  if (data.byteLength < 12) return { magic: '????', version: 0, fileSize: data.byteLength, textures: [], valid: false };

  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const valid = magic === 'LAHD' || magic === 'LAGP' || magic === 'LAPS';
  if (!valid) return { magic, version: 0, fileSize: data.byteLength, textures: [], valid: false };

  const view = new DataView(data);
  const version = view.getUint32(4, true);

  const textures: WilayTextureInfo[] = [];

  if (magic === 'LAPS') {
    // LAPS has no textures
    return { magic, version, fileSize: data.byteLength, textures, valid };
  }

  // Both LAHD and LAGP store textures pointer at offset 36 (7th u32 after magic+version+unk0)
  // and uncompressed_textures (JPEG) at offset 68 for LAHD
  const texturesPtr = data.byteLength >= 40 ? view.getUint32(36, true) : 0;
  const uncompressedPtr = (magic === 'LAHD' && data.byteLength >= 72) ? view.getUint32(68, true) : 0;

  // Parse Mibl textures
  if (texturesPtr > 0 && texturesPtr + 8 <= data.byteLength) {
    try {
      const texBase = texturesPtr;
      const itemsOffset = view.getUint32(texBase, true);
      const itemsCount = view.getUint32(texBase + 4, true);

      const itemsStart = texBase + itemsOffset;
      // Each Texture item: unk1(u32) + data_offset(u32) + data_count(u32) = 12 bytes
      for (let i = 0; i < itemsCount; i++) {
        const itemOff = itemsStart + i * 12;
        if (itemOff + 12 > data.byteLength) break;

        const _unk1 = view.getUint32(itemOff, true);
        const dOff = view.getUint32(itemOff + 4, true);
        const dSize = view.getUint32(itemOff + 8, true);

        const absOff = texBase + dOff;
        if (absOff + dSize > data.byteLength || dSize === 0) continue;

        const miblBuf = bytes.subarray(absOff, absOff + dSize);
        const footer = parseMiblFooter(miblBuf);

        textures.push({
          index: textures.length,
          dataOffset: absOff,
          dataSize: dSize,
          footer,
          width: footer?.width ?? 0,
          height: footer?.height ?? 0,
          formatName: footer ? fmtName(footer.imageFormat) : 'Unknown',
          type: 'mibl',
        });
      }
    } catch (e) {
      console.warn('[WILAY] Failed to parse textures section:', e);
    }
  }

  // Parse uncompressed JPEG textures
  if (uncompressedPtr > 0 && uncompressedPtr + 8 <= data.byteLength) {
    try {
      const ucBase = uncompressedPtr;
      const ucItemsOff = view.getUint32(ucBase, true);
      const ucItemsCount = view.getUint32(ucBase + 4, true);

      for (let i = 0; i < ucItemsCount; i++) {
        const itemOff = ucBase + ucItemsOff + i * 16; // jpeg_offset(u32) + jpeg_size(u32) + unk3(u32) + unk4(u32)
        if (itemOff + 16 > data.byteLength) break;

        const jpegOff = view.getUint32(itemOff, true);
        const jpegSize = view.getUint32(itemOff + 4, true);
        // JPEG offsets might be absolute or relative
        const absOff = jpegOff < data.byteLength ? jpegOff : ucBase + jpegOff;
        if (absOff + jpegSize > data.byteLength || jpegSize === 0) continue;

        textures.push({
          index: textures.length,
          dataOffset: absOff,
          dataSize: jpegSize,
          footer: null,
          width: 0, height: 0,
          formatName: 'JPEG',
          type: 'jpeg',
        });
      }
    } catch (e) {
      console.warn('[WILAY] Failed to parse uncompressed textures:', e);
    }
  }

  // If pointer-based parsing failed, scan for embedded LBIM footers
  if (textures.length === 0) {
    scanForMiblTextures(bytes, textures);
  }

  return { magic, version, fileSize: data.byteLength, textures, valid };
}

/** Fallback: scan entire file for LBIM footers to discover embedded textures */
function scanForMiblTextures(bytes: Uint8Array, textures: WilayTextureInfo[]): void {
  // LBIM magic = 0x4C 0x42 0x49 0x4D
  for (let i = MIBL_FOOTER_SIZE; i <= bytes.length - 4; i++) {
    if (bytes[i] === 0x4C && bytes[i + 1] === 0x42 && bytes[i + 2] === 0x49 && bytes[i + 3] === 0x4D) {
      // Footer starts 36 bytes before magic
      const footerStart = i - 36;
      if (footerStart < 0) continue;
      const miblEnd = i + 4; // end of footer
      const sub = bytes.subarray(footerStart, miblEnd);
      const footer = parseMiblFooter(sub);
      if (!footer || footer.width === 0 || footer.height === 0 || footer.width > 8192 || footer.height > 8192) continue;

      // The image data starts imageSize bytes before the footer
      const imgStart = miblEnd - footer.imageSize - MIBL_FOOTER_SIZE;
      const dataStart = Math.max(0, imgStart);
      const dataSize = miblEnd - dataStart;

      textures.push({
        index: textures.length,
        dataOffset: dataStart,
        dataSize,
        footer,
        width: footer.width,
        height: footer.height,
        formatName: fmtName(footer.imageFormat),
        type: 'mibl',
      });
    }
  }
}

// ── Decode texture to RGBA canvas ────────────────────────────────────

export function decodeWilayTexture(
  fileData: ArrayBuffer,
  tex: WilayTextureInfo
): { canvas: HTMLCanvasElement; width: number; height: number } | null {
  const bytes = new Uint8Array(fileData);

  if (tex.type === 'jpeg') {
    // Decode JPEG using browser
    return null; // handled asynchronously via decodeWilayTextureAsync
  }

  const miblBuf = bytes.slice(tex.dataOffset, tex.dataOffset + tex.dataSize);
  const result = decodeMiblToRGBA(miblBuf);
  if (!result) return null;

  const canvas = document.createElement('canvas');
  canvas.width = result.width;
  canvas.height = result.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const imgData = new ImageData(new Uint8ClampedArray(result.rgba), result.width, result.height);
  ctx.putImageData(imgData, 0, 0);
  return { canvas, width: result.width, height: result.height };
}

/** Async decoder that also handles JPEG textures */
export async function decodeWilayTextureAsync(
  fileData: ArrayBuffer,
  tex: WilayTextureInfo
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number } | null> {
  if (tex.type === 'jpeg') {
    const jpegBytes = new Uint8Array(fileData, tex.dataOffset, tex.dataSize);
    const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url; });
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return { canvas, width: img.width, height: img.height };
    } finally { URL.revokeObjectURL(url); }
  }

  return decodeWilayTexture(fileData, tex);
}

// ── Export texture as PNG blob ────────────────────────────────────────

export async function exportWilayTextureAsPNG(
  fileData: ArrayBuffer,
  tex: WilayTextureInfo
): Promise<Blob | null> {
  const result = await decodeWilayTextureAsync(fileData, tex);
  if (!result) return null;
  return new Promise(resolve => {
    result.canvas.toBlob(blob => resolve(blob), 'image/png');
  });
}

// ── Replace texture in WILAY file ────────────────────────────────────

export function replaceWilayTexture(
  originalFile: ArrayBuffer,
  tex: WilayTextureInfo,
  newRGBA: Uint8Array,
  newWidth: number,
  newHeight: number
): ArrayBuffer | null {
  if (tex.type !== 'mibl' || !tex.footer) return null;

  const fmt = tex.footer.imageFormat;
  const bytesPerPx = bpp(fmt);
  const bc = isBC(fmt);

  // Encode RGBA → compressed format
  let linearBC: Uint8Array;
  switch (fmt) {
    case 66: linearBC = encodeDXT1Simple(newRGBA, newWidth, newHeight); break;
    case 73: linearBC = encodeBC4Simple(newRGBA, newWidth, newHeight); break;
    // For BC3/BC7 we can't easily encode, so fall back to BC1
    default: linearBC = encodeDXT1Simple(newRGBA, newWidth, newHeight); break;
  }

  // Swizzle
  let wU: number, hU: number;
  if (bc) { wU = divRoundUp(newWidth, 4); hU = divRoundUp(newHeight, 4); }
  else { wU = newWidth; hU = newHeight; }
  const swizzled = swizzle(linearBC, wU, hU, bytesPerPx);

  // Build new Mibl data: swizzled + padding + footer
  const alignedSize = Math.ceil(swizzled.length / 4096) * 4096;
  const paddingSize = alignedSize - swizzled.length;
  const needExtraPage = paddingSize < MIBL_FOOTER_SIZE;
  const totalMiblSize = needExtraPage ? alignedSize + 4096 : alignedSize;

  const newMibl = new Uint8Array(totalMiblSize);
  newMibl.set(swizzled);
  // Write footer at end
  const footerOff = totalMiblSize - MIBL_FOOTER_SIZE;
  const fv = new DataView(newMibl.buffer, footerOff, MIBL_FOOTER_SIZE);
  fv.setUint32(0, alignedSize, true); // imageSize
  fv.setUint32(4, 4096, true); // unk
  fv.setUint32(8, newWidth, true);
  fv.setUint32(12, newHeight, true);
  fv.setUint32(16, tex.footer.depth, true);
  fv.setUint32(20, tex.footer.viewDimension, true);
  fv.setUint32(24, fmt, true);
  fv.setUint32(28, 1, true); // mipmap count
  fv.setUint32(32, tex.footer.version, true);
  newMibl[footerOff + 36] = 0x4C; newMibl[footerOff + 37] = 0x42;
  newMibl[footerOff + 38] = 0x49; newMibl[footerOff + 39] = 0x4D;

  // Replace in original file
  const orig = new Uint8Array(originalFile);
  const sizeDiff = newMibl.length - tex.dataSize;
  const result = new Uint8Array(orig.length + sizeDiff);

  // Copy before texture
  result.set(orig.subarray(0, tex.dataOffset));
  // Insert new texture
  result.set(newMibl, tex.dataOffset);
  // Copy after texture
  result.set(orig.subarray(tex.dataOffset + tex.dataSize), tex.dataOffset + newMibl.length);

  // Update the size in the Textures entry (data_count field)
  // Find the entry that references this texture's offset
  // The entry's data_count is stored 8 bytes after unk1 in the 12-byte entry
  // We need to scan for matching offset values
  const rv = new DataView(result.buffer);
  // Update any offset32_count32 pair that references this data
  // The textures section stores offset relative to its base
  const texturesPtr = rv.getUint32(36, true);
  if (texturesPtr > 0 && texturesPtr + 8 <= result.length) {
    const texBase = texturesPtr;
    const itemsOffset = rv.getUint32(texBase, true);
    const itemsCount = rv.getUint32(texBase + 4, true);
    const itemsStart = texBase + itemsOffset;

    for (let i = 0; i < itemsCount; i++) {
      const itemOff = itemsStart + i * 12;
      if (itemOff + 12 > result.length) break;
      const dOff = rv.getUint32(itemOff + 4, true);
      const absOff = texBase + dOff;
      if (absOff === tex.dataOffset) {
        rv.setUint32(itemOff + 8, newMibl.length, true);
        break;
      }
    }

    // If size changed, need to update subsequent texture offsets
    if (sizeDiff !== 0) {
      for (let i = 0; i < itemsCount; i++) {
        const itemOff = itemsStart + i * 12;
        if (itemOff + 12 > result.length) break;
        const dOff = rv.getUint32(itemOff + 4, true);
        const absOff = texBase + dOff;
        if (absOff > tex.dataOffset) {
          rv.setUint32(itemOff + 4, dOff + sizeDiff, true);
        }
      }
    }
  }

  return result.buffer;
}

// Simple BC1 encoder (reuse logic from wifnt-parser)
function encodeDXT1Simple(pixels: Uint8Array, w: number, h: number): Uint8Array {
  const bx = Math.ceil(w / 4), by = Math.ceil(h / 4);
  const out = new Uint8Array(bx * by * 8);
  for (let row = 0; row < by; row++) {
    for (let col = 0; col < bx; col++) {
      let minR = 255, minG = 255, minB = 255, maxR = 0, maxG = 0, maxB = 0;
      const block: number[][] = [];
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = col * 4 + px, y = row * 4 + py;
          const i = x < w && y < h ? (y * w + x) * 4 : -1;
          const r = i >= 0 ? pixels[i] : 0, g = i >= 0 ? pixels[i + 1] : 0, b = i >= 0 ? pixels[i + 2] : 0;
          block.push([r, g, b]);
          if (r < minR) minR = r; if (r > maxR) maxR = r;
          if (g < minG) minG = g; if (g > maxG) maxG = g;
          if (b < minB) minB = b; if (b > maxB) maxB = b;
        }
      }
      let c0 = ((maxR >> 3) << 11) | ((maxG >> 2) << 5) | (maxB >> 3);
      let c1 = ((minR >> 3) << 11) | ((minG >> 2) << 5) | (minB >> 3);
      if (c0 < c1) { const t = c0; c0 = c1; c1 = t; }
      if (c0 === c1 && c0 < 0xFFFF) c0++;
      const cols = [rgb565(c0), rgb565(c1),
        rgb565(c0).map((v, i) => Math.round((2 * v + rgb565(c1)[i]) / 3)),
        rgb565(c0).map((v, i) => Math.round((v + 2 * rgb565(c1)[i]) / 3))];
      let idx = 0;
      for (let i = 0; i < 16; i++) {
        let best = 0, bestD = Infinity;
        for (let ci = 0; ci < 4; ci++) {
          const dr = block[i][0] - cols[ci][0], dg = block[i][1] - cols[ci][1], db = block[i][2] - cols[ci][2];
          const d = dr * dr + dg * dg + db * db;
          if (d < bestD) { bestD = d; best = ci; }
        }
        idx |= best << (i * 2);
      }
      const off = (row * bx + col) * 8;
      out[off] = c0 & 0xFF; out[off + 1] = (c0 >> 8) & 0xFF;
      out[off + 2] = c1 & 0xFF; out[off + 3] = (c1 >> 8) & 0xFF;
      out[off + 4] = idx & 0xFF; out[off + 5] = (idx >> 8) & 0xFF;
      out[off + 6] = (idx >> 16) & 0xFF; out[off + 7] = (idx >> 24) & 0xFF;
    }
  }
  return out;
}

function encodeBC4Simple(pixels: Uint8Array, w: number, h: number): Uint8Array {
  const bx = Math.ceil(w / 4), by = Math.ceil(h / 4);
  const out = new Uint8Array(bx * by * 8);
  for (let row = 0; row < by; row++) {
    for (let col = 0; col < bx; col++) {
      const alphas: number[] = [];
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = col * 4 + px, y = row * 4 + py;
          alphas.push(x < w && y < h ? pixels[(y * w + x) * 4 + 3] : 0);
        }
      }
      let minA = 255, maxA = 0;
      for (const a of alphas) { if (a < minA) minA = a; if (a > maxA) maxA = a; }
      const a0 = maxA, a1 = minA;
      const pal = [a0, a1, 0, 0, 0, 0, 0, 0];
      if (a0 > a1) { for (let i = 1; i <= 6; i++) pal[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7); }
      else { for (let i = 1; i <= 4; i++) pal[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5); pal[6] = 0; pal[7] = 255; }
      const indices: number[] = [];
      for (const a of alphas) {
        let best = 0, bestD = Infinity;
        for (let ci = 0; ci < 8; ci++) { const d = Math.abs(a - pal[ci]); if (d < bestD) { bestD = d; best = ci; } }
        indices.push(best);
      }
      const off = (row * bx + col) * 8;
      out[off] = a0; out[off + 1] = a1;
      const bits = new Uint8Array(6);
      for (let i = 0; i < 16; i++) {
        const bo = i * 3, bi = Math.floor(bo / 8), br = bo % 8;
        bits[bi] |= (indices[i] & 7) << br;
        if (br > 5 && bi + 1 < 6) bits[bi + 1] |= (indices[i] & 7) >> (8 - br);
      }
      for (let i = 0; i < 6; i++) out[off + 2 + i] = bits[i];
    }
  }
  return out;
}
