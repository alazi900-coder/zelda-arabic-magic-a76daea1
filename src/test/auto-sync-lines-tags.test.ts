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
    const input = "[System:Ruby rt=we ]جيش كيفيسي[/System:Ruby] يهاجم المدينة بقوة كبيرة جداً ويجب الاستعداد لها";
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
    const input = "\uE001\uE002 اختر السلاح المناسب للمعركة القادمة واستعد جيداً للمواجهة الكبرى";
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

describe("autoSyncLines edge cases", () => {
  it("preserves multiple tags and variables when splitting to multiple lines", () => {
    // Use a text that's long enough to force multi-line split even after tag placeholders
    const words = "اضغط [ML:icon icon=btn_a ] للتأكيد على العملية المطلوبة";
    const moreWords = "ثم أدخل اسم الشخصية {name} في الحقل المخصص لذلك";
    const evenMore = "واحصل على {count} نقطة خبرة إضافية من المعركة";
    const input = `${words} ${moreWords} ${evenMore}`;
    const result = syncLines(input, 3);
    // Primary goal: all tags and variables are preserved
    expect(result).toContain("[ML:icon icon=btn_a ]");
    expect(result).toContain("{name}");
    expect(result).toContain("{count}");
    expect(result).not.toMatch(/TAG_\d+/);
    // Text should not be empty
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles mixed tag types in one string", () => {
    const input = "[ML:icon icon=btn_a ] اضغط [System:Ruby rt=we ]كيفيسي[/System:Ruby] مرحباً {name} حصلت على %d نقطة";
    const result = syncLines(input, 2);
    expect(result).toContain("[ML:icon icon=btn_a ]");
    expect(result).toContain("[System:Ruby rt=we ]");
    expect(result).toContain("[/System:Ruby]");
    expect(result).toContain("{name}");
    expect(result).toContain("%d");
    expect(result).not.toMatch(/TAG_\d+/);
  });

  it("splits to 4 lines correctly", () => {
    const input = "السطر الأول من النص الطويل جداً والسطر الثاني يحتوي معلومات إضافية والسطر الثالث فيه تفاصيل أكثر والسطر الرابع هو الأخير في هذا النص";
    const result = syncLines(input, 4);
    expect(result.split("\n")).toHaveLength(4);
  });

  it("preserves tag at the very start of text", () => {
    const input = "[ML:undisp ] هذا نص طويل يحتاج إلى تقسيم على سطرين مختلفين";
    const result = syncLines(input, 2);
    expect(result).toContain("[ML:undisp ]");
    expect(result.split("\n")).toHaveLength(2);
    expect(result).not.toMatch(/TAG_\d+/);
  });

  it("preserves tag at the very end of text", () => {
    const input = "هذا نص طويل يحتاج إلى تقسيم على سطرين مختلفين [ML:icon icon=btn_a ]";
    const result = syncLines(input, 2);
    expect(result).toContain("[ML:icon icon=btn_a ]");
    expect(result.split("\n")).toHaveLength(2);
  });

  it("redistributes existing newlines to match english line count", () => {
    const input = "السطر الأول\nالسطر الثاني\nالسطر الثالث مع نص إضافي";
    const result = syncLines(input, 2);
    expect(result.split("\n")).toHaveLength(2);
  });

  it("handles very short text with a long tag", () => {
    const input = "[ML:icon icon=btn_a ] نعم";
    const result = syncLines(input, 1);
    expect(result).toContain("[ML:icon icon=btn_a ]");
    expect(result).toContain("نعم");
    expect(result).not.toContain("\n");
  });

  it("handles consecutive tags with no text between them", () => {
    const input = "[ML:undisp ][ML:icon icon=btn_a ] اضغط للتأكيد";
    const result = syncLines(input, 1);
    expect(result).toContain("[ML:undisp ]");
    expect(result).toContain("[ML:icon icon=btn_a ]");
    expect(result).not.toContain("\n");
    expect(result).not.toMatch(/TAG_\d+/);
  });

  it("preserves multiple Ruby pairs in the same text", () => {
    const input = "[System:Ruby rt=we ]كيفيسي[/System:Ruby] ضد [System:Ruby rt=ag ]أغنوس[/System:Ruby] في المعركة الكبرى التي ستحدد مصير العالم بأكمله";
    const result = syncLines(input, 2, 30);
    expect(result).toContain("[System:Ruby rt=we ]");
    expect(result).toContain("[System:Ruby rt=ag ]");
    expect(result).toContain("[/System:Ruby]");
    const closingCount = (result.match(/\[\/System:Ruby\]/g) || []).length;
    expect(closingCount).toBe(2);
    expect(result.split("\n")).toHaveLength(2);
  });

  it("handles tags-only input with no Arabic text", () => {
    const input = "[ML:icon icon=btn_a ][ML:icon icon=btn_b ]";
    const result = syncLines(input, 1);
    expect(result).toContain("[ML:icon icon=btn_a ]");
    expect(result).toContain("[ML:icon icon=btn_b ]");
    expect(result).not.toMatch(/TAG_\d+/);
  });
});
