import { describe, it, expect } from "vitest";
import {
  stripHallucinatedTagBrackets,
  restoreTagsAndLineBreaks,
  scanTranslationsForRestore,
} from "@/lib/tag-restore";

/**
 * Critical XC3 regression coverage for "Symbols and Line Breaks" tool.
 *
 * The tool was ported from a Zelda project that only knew PUA glyphs. For
 * Xenoblade Chronicles 1 the tags are bracket-based ASCII patterns, and the
 * old `stripHallucinatedTagBrackets` would treat them as AI hallucinations
 * and DELETE them — corrupting cutscene files on rebuild.
 *
 * These tests lock the XC3 contract:
 *  1. Real XC3 tags survive strip.
 *  2. AI-invented decorative brackets still get removed.
 *  3. [XENO:n ] / [System:PageBreak ] count as hard line breaks (so the
 *     scanner doesn't falsely flag "missing line breaks").
 *  4. Bracket tags participate in the missing/extra/wrong-order analysis.
 */
describe("XC3 tag preservation in stripHallucinatedTagBrackets", () => {
  it("preserves [XENO:n ]", () => {
    expect(stripHallucinatedTagBrackets("مرحبا[XENO:n ]العالم")).toBe("مرحبا[XENO:n ]العالم");
  });
  it("preserves [XENO:wait wait=key ]", () => {
    expect(stripHallucinatedTagBrackets("نص[XENO:wait wait=key ]نص"))
      .toBe("نص[XENO:wait wait=key ]نص");
  });
  it("preserves [XENO:del del=this ]", () => {
    expect(stripHallucinatedTagBrackets("x[XENO:del del=this ]")).toBe("x[XENO:del del=this ]");
  });
  it("preserves [System:PageBreak ]", () => {
    expect(stripHallucinatedTagBrackets("A[System:PageBreak ]B")).toBe("A[System:PageBreak ]B");
  });
  it("preserves [System:Ruby rt=... ] and closing [/System:Ruby ]", () => {
    const t = "اسم[System:Ruby rt=furigana ]شخصية[/System:Ruby ]";
    expect(stripHallucinatedTagBrackets(t)).toBe(t);
  });
  it("preserves [ML:icon icon=btn_a ] and [ML:Dash ]", () => {
    const t = "اضغط [ML:icon icon=btn_a ] أو [ML:Dash ] للمتابعة";
    expect(stripHallucinatedTagBrackets(t)).toBe(t);
  });
  it("still removes AI-invented decorative brackets like [Color:Red]", () => {
    expect(stripHallucinatedTagBrackets("[Color:Red]نص[Icon:Heart]")).toBe("نص");
  });
  it("still removes plain ASCII bracket noise like [hint]", () => {
    expect(stripHallucinatedTagBrackets("نص [hint] آخر")).toBe("نص  آخر");
  });
  it("preserves Arabic-content brackets like [ملاحظة]", () => {
    expect(stripHallucinatedTagBrackets("[ملاحظة] هام")).toBe("[ملاحظة] هام");
  });
});

describe("XC3 hard-break aware line analysis", () => {
  it("does NOT flag 'missing line breaks' when original uses [XENO:n ] and translation matches", () => {
    const original = "Hello there.[XENO:n ]How are you?";
    const translation = "مرحبا.[XENO:n ]كيف حالك؟";
    const report = scanTranslationsForRestore(
      [{ msbtFile: "test.msbt", index: 0, label: "L", original }],
      { "test.msbt:0": translation },
    );
    // No missing-line-break issues should be reported; translation is clean.
    expect(report.issueTotals.missingLineBreaksAuto).toBe(0);
    expect(report.issueTotals.missingLineBreaksPartial).toBe(0);
  });

  it("flags missing line break when translation drops [XENO:n ]", () => {
    const original = "Line A.[XENO:n ]Line B.";
    const translation = "السطر الأول. السطر الثاني.";
    const report = scanTranslationsForRestore(
      [{ msbtFile: "t.msbt", index: 0, label: "L", original }],
      { "t.msbt:0": translation },
    );
    expect(report.issueTotals.affectedTranslations).toBeGreaterThan(0);
  });

  it("treats [System:PageBreak ] same as [XENO:n ] for line counting", () => {
    const original = "A.[System:PageBreak ]B.";
    const translation = "أ.[System:PageBreak ]ب.";
    const report = scanTranslationsForRestore(
      [{ msbtFile: "t.msbt", index: 0, label: "L", original }],
      { "t.msbt:0": translation },
    );
    expect(report.issueTotals.missingLineBreaksAuto).toBe(0);
    expect(report.issueTotals.missingLineBreaksPartial).toBe(0);
  });

  it("restoreTagsAndLineBreaks does not destroy XC3 tags", () => {
    const original = "Hello.[XENO:wait wait=key ][System:PageBreak ]World.[XENO:n ]\nEnd.";
    const translation = "مرحبا.[XENO:wait wait=key ][System:PageBreak ]عالم.[XENO:n ]\nنهاية.";
    const out = restoreTagsAndLineBreaks(original, translation);
    expect(out).toContain("[XENO:wait wait=key ]");
    expect(out).toContain("[System:PageBreak ]");
    expect(out).toContain("[XENO:n ]");
  });
});

describe("XC3 bracket-tag presence/absence detection", () => {
  it("detects an XC3 tag missing from translation", () => {
    const original = "Press [ML:icon icon=btn_a ] to continue.";
    const translation = "اضغط للمتابعة.";
    const report = scanTranslationsForRestore(
      [{ msbtFile: "t.msbt", index: 0, label: "L", original }],
      { "t.msbt:0": translation },
    );
    expect(report.issueTotals.missingTags).toBeGreaterThan(0);
  });

  it("detects an extra XC3 tag hallucinated by AI", () => {
    const original = "Hello.";
    const translation = "مرحبا.[ML:Dash ]";
    const report = scanTranslationsForRestore(
      [{ msbtFile: "t.msbt", index: 0, label: "L", original }],
      { "t.msbt:0": translation },
    );
    expect(report.issueTotals.extraTags).toBeGreaterThan(0);
  });

  it("does not flag perfectly matching XC3 tags", () => {
    const original = "Use [ML:icon icon=btn_a ] then [ML:icon icon=btn_b ].";
    const translation = "استخدم [ML:icon icon=btn_a ] ثم [ML:icon icon=btn_b ].";
    const report = scanTranslationsForRestore(
      [{ msbtFile: "t.msbt", index: 0, label: "L", original }],
      { "t.msbt:0": translation },
    );
    expect(report.issueTotals.affectedTranslations).toBe(0);
  });
});
