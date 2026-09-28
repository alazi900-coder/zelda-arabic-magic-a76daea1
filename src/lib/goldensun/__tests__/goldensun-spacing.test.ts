import { describe, it, expect } from "vitest";
import { fixGoldenSunSpacing, goldenSunSpacingFixes } from "../goldensun-spacing";

describe("Golden Sun spacing fix", () => {
  it("separates a word glued after ة", () => {
    expect(fixGoldenSunSpacing("الطاقة السحريةمن?")).toBe("الطاقة السحرية من?");
    expect(fixGoldenSunSpacing("امنع الطاقة السحريةللعدو.")).toBe("امنع الطاقة السحرية للعدو.");
  });
  it("separates a word glued after ى", () => {
    expect(fixGoldenSunSpacing("علىالطاولة")).toBe("على الطاولة");
  });
  it("adds a space after a comma before a letter", () => {
    expect(fixGoldenSunSpacing("أخيرا,لكن")).toBe("أخيرا, لكن");
    expect(fixGoldenSunSpacing("نعم،لا")).toBe("نعم، لا");
  });
  it("leaves control codes, numbers and correct text alone", () => {
    expect(fixGoldenSunSpacing("تم صد الطاقة السحرية\\x12\\x01!")).toBe("تم صد الطاقة السحرية\\x12\\x01!");
    expect(fixGoldenSunSpacing("1,000 قطعة")).toBe("1,000 قطعة");
    expect(fixGoldenSunSpacing("الطاقة السحرية لمن؟")).toBe("الطاقة السحرية لمن؟");
    expect(fixGoldenSunSpacing("مدرسة.")).toBe("مدرسة.");
  });
  it("lists only the translations it changes", () => {
    expect(goldenSunSpacingFixes({ a: "الطاقة السحريةمن?", b: "صحيح", c: "" })).toEqual({ a: "الطاقة السحرية من?" });
  });
});
