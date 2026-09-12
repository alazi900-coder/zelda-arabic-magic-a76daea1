import { describe, expect, it } from "vitest";
import { decodeRgba8Tiled, encodeRgba8Tiled, GL_FORMAT_RGBA8 } from "./pica-texture";

describe("pica-texture", () => {
  it("round-trips encode -> decode for a gradient image", () => {
    const w = 16, h = 8;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        rgba[i] = (x * 16) & 0xff;
        rgba[i + 1] = (y * 32) & 0xff;
        rgba[i + 2] = 128;
        rgba[i + 3] = x === 0 ? 0 : 255; // exercise a transparent column too
      }
    }
    const encoded = encodeRgba8Tiled(w, h, rgba);
    expect(encoded.length).toBe(w * h * 4);
    const decoded = decodeRgba8Tiled(w, h, encoded);
    expect(Array.from(decoded)).toEqual(Array.from(rgba));
  });

  it("packs each pixel as A,B,G,R in file order (so a little-endian u32 read gives RGBA)", () => {
    // A single 8x8 tile, first pixel (0,0) is Morton index 0 -> first 4 bytes.
    const rgba = new Uint8ClampedArray(8 * 8 * 4);
    rgba[0] = 0x11; // R
    rgba[1] = 0x22; // G
    rgba[2] = 0x33; // B
    rgba[3] = 0x44; // A
    const encoded = encodeRgba8Tiled(8, 8, rgba);
    expect(Array.from(encoded.slice(0, 4))).toEqual([0x44, 0x33, 0x22, 0x11]);
  });

  it("rejects dimensions that aren't multiples of the 8x8 tile size", () => {
    expect(() => encodeRgba8Tiled(10, 8, new Uint8ClampedArray(10 * 8 * 4))).toThrow();
  });

  it("exports the RGBA8 GL format constant used to tag these textures", () => {
    expect(GL_FORMAT_RGBA8).toBe(0x14016752);
  });
});
