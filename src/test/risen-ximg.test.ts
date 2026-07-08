import { describe, it, expect } from "vitest";
import { extractDdsFromXimg, spliceReplacementDds, validateReplacementDds, buildDdsFile, decodeDdsToRgba } from "@/lib/risen-ximg";
import { decodeDxt, encodeDXT1, decodeDXT1, decodeDXT5 } from "@/lib/risen-dxt-codec";
import { NUMBERS_XIMG_BASE64 } from "./fixtures/numbers-ximg-base64";

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Real Risen 1 file, 2,441 bytes — 128x16, DXT3. Confirmed byte-for-byte
 * against the actual game asset before being embedded here (see risen-ximg.ts docblock). */
const numbersXimg = base64ToBytes(NUMBERS_XIMG_BASE64);

describe("risen-ximg", () => {
  it("extracts the embedded DDS from a real .ximg file at the confirmed offset", () => {
    expect(numbersXimg.length).toBe(2441);
    const result = extractDdsFromXimg(numbersXimg);
    expect(result.ddsOffset).toBe(0x109);
    expect(result.width).toBe(128);
    expect(result.height).toBe(16);
    expect(result.fourCC).toBe("DXT3");
    expect(result.ddsBytes.length).toBe(2441 - 0x109);
  });

  it("rejects a buffer without the GR01IM04 magic", () => {
    const bad = new Uint8Array(64);
    expect(() => extractDdsFromXimg(bad)).toThrow();
  });

  it("decodes the real numbers.ximg DXT3 payload to RGBA without errors and with correct dimensions", () => {
    const { ddsBytes, width, height, fourCC } = extractDdsFromXimg(numbersXimg);
    expect(fourCC).toBe("DXT3");
    const compressed = ddsBytes.subarray(128); // skip the 128-byte DDS header
    const rgba = decodeDxt("DXT3", compressed, width, height);
    expect(rgba.length).toBe(width * height * 4);
  });

  it("round-trips a self-replacement byte-for-byte", () => {
    const { ddsBytes } = extractDdsFromXimg(numbersXimg);
    const rebuilt = spliceReplacementDds(numbersXimg, ddsBytes);
    expect(rebuilt.length).toBe(numbersXimg.length);
    expect(Array.from(rebuilt)).toEqual(Array.from(numbersXimg));
  });

  it("rejects a same-size-but-wrong-length replacement with a clear message and does not throw during validation", () => {
    const { width, height } = extractDdsFromXimg(numbersXimg);
    const wrongDds = buildDdsFile("DXT3", width + 4, height, new Uint8Array(((width + 4) * height) / 2));
    const validation = validateReplacementDds(numbersXimg, wrongDds);
    expect(validation.ok).toBe(false);
    expect(validation.reason).toMatch(/أبعاد/);
  });

  it("rejects mismatched fourCC even when dimensions match", () => {
    const { width, height } = extractDdsFromXimg(numbersXimg);
    const dxt1Bytes = new Uint8Array((width * height) / 2);
    const wrongFormat = buildDdsFile("DXT1", width, height, dxt1Bytes);
    const validation = validateReplacementDds(numbersXimg, wrongFormat);
    expect(validation.ok).toBe(false);
    expect(validation.reason).toMatch(/صيغة/);
  });

  it("throws instead of writing when spliceReplacementDds is given a different-size blob", () => {
    const { ddsBytes } = extractDdsFromXimg(numbersXimg);
    const truncated = ddsBytes.subarray(0, ddsBytes.length - 8);
    expect(() => spliceReplacementDds(numbersXimg, truncated)).toThrow();
  });

  it("DXT1 encode round-trip stays visually close to the source", () => {
    const width = 8, height = 8;
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // A smooth gradient — low per-block variance is what block compression handles well.
        const i = y * width + x;
        rgba[i * 4] = x * 32;
        rgba[i * 4 + 1] = y * 32;
        rgba[i * 4 + 2] = (x + y) * 16;
        rgba[i * 4 + 3] = 255;
      }
    }
    const compressed = encodeDXT1(rgba, width, height);
    const decoded = decodeDXT1(compressed, width, height);
    expect(decoded.length).toBe(rgba.length);

    let maxDiff = 0;
    for (let i = 0; i < rgba.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(rgba[i] - decoded[i]));
    }
    // Lossy block compression — allow a generous per-channel tolerance, not exact equality.
    expect(maxDiff).toBeLessThan(80);
  });

  it("decodes a hand-built DXT5 block to the correct RGBA values", () => {
    // alpha0=255, alpha1=0 (8-level interpolation), all 16 alpha indices = 0 -> alpha=255 everywhere.
    // color0 = pure red (RGB565 0xF800), color1 = pure blue (0x001F), all 16 color indices = 0 -> red everywhere.
    const block = new Uint8Array([
      0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // alpha0, alpha1, 6 index bytes (all 0)
      0x00, 0xf8, 0x1f, 0x00, 0x00, 0x00, 0x00, 0x00, // color0 LE, color1 LE, 4 index bytes (all 0)
    ]);
    const rgba = decodeDXT5(block, 4, 4);
    expect(rgba.length).toBe(4 * 4 * 4);
    for (let i = 0; i < 16; i++) {
      const o = i * 4;
      expect([rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]]).toEqual([255, 0, 0, 255]);
    }
  });

  it("decodeDdsToRgba also reaches DXT5 through the dispatcher (not just DXT1/DXT3)", () => {
    const block = new Uint8Array([
      0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0xf8, 0x1f, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    const dds = buildDdsFile("DXT5", 4, 4, block);
    const result = decodeDdsToRgba(dds);
    expect(result.supported).toBe(true);
    if (result.supported) {
      expect(result.fourCC).toBe("DXT5");
      expect([result.rgba[0], result.rgba[1], result.rgba[2], result.rgba[3]]).toEqual([255, 0, 0, 255]);
    }
  });

  /** Builds a synthetic 128-byte-header DDS with an uncompressed (DDPF_RGB) pixel format. */
  function buildRawRgbDds(
    width: number, height: number, bitCount: number,
    rMask: number, gMask: number, bMask: number, aMask: number,
    pixelData: Uint8Array
  ): Uint8Array {
    const out = new Uint8Array(128 + pixelData.length);
    const view = new DataView(out.buffer);
    out.set([0x44, 0x44, 0x53, 0x20], 0); // "DDS "
    view.setUint32(4, 124, true);
    view.setUint32(8, 0x1007, true); // CAPS|HEIGHT|WIDTH|PIXELFORMAT (no PITCH flag -> tightly packed)
    view.setUint32(12, height, true);
    view.setUint32(16, width, true);
    view.setUint32(76, 32, true); // ddspf.dwSize
    view.setUint32(80, 0x40, true); // ddspf.dwFlags = DDPF_RGB
    view.setUint32(88, bitCount, true);
    view.setUint32(92, rMask, true);
    view.setUint32(96, gMask, true);
    view.setUint32(100, bMask, true);
    view.setUint32(104, aMask, true);
    view.setUint32(108, 0x1000, true); // dwCaps
    out.set(pixelData, 128);
    return out;
  }

  it("decodes a synthetic 2x2 A8R8G8B8 (uncompressed) DDS to its exact colors", () => {
    // 32bpp, memory byte order per pixel is B,G,R,A (little-endian read of the masks below).
    const pixelData = new Uint8Array([
      0, 0, 255, 255, // pixel0: R=255 G=0   B=0   A=255
      0, 255, 0, 128, // pixel1: R=0   G=255 B=0   A=128
      255, 0, 0, 64, // pixel2: R=0   G=0   B=255 A=64
      30, 20, 10, 255, // pixel3: R=10  G=20  B=30  A=255
    ]);
    const dds = buildRawRgbDds(2, 2, 32, 0x00ff0000, 0x0000ff00, 0x000000ff, 0xff000000, pixelData);
    const result = decodeDdsToRgba(dds);
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.fourCC).toBe(""); // no FourCC for uncompressed formats
    const px = (i: number) => Array.from(result.rgba.subarray(i * 4, i * 4 + 4));
    expect(px(0)).toEqual([255, 0, 0, 255]);
    expect(px(1)).toEqual([0, 255, 0, 128]);
    expect(px(2)).toEqual([0, 0, 255, 64]);
    expect(px(3)).toEqual([10, 20, 30, 255]);
  });

  it("returns a diagnostic instead of throwing for an unrecognized format (e.g. DX10 fourCC)", () => {
    const dds = new Uint8Array(128 + 16);
    const view = new DataView(dds.buffer);
    dds.set([0x44, 0x44, 0x53, 0x20], 0); // "DDS "
    view.setUint32(4, 124, true);
    view.setUint32(12, 4, true); // height
    view.setUint32(16, 4, true); // width
    view.setUint32(76, 32, true);
    view.setUint32(80, 0x4, true); // ddspf.dwFlags = DDPF_FOURCC
    dds.set(new TextEncoder().encode("DX10"), 84);

    let result: ReturnType<typeof decodeDdsToRgba> | undefined;
    expect(() => { result = decodeDdsToRgba(dds); }).not.toThrow();
    expect(result?.supported).toBe(false);
    if (result && !result.supported) {
      expect(result.fourCC).toBe("DX10");
      expect(typeof result.ddspfFlags).toBe("number");
      expect(typeof result.rgbBitCount).toBe("number");
    }
  });

  it("returns a diagnostic with an empty fourCC when the pixel format has neither FourCC nor RGB flags", () => {
    const dds = new Uint8Array(128 + 16);
    const view = new DataView(dds.buffer);
    dds.set([0x44, 0x44, 0x53, 0x20], 0);
    view.setUint32(4, 124, true);
    view.setUint32(12, 4, true); // height
    view.setUint32(16, 4, true); // width
    view.setUint32(76, 32, true);
    view.setUint32(80, 0, true); // ddspf.dwFlags = 0 -> neither DDPF_FOURCC nor DDPF_RGB
    const result = decodeDdsToRgba(dds);
    expect(result.supported).toBe(false);
    if (!result.supported) expect(result.fourCC).toBe("");
  });
});
