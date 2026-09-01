import { describe, expect, it } from "vitest";
import { decodeFe12Glyph, encodeFe12Glyph, readFe12Font, writeFe12GlyphInPlace, type Fe12Raster } from "./fe12-font";
import { buildSyntheticFont } from "./fe12-font-test-fixtures";

function makeRaster(pattern: (x: number, y: number) => number): Fe12Raster {
  return Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => pattern(x, y)));
}

const PATTERNS: Record<string, Fe12Raster> = {
  empty: makeRaster(() => 0),
  solidLow: makeRaster(() => 1),
  solidHigh: makeRaster(() => 15),
  checkerboard: makeRaster((x, y) => ((x + y) % 2 === 0 ? 15 : 0)),
  diagonal: makeRaster((x, y) => (x === y ? 12 : 0)),
  sparse: makeRaster((x, y) => (x === 3 && y === 5 ? 9 : x === 12 && y === 11 ? 4 : 0)),
  gradient: makeRaster((x) => x % 16),
};

describe("fe12-font glyph codec", () => {
  for (const [name, raster] of Object.entries(PATTERNS)) {
    it(`round-trips the "${name}" raster pixel-for-pixel`, () => {
      const encoded = encodeFe12Glyph(raster);
      const buffer = new Uint8Array(encoded.length + 16); // padding, matches how real glyphs sit inside a bigger file
      buffer.set(encoded, 0);
      const { raster: decoded, byteLength } = decodeFe12Glyph(buffer, 0);
      expect(decoded).toEqual(raster);
      expect(byteLength).toBe(encoded.length);
    });
  }

  it("builds a minimal font, reads its glyph list, and decodes a known glyph", () => {
    const buffer = buildSyntheticFont([{ code: 0x8341, width: 10, raster: PATTERNS.checkerboard }]);

    const glyphs = readFe12Font(buffer);
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].code).toBe(0x8341);
    expect(glyphs[0].width).toBe(10);

    const { raster } = decodeFe12Glyph(buffer, glyphs[0].glyphAbs);
    expect(raster).toEqual(PATTERNS.checkerboard);
  });

  it("writeFe12GlyphInPlace refuses a replacement that doesn't fit the original slot's budget", () => {
    const original = encodeFe12Glyph(PATTERNS.empty); // tiny — one all-zero-run token
    const buffer = new Uint8Array(original.length);
    buffer.set(original, 0);
    const slot = { code: 0x8341, width: 10, glyphAbs: 0, entryAbs: 100 };
    expect(() => writeFe12GlyphInPlace(buffer, slot, PATTERNS.checkerboard)).toThrow();
  });

  it("writeFe12GlyphInPlace overwrites the raster and width when it fits", () => {
    const original = encodeFe12Glyph(PATTERNS.checkerboard); // plenty of budget
    const glyphAbs = 8; // a real entry table (0-7) sits before the glyph data, like the real format
    const buffer = new Uint8Array(glyphAbs + original.length + 32);
    buffer.set(original, glyphAbs);
    const entryAbs = 0;
    const slot = { code: 0x8341, width: 10, glyphAbs, entryAbs };
    writeFe12GlyphInPlace(buffer, slot, PATTERNS.sparse, 6);
    const { raster } = decodeFe12Glyph(buffer, glyphAbs);
    expect(raster).toEqual(PATTERNS.sparse);
    const view = new DataView(buffer.buffer);
    expect(view.getUint16(entryAbs + 2, true)).toBe(6);
  });
});
