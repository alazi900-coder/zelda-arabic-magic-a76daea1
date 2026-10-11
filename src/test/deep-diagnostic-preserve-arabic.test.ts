import { describe, expect, it } from "vitest";
import { repairMissingTechnicalTokens } from "@/lib/repair-missing-technical-tokens";
import { diffTechnicalTags } from "@/lib/xc3-build-tag-guard";
import { countMissingTagNewlines, fixTagNewlines } from "@/lib/tag-newline-anchor";
import { rebalanceTranslationLines } from "@/lib/balance-lines";

describe("deep diagnostic repairs without deleting Arabic", () => {
  it("inserts a missing source token between Arabic words", () => {
    const original = "Hello [XENO:wait] world";
    const translation = "مرحبًا بالعالم";
    const result = repairMissingTechnicalTokens(original, translation);
    expect(result.safe).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.text.replace("[XENO:wait]", "")).toBe(translation);
    expect(result.text).toBe("مرحبًا [XENO:wait]بالعالم");
    expect(diffTechnicalTags(original, result.text).sequenceMatch).toBe(true);
  });

  it("keeps both Arabic text and already-correct source tags in place", () => {
    const original = "[System:Color] Hello [XENO:wait] world";
    const translation = "[System:Color] مرحبا بالعالم";
    const result = repairMissingTechnicalTokens(original, translation);
    expect(result.safe).toBe(true);
    expect(result.text.startsWith("[System:Color] ")).toBe(true);
    expect(result.text.replace("[XENO:wait]", "")).toBe(translation);
    expect(diffTechnicalTags(original, result.text).sequenceMatch).toBe(true);
  });

  it("restores terminal printf slot without replacing any Arabic words", () => {
    const original = "You have %d";
    const translation = "لديك";
    const result = repairMissingTechnicalTokens(original, translation);
    expect(result.text).toBe("لديك%d");
    expect(result.inserted).toEqual(["%d"]);
  });

  it("does not guess where a repeated identical missing slot belongs", () => {
    const result = repairMissingTechnicalTokens("First %s and then %s", "أولًا %s ثم");
    expect(result.safe).toBe(false);
    expect(result.text).toBe("أولًا %s ثم");
  });

  it("never overwrites Arabic if a different runtime token is present", () => {
    const result = repairMissingTechnicalTokens("Hi [XENO:wait]", "مرحبًا [XENO:bad]");
    expect(result.safe).toBe(false);
    expect(result.text).toBe("مرحبًا [XENO:bad]");
  });

  it("keeps Arabic exactly when two distinct tags have been dropped", () => {
    const original = "Open {player} then use {item} now";
    const translation = "افتح الباب ثم استخدم السلاح الآن";
    const result = repairMissingTechnicalTokens(original, translation);
    expect(result.safe).toBe(true);
    expect(result.text.replace("{player}", "").replace("{item}", "")).toBe(translation);
    expect(diffTechnicalTags(original, result.text).sequenceMatch).toBe(true);
  });
});

describe("line splitting safety", () => {
  it("does not anchor the original newline after a different tag", () => {
    const original = "{fb}\nHello";
    const translation = "{fa}مرحبا";
    expect(countMissingTagNewlines(original, translation)).toBe(0);
    expect(fixTagNewlines(original, translation)).toBe(translation);
  });

  it("adds a newline only after an exactly corresponding tag", () => {
    const original = "{fb}\nHello";
    const translation = "{fb} مرحبا";
    expect(countMissingTagNewlines(original, translation)).toBe(1);
    expect(fixTagNewlines(original, translation)).toBe("{fb}\nمرحبا");
  });

  it("preserves a blank paragraph from English when Arabic is one line", () => {
    const original = "First paragraph\n\nNext part\nand final line";
    const translation = "هذه الفقرة الأولى ثم تأتي الفقرة التالية وفي النهاية يظهر السطر الأخير";
    const result = rebalanceTranslationLines(original, translation, 4);
    const lines = result.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe("");
    expect(lines[0].length).toBeGreaterThan(0);
    expect(lines[2].length).toBeGreaterThan(0);
    expect(lines[3].length).toBeGreaterThan(0);
    expect(lines.filter(Boolean).join(" ").replace(/\s+/g, " ")).toBe(translation);
  });

  it("preserves CRLF paragraph boundaries from the original", () => {
    const original = "One\r\n\r\nTwo\r\nThree";
    const translation = "أول مقطع ثم الجزء الثاني ثم السطر الثالث";
    const result = rebalanceTranslationLines(original, translation, 4);
    expect(result.split("\r\n")[1]).toBe("");
    expect(result.replace(/\r\n/g, "\n").split("\n")).toHaveLength(4);
  });
});
