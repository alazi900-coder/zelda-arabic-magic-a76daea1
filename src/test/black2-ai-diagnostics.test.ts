import { describe, expect, it } from "vitest";
import { resolveAiGameProfile, isRuleForAiProfile, profileDefaultPrompt } from "@/lib/ai-game-profiles";
import { resolveGameParam } from "@/lib/game-param";
import { getProfileBuiltinRules } from "@/lib/enhance-rules";
import { detectIssues } from "@/lib/diagnostic-detect";
import { validateBlack2Translation } from "@/lib/pokemon-black2/black2-json";

const sample = {
  msbtFile: "black2/a/0/0/2/bank_8/section_0",
  index: 0,
  label: "br_res · a/0/0/2:0008:0:0000",
  original: "Hello [CTRL:0202:0000]\n[CHAR:FFFF]",
  maxBytes: 65535,
};

describe("Pokémon Black 2: QA + AI integration", () => {
  it("resolves the game's identity without falling through to Xenoblade", () => {
    expect(resolveGameParam(sample.msbtFile)).toBe("black2");
    expect(resolveAiGameProfile(sample.msbtFile)).toBe("black2");
    expect(profileDefaultPrompt("black2")).toContain("[CTRL:...]");
  });

  it("keeps rules from Platinum and Xenoblade outside the Black 2 profile", () => {
    const rules = getProfileBuiltinRules("black2");
    expect(rules.some(rule => rule.id === "detect_black2_tags")).toBe(true);
    expect(rules.some(rule => rule.id === "detect_plat_tags")).toBe(false);
    expect(rules.some(rule => rule.id === "detect_split_and_tags")).toBe(false);
    expect(isRuleForAiProfile("detect_black2_tags", "platinum")).toBe(false);
  });

  it("deep scan finds broken/reordered controls but accepts a sound translation", () => {
    const good = "مرحبًا [CTRL:0202:0000]\n[CHAR:FFFF]";
    const broken = "مرحبًا [CHAR:FFFF]\n[CTRL:0202:0000]";
    expect(validateBlack2Translation(sample.original, good)).toBeNull();
    expect(validateBlack2Translation(sample.original, broken)).not.toBeNull();
    expect(detectIssues(sample, broken).some(issue => issue.category === "black2_token_mismatch" && issue.severity === "critical")).toBe(true);
    expect(detectIssues(sample, good).some(issue => issue.category === "black2_token_mismatch")).toBe(false);
  });
});
