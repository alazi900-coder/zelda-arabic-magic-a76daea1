import { describe, expect, it } from "vitest";
import { applyArabicFontPatch, ARABIC_GLYPH_RASTERS, ARABIC_PRESENTATION_FORMS } from "./fe12-arabic-charmap";
import { decodeFe12Glyph, readFe12Font } from "./fe12-font";
import { buildSyntheticFont, busyRaster } from "./fe12-font-test-fixtures";

/** Builds a synthetic font with 130 unused-looking kanji slots (busy rasters, so their byte budget is generously large) plus a handful of "live" non-kanji codes that must survive untouched. */
function buildFontWithKanjiSlots() {
  const kanjiGlyphs = Array.from({ length: 130 }, (_, i) => ({
    code: 0x8940 + i, // lead byte 0x89 keeps every code >= KANJI_CODE_MIN; trail 0x40+i stays inside the trail table's 0x40-0xFF range
    width: 12,
    raster: busyRaster(i),
  }));
  const liveGlyphs = [
    { code: 0x8340, width: 10, raster: busyRaster(200) }, // an ASCII/live-range glyph the patch must not touch
    { code: 0x82a0, width: 11, raster: busyRaster(201) },
  ];
  return buildSyntheticFont([...kanjiGlyphs, ...liveGlyphs], 60);
}

describe("fe12-arabic-charmap", () => {
  it("has exactly 124 presentation forms, each with an embedded raster", () => {
    expect(ARABIC_PRESENTATION_FORMS).toHaveLength(124);
    for (const codepoint of ARABIC_PRESENTATION_FORMS) {
      expect(ARABIC_GLYPH_RASTERS.has(codepoint)).toBe(true);
    }
  });

  it("assigns every presentation form to a distinct kanji slot and draws it without exceeding any slot's budget", () => {
    const font = buildFontWithKanjiSlots();
    const before = readFe12Font(font);
    const kanjiSlotsBefore = before.filter((g) => g.code >= 0x889f);
    const budgetByCode = new Map(kanjiSlotsBefore.map((g) => [g.code, decodeFe12Glyph(font, g.glyphAbs).byteLength]));

    const assignment = applyArabicFontPatch(font);
    expect(assignment.size).toBe(124);

    const usedCodes = new Set(assignment.values());
    expect(usedCodes.size).toBe(124); // no two codepoints share a slot

    for (const [codepoint, code] of assignment) {
      expect(code).toBeGreaterThanOrEqual(0x889f);
      expect(budgetByCode.has(code)).toBe(true);
      const glyph = ARABIC_GLYPH_RASTERS.get(codepoint)!;
      const decoded = decodeFe12Glyph(font, before.find((g) => g.code === code)!.glyphAbs);
      expect(decoded.raster).toEqual(glyph.raster);
    }
  });

  it("leaves non-kanji glyph slots completely untouched", () => {
    const font = buildFontWithKanjiSlots();
    const liveSlotBefore = readFe12Font(font).find((g) => g.code === 0x8340)!;
    const before = decodeFe12Glyph(font, liveSlotBefore.glyphAbs);

    applyArabicFontPatch(font);

    const liveSlotAfter = readFe12Font(font).find((g) => g.code === 0x8340)!;
    const after = decodeFe12Glyph(font, liveSlotAfter.glyphAbs);
    expect(after.raster).toEqual(before.raster);
  });

  it("throws a clear error when there are not enough kanji slots", () => {
    const tooFewKanjiGlyphs = Array.from({ length: 50 }, (_, i) => ({ code: 0x889f + i, width: 10, raster: busyRaster(i) }));
    const font = buildSyntheticFont(tooFewKanjiGlyphs, 60);
    expect(() => applyArabicFontPatch(font)).toThrow(/خانات كانجي/);
  });
});
