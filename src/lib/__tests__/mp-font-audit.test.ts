import { describe, it, expect } from "vitest";
import { auditMpFont, collectArabicTextCodepoints } from "@/lib/metroid-prime/mp-font-audit";
import type { MetroidPrimeGlyph } from "@/lib/metroid-prime/mp-wasm";

/** A page-0 glyph with sensible metrics; only what a test varies is passed in. */
function glyph(code: number, v0: number, v1: number, over: Partial<MetroidPrimeGlyph> = {}): MetroidPrimeGlyph {
  return {
    code,
    flag: 0,
    x0: -2,
    y0: 25,
    width: 12,
    height: 30,
    u0: 0.4,
    v0,
    u1: 0.45,
    v1,
    advance: 14,
    ...over,
  } as MetroidPrimeGlyph;
}

/** Grow the atlas: every page-0 glyph's V must be multiplied by the same factor. */
function rescale(gs: MetroidPrimeGlyph[], factor: number): MetroidPrimeGlyph[] {
  return gs.map((g) => ({ ...g, v0: g.v0 * factor, v1: g.v1 * factor }));
}

describe("Metroid Prime font audit — atlas growth", () => {
  const original = [
    glyph(0x41, 0.8, 0.7),
    glyph(0x42, 0.6, 0.5),
    glyph(0x43, 0.4, 0.3),
    glyph(0x44, 0.2, 0.1),
  ];

  it("treats a uniform V rescale as intentional, not as an error per glyph", () => {
    const report = auditMpFont(rescale(original, 0.6), { original });
    expect(report.errorCount).toBe(0);
    expect(report.headerIssues.some((i) => i.severity === "info" && /أُعيد قياس/.test(i.message))).toBe(true);
  });

  it("still reports a glyph the rescale skipped", () => {
    const glyphs = rescale(original, 0.6);
    glyphs[2] = { ...glyphs[2], v0: original[2].v0, v1: original[2].v1 }; // left behind
    const report = auditMpFont(glyphs, { original });
    expect(report.errorCount).toBeGreaterThan(0);
    expect(report.headerIssues.some((i) => /C.*دون قصد/.test(i.message))).toBe(true);
  });

  it("still reports a glyph whose geometry changed even when V follows the scale", () => {
    const glyphs = rescale(original, 0.6);
    glyphs[1] = { ...glyphs[1], advance: 99 };
    const report = auditMpFont(glyphs, { original });
    expect(report.errorCount).toBeGreaterThan(0);
  });

  it("reports nothing when nothing changed at all", () => {
    const report = auditMpFont(original, { original });
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
  });

  it("caps the per-glyph error list instead of emitting hundreds of lines", () => {
    const many = Array.from({ length: 50 }, (_, i) => glyph(0x41 + i, 0.8, 0.7));
    const broken = many.map((g) => ({ ...g, advance: 99 }));
    const report = auditMpFont(broken, { original: many });
    const perGlyph = report.headerIssues.filter((i) => /دون قصد/.test(i.message) && !/آخر/.test(i.message));
    expect(perGlyph).toHaveLength(10);
    expect(report.headerIssues.some((i) => /و40 حرفاً أصلياً آخر/.test(i.message))).toBe(true);
  });

  it("calls out a duplicate that the stock font already had, without failing the build", () => {
    const stock = [glyph(0x5f, 0.8, 0.7), glyph(0x5f, 0.6, 0.5)];
    const report = auditMpFont(stock, { original: stock });
    expect(report.errorCount).toBe(0);
    expect(report.headerIssues.some((i) => i.severity === "warning" && /الخط الأصلي نفسه/.test(i.message))).toBe(true);
  });

  it("treats a duplicate the edit introduced as a real error", () => {
    const report = auditMpFont([glyph(0x630, 0.8, 0.7), glyph(0x630, 0.6, 0.5)], { original: [] });
    expect(report.errorCount).toBeGreaterThan(0);
  });
});

/** Encodes a string the way MSBT stores it, so the scanner is exercised on
 *  the same shape it meets in a real asset. */
function utf16le(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[i * 2] = c & 0xff;
    out[i * 2 + 1] = c >> 8;
  }
  return out;
}

describe("Metroid Prime font audit — does the font cover the pak's text?", () => {
  it("passes when every Arabic codepoint the text uses has a glyph", () => {
    const text = collectArabicTextCodepoints([utf16le("Start ﺍﻠ")]);
    const font = [glyph(0xfe8d, 0.8, 0.7), glyph(0xfee0, 0.6, 0.5)];
    const report = auditMpFont(font, { textCodepoints: text });
    expect(report.errorCount).toBe(0);
    expect(report.headerIssues.some((i) => i.severity === "info" && /يغطيها كلها/.test(i.message))).toBe(true);
  });

  it("reports the missing codepoints and how often the text uses them", () => {
    const text = collectArabicTextCodepoints([utf16le("ابا")]);
    const report = auditMpFont([glyph(0x0627, 0.8, 0.7)], { textCodepoints: text });
    expect(report.errorCount).toBeGreaterThan(0);
    expect(report.headerIssues.some((i) => /1 رمزاً عربياً لا يملكها الخط \(1 ظهوراً\)/.test(i.message))).toBe(true);
  });

  it("names the real cause when the text is unshaped but the font holds presentation forms", () => {
    // What actually shipped: base letters in the text, joined forms in the font.
    const text = collectArabicTextCodepoints([utf16le("مرحبا")]);
    const font = [glyph(0xfee3, 0.8, 0.7), glyph(0xfeae, 0.6, 0.5), glyph(0xfea4, 0.4, 0.3)];
    const report = auditMpFont(font, { textCodepoints: text });
    expect(report.headerIssues.some((i) => /قبل إضافة التشكيل العربي/.test(i.message))).toBe(true);
  });

  it("stays silent when the pak carries no Arabic text at all", () => {
    const report = auditMpFont([glyph(0x41, 0.8, 0.7)], { textCodepoints: collectArabicTextCodepoints([utf16le("Press A")]) });
    expect(report.headerIssues).toHaveLength(0);
  });
});
