import { describe, expect, it } from "vitest";
import {
  patchInazumaFont12,
  patchInazumaFont8,
  inazumaArabicGlyphBytes,
  encodeInazumaArabicText,
  analyzeInazumaUnsupportedCharacters,
  addInazumaByteMap,
  INAZUMA_ARABIC_BYTES,
} from "../inazuma-arabic-font";
import { INAZUMA_ARABIC_CODEPOINTS, INAZUMA_SHIFT_JIS_CODES, INAZUMA_GLYPH_INDICES } from "../inazuma-arabic-glyphs";

/**
 * A minimal FONT12-shaped NFTR: FNIF(16) + PLGC header(16) + N glyph tiles +
 * HDWC header(16) + N width triplets. `glyphCount` must reach past the
 * largest index in INAZUMA_GLYPH_INDICES so every patched slot exists.
 */
function buildFont12Fixture(glyphCount: number): Uint8Array {
  const tileBytes = 17;
  const plgcSize = 16 + glyphCount * tileBytes;
  const hdwcSize = 16 + glyphCount * 3;
  const total = 0x10 + plgcSize + hdwcSize;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  // FNIF (16 bytes here; real one is 32, but nothing reads past 0x10 in this module)
  out.set([0x46, 0x4e, 0x49, 0x46], 0);
  view.setUint32(4, 16, true);

  // PLGC
  const plgcAt = 0x10;
  out.set([0x50, 0x4c, 0x47, 0x43], plgcAt);
  view.setUint32(plgcAt + 4, plgcSize, true);
  out[plgcAt + 8] = 11; // char_w
  out[plgcAt + 9] = 12; // char_h
  view.setUint16(plgcAt + 10, tileBytes, true);
  // fill every existing tile with a recognizable non-zero marker, so a test
  // can prove untouched glyphs stay exactly as they were.
  for (let i = 0; i < glyphCount * tileBytes; i++) out[plgcAt + 16 + i] = 0xaa;

  // HDWC
  const hdwcAt = plgcAt + plgcSize;
  out.set([0x48, 0x44, 0x57, 0x43], hdwcAt);
  view.setUint32(hdwcAt + 4, hdwcSize, true);
  view.setUint16(hdwcAt + 8, 0, true); // start
  view.setUint16(hdwcAt + 10, glyphCount - 1, true); // end
  for (let i = 0; i < glyphCount * 3; i++) out[hdwcAt + 16 + i] = 0x55;

  return out;
}

const MAX_GLYPH_INDEX = Math.max(...INAZUMA_GLYPH_INDICES);

describe("Inazuma Arabic font patch", () => {
  it("overwrites exactly the reused glyph slots and leaves everything else untouched", () => {
    const fixture = buildFont12Fixture(MAX_GLYPH_INDEX + 20);
    const patched = patchInazumaFont12(fixture);

    expect(patched.length).toBe(fixture.length); // no block resized

    const plgcAt = 0x10 + 16;
    const tileBytes = 17;
    const patchedIndices = new Set(INAZUMA_GLYPH_INDICES);
    // Every glyph index NOT in the reused set keeps its 0xAA filler marker.
    for (let gi = 0; gi < MAX_GLYPH_INDEX + 20; gi++) {
      if (patchedIndices.has(gi)) continue;
      expect(patched[plgcAt + gi * tileBytes]).toBe(0xaa);
    }
    // Every patched glyph is no longer the 0xAA filler.
    for (const gi of INAZUMA_GLYPH_INDICES) {
      expect(patched[plgcAt + gi * tileBytes]).not.toBe(0xaa);
    }
  });

  it("gives every glyph a real width, not the 0x55 filler", () => {
    const glyphCount = MAX_GLYPH_INDEX + 1;
    const fixture = buildFont12Fixture(glyphCount);
    const patched = patchInazumaFont12(fixture);
    const plgcSize = 16 + glyphCount * 17;
    const hdwcDataAt = 0x10 + plgcSize + 16;
    for (let i = 0; i < INAZUMA_GLYPH_INDICES.length; i++) {
      const at = hdwcDataAt + INAZUMA_GLYPH_INDICES[i] * 3;
      expect(patched[at]).toBe(0); // leftBearing
      expect(patched[at + 1]).toBeGreaterThan(0); // glyphWidth
      expect(patched[at + 1]).toBe(patched[at + 2]); // charWidth == glyphWidth, matching the font's own convention
    }
  });

  it("throws rather than silently corrupt a font whose cell shape doesn't match", () => {
    const fixture = buildFont12Fixture(500);
    expect(() => patchInazumaFont8(fixture)).toThrow(/لا يطابق/);
  });
});

