import { describe, expect, it } from "vitest";
import { detectIssues } from "@/lib/diagnostic-detect";
import {
  diagnoseGoldenSun2Translation, isGoldenSun2DiagnosticEntry,
} from "@/lib/goldensun/goldensun2-deep-diagnostic";
import { validateGoldenSun2Translation } from "@/lib/goldensun/goldensun2-editor-bridge";

const esc = String.fromCharCode(92);
const tag03 = esc + "x03";
const tag1B = esc + "x1B";
const source = "Hello" + tag03;
const entry = (original = source, file = "goldensun/lost-age/strings") => ({
  msbtFile: file,
  index: 9,
  label: "GS2 text 9",
  original,
  maxBytes: 0,
});
const rawEsc = String.fromCharCode(0x1b);

describe("Golden Sun II deep diagnostic recognizes the ROM text namespace", () => {
  it("identifies real Golden Sun II text and imported catalogs, without changing other games", () => {
    expect(isGoldenSun2DiagnosticEntry("goldensun/lost-age/strings")).toBe(true);
    expect(isGoldenSun2DiagnosticEntry("goldensun/lost-age/catalog")).toBe(true);
    expect(isGoldenSun2DiagnosticEntry("goldensun/strings")).toBe(false);
    expect(isGoldenSun2DiagnosticEntry("xenoblade/strings")).toBe(false);
  });

  it("detects extra raw U+001B absent from original and can remove ONLY it", () => {
    const translation = "أهلاً" + rawEsc + tag03;
    const diagnosis = diagnoseGoldenSun2Translation(source, translation);
    expect(diagnosis.unexpectedCount).toBe(1);
    expect(diagnosis.unexpectedCodes).toContain("U+001B");
    expect(diagnosis.proposed).toBe("أهلاً" + tag03);
    expect(diagnosis.safeToRepair).toBe(true);
    expect(validateGoldenSun2Translation(source, diagnosis.proposed).valid).toBe(true);
    const issues = detectIssues(entry(), translation);
    expect(issues.map(i => i.category)).toEqual(["gs2_unexpected_controls"]);
    expect(issues[0].key).toBe("goldensun/lost-age/strings:9");
    expect(issues[0].message).toContain("U+001B");
  });

  it("recognizes extra explicit control tags and invisible BiDi markers while keeping source commands", () => {
    const extra = "مرحبا" + tag1B + tag03 + "\u200F";
    const check = diagnoseGoldenSun2Translation(source, extra);
    expect(check.unexpectedCount).toBe(2);
    expect(check.unexpectedCodes).toContain("U+200F");
    expect(check.proposed).toBe("مرحبا" + tag03);
    expect(check.safeToRepair).toBe(true);
    expect(detectIssues(entry(), extra).map(x => x.category)).toEqual(["gs2_unexpected_controls"]);
  });

  it("preserves original raw controls when the ROM source requires them", () => {
    const original = "Ready" + tag1B + tag03;
    const check = diagnoseGoldenSun2Translation(original, "مستعد" + rawEsc + tag03);
    expect(check.unexpectedCount).toBe(0);
    expect(check.safeToRepair).toBe(false);
    expect(check.validTokens).toBe(true);
    expect(detectIssues(entry(original), "مستعد" + rawEsc + tag03)).toEqual([]);
  });

  it("flags missing or reordered real control codes but refuses automatic deletion or invented replacement", () => {
    const original = "Ready" + tag1B + tag03;
    const translated = "مستعد" + tag03;
    const result = diagnoseGoldenSun2Translation(original, translated);
    expect(result.safeToRepair).toBe(false);
    expect(result.validTokens).toBe(false);
    expect(detectIssues(entry(original), translated).map(x => x.category)).toEqual(["gs2_token_mismatch"]);
    const reordered = "مستعد" + tag03 + tag1B;
    expect(detectIssues(entry(original), reordered).map(x => x.category)).toEqual(["gs2_token_mismatch"]);
  });

  it("ignores generic Xenoblade line and formatting heuristics for valid GS2 dialogue", () => {
    const original = "A" + tag03;
    const veryLongArabic = "هذا نص عربي طويل ".repeat(40) + tag03;
    expect(detectIssues(entry(original, "goldensun/lost-age/catalog"), veryLongArabic)).toEqual([]);
  });

  it("leaves other games on their original diagnostic engine", () => {
    const check = detectIssues(entry("English", "other/strings"), "English\u200F");
    expect(check.some(i => i.category === "gs2_unexpected_controls")).toBe(false);
  });
});
