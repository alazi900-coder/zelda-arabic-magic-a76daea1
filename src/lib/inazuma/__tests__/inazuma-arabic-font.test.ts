import { describe, expect, it } from "vitest";
import {
  patchInazumaFont12,
  patchInazumaFont8,
  inazumaArabicGlyphBytes,
  encodeInazumaArabicText,
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
  it("maps every covered presentation form to its verified-safe Shift-JIS byte pair", () => {
    for (let i = 0; i < INAZUMA_ARABIC_CODEPOINTS.length; i++) {
      const cp = INAZUMA_ARABIC_CODEPOINTS[i];
      const bytes = inazumaArabicGlyphBytes(cp)!;
      const expectedCode = INAZUMA_SHIFT_JIS_CODES[i];
      expect(bytes.length).toBe(2);
      expect(bytes.charCodeAt(0)).toBe((expectedCode >> 8) & 0xff);
      expect(bytes.charCodeAt(1)).toBe(expectedCode & 0xff);
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
});
