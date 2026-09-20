import { describe, expect, it } from "vitest";
import {
  patchInazumaFont12,
  patchInazumaFont8,
  inazumaArabicGlyphBytes,
  encodeInazumaArabicText,
} from "../inazuma-arabic-font";
import { INAZUMA_ARABIC_CODEPOINTS } from "../inazuma-arabic-glyphs";

const HIRAGANA_BASE_GLYPH = 366;

/**
 * A minimal FONT12-shaped NFTR: FNIF(16) + PLGC header(16) + N glyph tiles +
 * HDWC header(16) + N width triplets. `glyphCount` must reach past index
 * `366 + INAZUMA_ARABIC_CODEPOINTS.length` so every patched slot exists.
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

describe("Inazuma Arabic font patch", () => {
  it("overwrites exactly the hiragana glyph slots and leaves everything else untouched", () => {
    const count = INAZUMA_ARABIC_CODEPOINTS.length;
    const fixture = buildFont12Fixture(HIRAGANA_BASE_GLYPH + count + 20);
    const patched = patchInazumaFont12(fixture);

    expect(patched.length).toBe(fixture.length); // no block resized

    const plgcAt = 0x10 + 16;
    const tileBytes = 17;
    // Glyph just before the patched range: untouched marker byte.
    expect(patched[plgcAt + (HIRAGANA_BASE_GLYPH - 1) * tileBytes]).toBe(0xaa);
    // Glyph just after the patched range: untouched marker byte.
    expect(patched[plgcAt + (HIRAGANA_BASE_GLYPH + count) * tileBytes]).toBe(0xaa);
    // A patched glyph is no longer the 0xAA filler.
    expect(patched[plgcAt + HIRAGANA_BASE_GLYPH * tileBytes]).not.toBe(0xaa);
  });

  it("gives every glyph a real width, not the 0x55 filler", () => {
    const count = INAZUMA_ARABIC_CODEPOINTS.length;
    const fixture = buildFont12Fixture(HIRAGANA_BASE_GLYPH + count + 1);
    const patched = patchInazumaFont12(fixture);
    const plgcSize = 16 + (HIRAGANA_BASE_GLYPH + count + 1) * 17;
    const hdwcDataAt = 0x10 + plgcSize + 16;
    for (let i = 0; i < count; i++) {
      const at = hdwcDataAt + (HIRAGANA_BASE_GLYPH + i) * 3;
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
  it("maps every covered presentation form to its Shift-JIS hiragana byte pair", () => {
    for (let i = 0; i < INAZUMA_ARABIC_CODEPOINTS.length; i++) {
      const cp = INAZUMA_ARABIC_CODEPOINTS[i];
      const bytes = inazumaArabicGlyphBytes(cp)!;
      expect(bytes.length).toBe(2);
      expect(bytes.charCodeAt(0)).toBe(0x82);
      expect(bytes.charCodeAt(1)).toBe(0x9f + i);
    }
  });

  it("returns null for a codepoint with no glyph yet", () => {
    expect(inazumaArabicGlyphBytes(0x0600)).toBeNull();
  });

  it("passes ASCII through untouched and reports missing glyphs instead of dropping them", () => {
    const covered = String.fromCodePoint(INAZUMA_ARABIC_CODEPOINTS[0]);
    const uncovered = "ﹰ"; // not in the current 19-glyph set
    const { text, missing } = encodeInazumaArabicText(`Go! ${covered}${uncovered}`);
    expect(text.startsWith("Go! ")).toBe(true);
    expect(missing).toEqual([uncovered]);
    // the uncovered character is kept as-is, not silently dropped
    expect(text.includes(uncovered)).toBe(true);
  });
});