describe("Inazuma Arabic text encoding", () => {
  it("writes every covered presentation form as one byte of its own", () => {
    for (let i = 0; i < INAZUMA_ARABIC_CODEPOINTS.length; i++) {
      const bytes = inazumaArabicGlyphBytes(INAZUMA_ARABIC_CODEPOINTS[i])!;
      expect(bytes.length).toBe(1);
      expect(bytes.charCodeAt(0)).toBe(INAZUMA_ARABIC_BYTES[i]);
    }
  });

  it("gives the 125 forms 125 different bytes, none of them a lead byte or é", () => {
    expect(INAZUMA_ARABIC_BYTES.length).toBe(INAZUMA_ARABIC_CODEPOINTS.length);
    expect(new Set(INAZUMA_ARABIC_BYTES).size).toBe(INAZUMA_ARABIC_BYTES.length);
    for (const b of INAZUMA_ARABIC_BYTES) {
      expect(b).toBeGreaterThanOrEqual(0x80);
      expect(b).toBeLessThanOrEqual(0xff);
      expect([0x81, 0x82, 0xba]).not.toContain(b);
    }
  });

  it("returns null for a codepoint with no glyph yet", () => {
    expect(inazumaArabicGlyphBytes(0x0600)).toBeNull();
  });

  it("passes ASCII through untouched and reports missing glyphs instead of dropping them", () => {
    const covered = String.fromCodePoint(INAZUMA_ARABIC_CODEPOINTS[0]);
    const uncovered = "ﹰ"; // not in the covered glyph set
    const { text, missing } = encodeInazumaArabicText(`Go! ${covered}${uncovered}`);
    expect(text.startsWith("Go! ")).toBe(true);
    expect(missing).toEqual([uncovered]);
    // the uncovered character is kept as-is, not silently dropped
    expect(text.includes(uncovered)).toBe(true);
  });

  it("latinizes Arabic punctuation the font has no glyph for, instead of refusing the line", () => {
    const letter = String.fromCodePoint(INAZUMA_ARABIC_CODEPOINTS[0]);
    const { text, missing } = encodeInazumaArabicText(`${letter}؟ ${letter}، ${letter}؛ ${letter}٫ ${letter}…`);
    expect(missing).toEqual([]);
    expect(text).toContain("?");
    expect(text).toContain(",");
    expect(text).toContain(";");
    expect(text).toContain(".");
    expect(text).toContain("...");
    // none of the Arabic marks survive -- they were converted, not just tolerated
    for (const mark of ["؟", "،", "؛", "٫", "…"]) expect(text.includes(mark)).toBe(false);
  });

  it("counts an unsupported character across the whole line instead of stopping at the first", () => {
    const uncovered = "ﹰ"; // not in the covered glyph set
    const result = analyzeInazumaUnsupportedCharacters(`${uncovered} ${uncovered} ${uncovered}`);
    expect(result).toEqual([{ character: uncovered, unicode: "U+FE70", count: 3 }]);
  });

  it("reports nothing for text that already latinizes or has a glyph", () => {
    const covered = String.fromCodePoint(INAZUMA_ARABIC_CODEPOINTS[0]);
    expect(analyzeInazumaUnsupportedCharacters(`Go! ${covered}؟ ${covered}،`)).toEqual([]);
  });
});

/**
 * A minimal real-shaped NFTR: header, FINF (its map pointer at 0x28), and two
 * type-1 maps -- the Arabic slots' two-byte codes, and 0xA1-0xDF.
 */
function buildMappedFont(): Uint8Array {
  const low = 0x8140, high = 0x82ff;
  const lowSize = 20 + (high - low + 1) * 2;
  const latinSize = 20 + (0xdf - 0xa1 + 1) * 2;
  const first = 0x30;
  const second = first + lowSize;
  const out = new Uint8Array(second + latinSize);
  const v = new DataView(out.buffer);
  out.set([0x52, 0x54, 0x46, 0x4e], 0); // "RTFN"
  v.setUint32(8, out.length, true);
  v.setUint16(0x0e, 3, true);
  out.set([0x46, 0x4e, 0x49, 0x46], 0x10); // "FNIF"
  v.setUint32(0x14, 0x20, true);
  v.setUint32(0x28, first + 8, true);
  for (const [at, begin, end, next, glyphOf] of [
    [first, low, high, second + 8, (c: number) => 1000 + c - low],
    [second, 0xa1, 0xdf, 0, (c: number) => 100 + c - 0xa1],
  ] as const) {
    out.set([0x50, 0x41, 0x4d, 0x43], at); // "PAMC"
    v.setUint32(at + 4, 20 + (end - begin + 1) * 2, true);
    v.setUint16(at + 8, begin, true);
    v.setUint16(at + 10, end, true);
    v.setUint16(at + 12, 1, true);
    v.setUint32(at + 16, next, true);
    for (let c = begin; c <= end; c++) v.setUint16(at + 20 + (c - begin) * 2, glyphOf(c), true);
  }
  return out;
}

describe("addInazumaByteMap", () => {
  const before = buildMappedFont();
  const after = addInazumaByteMap(before);
  const v = new DataView(after.buffer);
  const map = v.getUint32(0x28, true);
  const glyph = (b: number) => v.getUint16(map + 12 + (b - 0x80) * 2, true);

  it("puts a 0x80-0xFF table first in the font's list, pointing on to the old first map", () => {
    expect(map).toBe(Math.ceil(before.length / 4) * 4 + 8);
    expect(v.getUint16(map, true)).toBe(0x80);
    expect(v.getUint16(map + 2, true)).toBe(0xff);
    expect(v.getUint16(map + 4, true)).toBe(1);
    expect(v.getUint32(map + 8, true)).toBe(0x30 + 8);
    // the header counts the new block and the new size; nothing old moved
    expect(v.getUint32(8, true)).toBe(after.length);
    expect(v.getUint16(0x0e, true)).toBe(4);
    expect(Array.from(after.subarray(0x2c, before.length))).toEqual(Array.from(before.subarray(0x2c)));
  });

  it("sends each Arabic byte to the glyph its old two-byte code draws", () => {
    INAZUMA_ARABIC_BYTES.forEach((b, i) => expect(glyph(b)).toBe(1000 + INAZUMA_SHIFT_JIS_CODES[i] - 0x8140));
  });

  it("keeps é, and leaves the lead bytes to the maps behind it", () => {
    expect(glyph(0xba)).toBe(100 + 0xba - 0xa1);
    expect(glyph(0x81)).toBe(0xffff);
    expect(glyph(0x82)).toBe(0xffff);
  });
});
