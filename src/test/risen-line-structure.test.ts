import { describe, it, expect } from "vitest";
import { countLines } from "@/lib/text-tokens";
import {
  buildLineSkeleton,
  mapTranslationToLineSkeleton,
  normalizeBreakStyleToSource,
  validateLineStructure,
  hasEngineLineBreakTags,
} from "@/lib/balance-lines";

describe("countLines (canonical, tag-agnostic line count)", () => {
  it("counts an empty string as 1 line", () => {
    expect(countLines("")).toBe(1);
  });

  it("counts a leading break as an empty first line", () => {
    expect(countLines("\r\nA")).toBe(2);
  });

  it("counts a single break as 2 lines", () => {
    expect(countLines("A\r\nB")).toBe(2);
  });
});

/**
 * Reference structure from documents.tab / LETTER_KALVERAMX2_2008-02-21_15-52-19_00
 * (13 × \r\n breaks = 14 lines). Empty lines at positions 1,3,7,9,11 (1-indexed) —
 * that leaves 9 content slots (1 prose + 3 list + 1 prose + 1 list + 3 prose), not 8.
 */
const REFERENCE_ORIGINAL = [
  "",
  "Ingredients:",
  "",
  "- 1 empty vial",
  "- 1 bottle of wine",
  "- 1 healing root",
  "",
  "Equipment needed:",
  "",
  "- Alchemy table",
  "",
  "Mix the vial with the wine.",
  "Add the healing root and stir.",
  "Drink before combat.",
].join("\r\n");

describe("Risen line skeleton (empty/list/prose classification)", () => {
  it("classifies the reference example's 14 lines correctly", () => {
    const skeleton = buildLineSkeleton(REFERENCE_ORIGINAL);
    expect(skeleton).toEqual([
      "empty", "prose", "empty", "list", "list", "list", "empty",
      "prose", "empty", "list", "empty", "prose", "prose", "prose",
    ]);
  });
});

describe("mapTranslationToLineSkeleton (Fix Lines — structure mapping, never flattens)", () => {
  it("success case: a matching-content-count translation is mapped onto the 14-line skeleton", () => {
    // 9 content lines, matching the reference example's 9 content slots.
    const translation = [
      "المكونات:",
      "- قارورة فارغة",
      "- زجاجة نبيذ",
      "- جذر شفاء",
      "المعدات المطلوبة:",
      "- طاولة الخيمياء",
      "امزج القارورة مع النبيذ.",
      "أضف جذر الشفاء وحرّك.",
      "اشرب قبل القتال.",
    ].join("\n");

    const result = mapTranslationToLineSkeleton(REFERENCE_ORIGINAL, translation);
    expect(result.ok).toBe(true);
    expect(result.text).toBeDefined();

    const resultLines = result.text!.split("\r\n");
    expect(resultLines.length).toBe(14);
    expect(result.text!.includes("\r\n")).toBe(true);
    // Empty lines preserved at the same positions (0-indexed: 0,2,6,8,10).
    for (const i of [0, 2, 6, 8, 10]) expect(resultLines[i]).toBe("");
    // Content lines placed in order.
    expect(resultLines[1]).toBe("المكونات:");
    expect(resultLines[3]).toBe("- قارورة فارغة");
    expect(resultLines[13]).toBe("اشرب قبل القتال.");
  });

  it("refusal case: a translation with the wrong content-line count is left unchanged (no merge)", () => {
    // Only 6 content lines instead of the required 9.
    const translation = [
      "المكونات:",
      "- قارورة فارغة",
      "- زجاجة نبيذ",
      "المعدات المطلوبة:",
      "- طاولة الخيمياء",
      "اشرب قبل القتال.",
    ].join("\n");

    const result = mapTranslationToLineSkeleton(REFERENCE_ORIGINAL, translation);
    expect(result.ok).toBe(false);
    expect(result.text).toBeUndefined();
    expect(result.expectedContentLines).toBe(9);
    expect(result.actualContentLines).toBe(6);
    // Never returns a single merged line when the original had more.
    expect(result.text).not.toBe(translation.replace(/\n/g, " "));
  });
});

describe("hasEngineLineBreakTags", () => {
  it("distinguishes XC engine tag-based breaks from plain \\r\\n/\\n text", () => {
    expect(hasEngineLineBreakTags("A[XENO:n ]B")).toBe(true);
    expect(hasEngineLineBreakTags("A[System:PageBreak ]B")).toBe(true);
    expect(hasEngineLineBreakTags(REFERENCE_ORIGINAL)).toBe(false);
  });
});

describe("normalizeBreakStyleToSource (manual-save / AI-response CRLF restore)", () => {
  it("restores \\r\\n when the source uses \\r\\n but the input is browser-normalized to bare \\n", () => {
    // Simulates a textarea: source entry uses \r\n, but reading textarea.value
    // always yields bare \n.
    const source = "Line A\r\nLine B\r\nLine C";
    const textareaValue = "ترجمة أ\nترجمة ب\nترجمة ج";
    const restored = normalizeBreakStyleToSource(source, textareaValue);
    expect(restored).toBe("ترجمة أ\r\nترجمة ب\r\nترجمة ج");
  });

  it("is a no-op when styles already match or there are no breaks", () => {
    expect(normalizeBreakStyleToSource("A\nB", "X\nY")).toBe("X\nY");
    expect(normalizeBreakStyleToSource("A\r\nB", "single line")).toBe("single line");
  });
});

describe("validateLineStructure (post-translation position-mask validation)", () => {
  it("flags a translation whose empty-line positions differ from the original", () => {
    const original = ["", "A", "", "B"].join("\r\n"); // mask: [true, false, true, false]
    const translated = ["X", "", "Y", ""].join("\r\n"); // mask: [false, true, false, true]
    const result = validateLineStructure(original, translated);
    expect(result.ok).toBe(false);
    expect(result.emptyMaskMatches).toBe(false);
  });

  it("passes when line count and empty-line positions both match", () => {
    const original = ["", "A", "", "B"].join("\r\n");
    const translated = ["", "س", "", "ص"].join("\r\n");
    const result = validateLineStructure(original, translated);
    expect(result.ok).toBe(true);
    expect(result.emptyMaskMatches).toBe(true);
  });
});
