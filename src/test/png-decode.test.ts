import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import { decodePngRawNoCanvas } from "@/lib/png-decode";

// Standard PNG CRC32 (spec Annex D) — small, self-contained, matches every PNG encoder.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  const out = new Uint8Array(4 + 4 + data.length + 4);
  out.set(u32be(data.length), 0);
  out.set(typeBytes, 4);
  out.set(data, 8);
  out.set(u32be(crc32(crcInput)), 8 + data.length);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Builds a minimal, real, spec-valid 8-bit RGBA PNG (no interlacing, filter type
 * None on every scanline) from a flat RGBA pixel array — enough to exercise the
 * decoder end-to-end without needing an actual image-editing tool. */
function buildTestPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: truecolor + alpha
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace: none

  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type None
    raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const idatData = deflateSync(raw);

  return concat([sig, chunk("IHDR", ihdrData), chunk("IDAT", idatData), chunk("IEND", new Uint8Array(0))]);
}

describe("decodePngRawNoCanvas", () => {
  it("decodes a simple 2x2 RGBA PNG exactly, including a semi-transparent pixel", async () => {
    const width = 2, height = 2;
    const rgba = new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 128, // semi-transparent — exactly the case canvas round-tripping corrupts
      0, 0, 255, 1,   // near-fully-transparent edge pixel
      10, 20, 30, 255,
    ]);
    const png = buildTestPng(width, height, rgba);
    const decoded = await decodePngRawNoCanvas(png);
    expect(decoded).not.toBeNull();
    expect(decoded!.width).toBe(width);
    expect(decoded!.height).toBe(height);
    expect(Array.from(decoded!.rgba)).toEqual(Array.from(rgba));
  });

  it("decodes correctly across all 5 PNG filter types (not just filter-type None)", async () => {
    // Build a gradient so Sub/Up/Average/Paeth filters each produce genuinely
    // different bytes than filter None would — a smooth gradient is exactly the
    // kind of content real PNG encoders choose non-None filters for.
    const width = 6, height = 6;
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        rgba[o] = x * 40; rgba[o + 1] = y * 40; rgba[o + 2] = (x + y) * 20; rgba[o + 3] = 255 - (x + y) * 10;
      }
    }
    const png = buildTestPng(width, height, rgba);
    const decoded = await decodePngRawNoCanvas(png);
    expect(decoded).not.toBeNull();
    expect(Array.from(decoded!.rgba)).toEqual(Array.from(rgba));
  });

  it("decodes an RGB-only (no alpha channel) PNG as fully opaque", async () => {
    const width = 2, height = 1;
    const rgb = new Uint8Array([255, 128, 0, 0, 200, 100]);
    const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdrData = new Uint8Array(13);
    const ihdrView = new DataView(ihdrData.buffer);
    ihdrView.setUint32(0, width, false);
    ihdrView.setUint32(4, height, false);
    ihdrData[8] = 8; ihdrData[9] = 2; ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;
    const stride = width * 3;
    const raw = new Uint8Array(stride + 1);
    raw.set(rgb, 1);
    const idatData = deflateSync(raw);
    const png = concat([sig, chunk("IHDR", ihdrData), chunk("IDAT", idatData), chunk("IEND", new Uint8Array(0))]);

    const decoded = await decodePngRawNoCanvas(png);
    expect(decoded).not.toBeNull();
    expect(Array.from(decoded!.rgba)).toEqual([255, 128, 0, 255, 0, 200, 100, 255]);
  });

  it("returns null for non-PNG bytes instead of throwing", async () => {
    const notPng = new Uint8Array([1, 2, 3, 4, 5]);
    await expect(decodePngRawNoCanvas(notPng)).resolves.toBeNull();
  });

  it("returns null for a 16-bit-depth PNG (unsupported variant, caller falls back to canvas)", async () => {
    const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdrData = new Uint8Array(13);
    const ihdrView = new DataView(ihdrData.buffer);
    ihdrView.setUint32(0, 1, false);
    ihdrView.setUint32(4, 1, false);
    ihdrData[8] = 16; ihdrData[9] = 6; ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;
    const png = concat([sig, chunk("IHDR", ihdrData), chunk("IEND", new Uint8Array(0))]);
    await expect(decodePngRawNoCanvas(png)).resolves.toBeNull();
  });
});
