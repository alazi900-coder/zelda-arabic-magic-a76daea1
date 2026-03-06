import { describe, it, expect } from "vitest";
import { protectTags, restoreTags } from "@/lib/xc3-tag-protection";
import { balanceLines } from "@/lib/balance-lines";

/**
 * Replicates the autoSyncLines pipeline:
 * protectTags → flatten → balanceLines → restoreTags → validate
 */
function syncLines(translated: string, englishLineCount: number, charLimit = 42, maxLines?: number): string {
  const { cleanText, tags } = protectTags(translated);
  const flat = cleanText.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();

  let balanced: string;
  if (englishLineCount <= 1) {
    balanced = flat;
  } else {
    balanced = balanceLines(flat, charLimit, maxLines ?? englishLineCount);
  }

  const result = restoreTags(balanced, tags);
  return result;
}

describe("autoSyncLines tag protection", () => {
  it("preserves [ML:icon] tags when flattening to 1 line", () => {
    const input = "اضغط [ML:icon icon=btn_a ] للتأكيد";
    const result = syncLines(input, 1);
    expect(result).toContain("[ML:icon icon=btn_a ]");
    expect(result).not.toContain("\n");
  });

  it("preserves [ML:icon] tags when splitting to 2 lines", () => {
    const input = "اضغط [ML:icon icon=btn_a ] للتأكيد ثم اختر الخيار المناسب من القائمة";
    const result = syncLines(input, 2);
    expect(result).toContain("[ML:icon icon=btn_a ]");
    expect(result.split("\n")).toHaveLength(2);
  });

  it("preserves paired [System:Ruby] tags as atomic block", () => {
    const input = "[System:Ruby rt=we ]جيش كيفيسي[/System:Ruby] يهاجم المدينة بقوة كبيرة";
    const result = syncLines(input, 2);
    // The paired tag must not be split across lines
    expect(result).toContain("[System:Ruby rt=we ]");
    expect(result).toContain("[/System:Ruby]");
    expect(result.split("\n")).toHaveLength(2);
  });

  it("preserves multiple tags in multi-line split", () => {
    const input = "1[ML] نقطة خبرة و 2[ML] عملة ذهبية تم الحصول عليها";
    const result = syncLines(input, 2);
    expect(result).toContain("1[ML]");
    expect(result).toContain("2[ML]");
    expect(result.split("\n")).toHaveLength(2);
  });

  it("preserves {variable} placeholders", () => {
    const input = "مرحباً {name} لقد حصلت على {count} نقطة";
    const result = syncLines(input, 1);
    expect(result).toContain("{name}");
    expect(result).toContain("{count}");
    expect(result).not.toContain("\n");
  });

  it("does not leave TAG_ placeholders in output", () => {
    const input = "[ML:undisp ] مرحباً [ML:icon icon=btn_a ] بالعالم";
    const result = syncLines(input, 1);
    expect(result).not.toMatch(/TAG_\d+/);
  });

  it("flattens multi-line tagged text to 1 line when english is 1 line", () => {
    const input = "اضغط [ML:icon icon=btn_a ]\nللتأكيد";
    const result = syncLines(input, 1);
    expect(result).not.toContain("\n");
    expect(result).toContain("[ML:icon icon=btn_a ]");
  });

  it("handles PUA icon characters as atomic blocks", () => {
    const input = "\uE001\uE002 اختر السلاح المناسب للمعركة القادمة";
    const result = syncLines(input, 2);
    // PUA icons should stay together
    expect(result).toContain("\uE001\uE002");
    expect(result.split("\n")).toHaveLength(2);
  });

  it("handles text with no tags normally", () => {
    const input = "هذا نص عادي بدون أي وسوم تقنية ويحتاج تقسيم";
    const result = syncLines(input, 2);
    expect(result.split("\n")).toHaveLength(2);
    expect(result).not.toMatch(/TAG_\d+/);
  });

  it("preserves HTML-like tags", () => {
    const input = "النص <b>مهم جداً</b> ويجب الانتباه له";
    const result = syncLines(input, 1);
    expect(result).toContain("<b>");
    expect(result).toContain("</b>");
  });

  it("preserves %s and %d format specifiers", () => {
    const input = "حصلت على %d نقطة في %s";
    const result = syncLines(input, 1);
    expect(result).toContain("%d");
    expect(result).toContain("%s");
  });
});
