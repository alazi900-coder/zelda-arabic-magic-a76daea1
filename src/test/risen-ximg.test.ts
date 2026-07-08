import { describe, it, expect } from "vitest";
import { extractDdsFromXimg, spliceReplacementDds, validateReplacementDds, buildDdsFile } from "@/lib/risen-ximg";
import { decodeDxt, encodeDXT1, decodeDXT1 } from "@/lib/risen-dxt-codec";
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
});
