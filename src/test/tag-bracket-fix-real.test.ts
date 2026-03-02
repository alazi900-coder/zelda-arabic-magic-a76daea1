import { describe, it, expect } from "vitest";
import { fixTagBracketsStrict, hasTechnicalBracketTag } from "@/lib/tag-bracket-fix";

/**
 * Real-world tag bracket fix tests — verifies no duplication occurs.
 */

describe("fixTagBracketsStrict – real-world duplication prevention", () => {
  // Scenario from user screenshot: ]ML:Dash 4[ gets fixed but original stays too
  it("fixes reversed ]ML:Dash 4[ without duplicating the tag", () => {
    const original = "Enemies Defeated [ML:Dash 4]";
    const translation = "الأعداء المهزومون ]ML:Dash 4[";
    const { text, stats } = fixTagBracketsStrict(original, translation);
    expect(text).toBe("الأعداء المهزومون [ML:Dash 4]");
    expect(stats.reversed).toBe(1);
    // Ensure tag appears exactly once
    const count = (text.match(/\[ML:Dash 4\]/g) || []).length;
    expect(count).toBe(1);
  });

  it("fixes mismatched ]ML:Dash 4] without duplication", () => {
    const original = "Score [ML:Dash 4]";
    const translation = "النتيجة ]ML:Dash 4]";
    const { text } = fixTagBracketsStrict(original, translation);
    expect(text).toBe("النتيجة [ML:Dash 4]");
    expect((text.match(/\[ML:Dash 4\]/g) || []).length).toBe(1);
  });

  it("does not touch already correct tags", () => {
    const original = "HP [ML:Dash 4] remaining";
    const translation = "HP [ML:Dash 4] المتبقية";
    const { text, stats } = fixTagBracketsStrict(original, translation);
    expect(text).toBe(translation);
    expect(stats.total).toBe(0);
  });

  it("fixes N[TAG] reversed pattern 1]ML[ → 1[ML]", () => {
    const original = "1[ML] something";
    const translation = "1]ML[ شيء ما";
    const { text } = fixTagBracketsStrict(original, translation);
    expect(text).toContain("1[ML]");
    expect((text.match(/1\[ML\]/g) || []).length).toBe(1);
  });

  it("fixes [TAG]N reversed pattern ]SE[0 → [SE]0", () => {
    const original = "[SE]0 sound effect";
    const translation = "]SE[0 تأثير صوتي";
    const { text } = fixTagBracketsStrict(original, translation);
    expect(text).toContain("[SE]0");
    expect((text.match(/\[SE\]0/g) || []).length).toBe(1);
  });

  it("handles invisible Unicode chars between tag characters", () => {
    const original = "Test [ML:Dash 4]";
    // Simulate RTL mark inserted inside the tag
    const translation = "اختبار ]M\u200FL:Dash 4[";
    const { text } = fixTagBracketsStrict(original, translation);
    expect(text).toContain("[ML:Dash 4]");
    expect((text.match(/\[ML:Dash 4\]/g) || []).length).toBe(1);
  });

  it("fixes multiple different tags without cross-contamination", () => {
    const original = "[ML:Dash 4] and [SE:Sound 1]";
    const translation = "]ML:Dash 4[ و ]SE:Sound 1[";
    const { text, stats } = fixTagBracketsStrict(original, translation);
    expect(text).toContain("[ML:Dash 4]");
    expect(text).toContain("[SE:Sound 1]");
    expect(stats.reversed).toBe(2);
    expect((text.match(/\[ML:Dash 4\]/g) || []).length).toBe(1);
    expect((text.match(/\[SE:Sound 1\]/g) || []).length).toBe(1);
  });

  it("fixes {player:name} reversed braces", () => {
    const original = "Hello {player:name}!";
    const translation = "مرحباً }player:name{!";
    const { text } = fixTagBracketsStrict(original, translation);
    expect(text).toContain("{player:name}");
    expect((text.match(/\{player:name\}/g) || []).length).toBe(1);
  });

  it("fixes [Color=Red] reversed brackets", () => {
    const original = "[Color=Red] text";
    const translation = "]Color=Red[ نص";
    const { text } = fixTagBracketsStrict(original, translation);
    expect(text).toContain("[Color=Red]");
    expect((text.match(/\[Color=Red\]/g) || []).length).toBe(1);
  });
});

describe("hasTechnicalBracketTag", () => {
  it("detects [ML:Dash 4] style", () => {
    expect(hasTechnicalBracketTag("text [ML:Dash 4] more")).toBe(true);
  });
  it("detects 1[ML] style", () => {
    expect(hasTechnicalBracketTag("1[ML] text")).toBe(true);
  });
  it("detects [ML]1 style", () => {
    expect(hasTechnicalBracketTag("[ML]1 text")).toBe(true);
  });
  it("returns false for plain text", () => {
    expect(hasTechnicalBracketTag("just plain text")).toBe(false);
  });
});
