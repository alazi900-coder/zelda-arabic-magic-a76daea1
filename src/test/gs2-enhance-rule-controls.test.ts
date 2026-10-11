import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  getProfileBuiltinRules, loadEnabledRules, saveEnabledRules,
  loadCustomRules, saveCustomRules, loadBuiltinOverrides, saveBuiltinOverrides,
  type EnhanceRule,
} from "@/lib/enhance-rules";
import {
  getActiveEnhancementRules, buildActiveEnhancementInstructions,
  filterDirectEnhancementFindings,
} from "@/lib/enhance-rule-execution";

const GS2_IDS = [
  "detect_gs2_control_codes", "detect_gs2_line_fit", "detect_gs2_dialogue_voice",
  "detect_gs2_names_terms", "detect_gs2_ui_consistency",
  "protect_gs2_rtl_unicode", "protect_gs2_dialogue_structure",
];

const customRule: EnhanceRule = {
  id: "custom_gs2_qa", label: "اختبار خاص", description: "خاص بهذه اللعبة",
  kind: "detect", defaultEnabled: true, prompt: "افحص كتابة المصطلح المحدد بدقة", custom: true,
};

describe("Golden Sun: The Lost Age — enhancement rules", () => {
  beforeEach(() => localStorage.clear());

  it("provides seven new game-specific controls with useful prompts", () => {
    const rules = getProfileBuiltinRules("goldensun2");
    expect(GS2_IDS.every(id => rules.some(r => r.id === id && r.defaultEnabled))).toBe(true);
    expect(rules.find(r => r.id === "detect_gs2_control_codes")?.prompt).toContain("\\x03");
    expect(rules.find(r => r.id === "detect_gs2_names_terms")?.prompt).toContain("Felix");
    expect(rules.find(r => r.id === "detect_gs2_dialogue_voice")?.prompt).toContain("JRPG");
    expect(rules.find(r => r.id === "protect_gs2_rtl_unicode")?.prompt).toContain("BiDi");
  });

  it("isolates all seven rules from Golden Sun I and Xenoblade", () => {
    for (const profile of ["goldensun", "xenoblade", "mother3", "generic"] as const) {
      expect(getProfileBuiltinRules(profile).filter(r => GS2_IDS.includes(r.id))).toEqual([]);
    }
    expect(getProfileBuiltinRules("goldensun2").some(r => r.prompt.includes("[XENO:n]"))).toBe(false);
  });

  it("persists each toggle independently after reload", () => {
    const enabled = loadEnabledRules("goldensun2");
    expect(enabled.has("detect_gs2_line_fit")).toBe(true);
    enabled.delete("detect_gs2_line_fit");
    enabled.delete("protect_gs2_rtl_unicode");
    saveEnabledRules(enabled, "goldensun2");
    expect(loadEnabledRules("goldensun2").has("detect_gs2_line_fit")).toBe(false);
    expect(loadEnabledRules("goldensun2").has("protect_gs2_rtl_unicode")).toBe(false);
    expect(loadEnabledRules("goldensun2").has("detect_gs2_names_terms")).toBe(true);
    expect(loadEnabledRules("goldensun").has("detect_gs2_names_terms")).toBe(false);
  });

  it("persists newly added custom rules with enabled state on first save", () => {
    saveCustomRules([customRule], "goldensun2"); // matches fixed dialog commit order
    const enabled = new Set([...loadEnabledRules("goldensun2"), customRule.id]);
    saveEnabledRules(enabled, "goldensun2");
    expect(loadCustomRules("goldensun2").map(r => r.id)).toEqual([customRule.id]);
    expect(loadEnabledRules("goldensun2").has(customRule.id)).toBe(true);
    expect(loadEnabledRules("goldensun").has(customRule.id)).toBe(false);
  });

  it("updates and disables custom rules independently", () => {
    saveCustomRules([customRule], "goldensun2");
    saveEnabledRules(new Set([customRule.id]), "goldensun2");
    saveCustomRules([{ ...customRule, prompt: "قانون خاص محرر" }], "goldensun2");
    expect(loadCustomRules("goldensun2")[0].prompt).toBe("قانون خاص محرر");
    saveEnabledRules(new Set(), "goldensun2");
    expect(loadEnabledRules("goldensun2")).toEqual(new Set());
    expect(loadCustomRules("goldensun2")).toHaveLength(1);
  });

  it("respects edited built-in prompts and switches when building active prompts", () => {
    saveBuiltinOverrides({ detect_gs2_line_fit: { prompt: "افحص طول الحوارات دون تغيير الرموز" } }, "goldensun2");
    const active = getActiveEnhancementRules("goldensun2", new Set(["detect_gs2_line_fit"]), [], loadBuiltinOverrides("goldensun2"));
    const prompt = buildActiveEnhancementInstructions(active);
    expect(active).toHaveLength(1);
    expect(prompt).toContain("[detect_gs2_line_fit]");
    expect(prompt).toContain("افحص طول الحوارات دون تغيير الرموز");
    expect(prompt).not.toContain("[detect_gs2_names_terms]");
  });

  it("passes enabled custom findings, rejects disabled built-in findings, for direct providers", () => {
    const filtered = filterDirectEnhancementFindings({
      suggestions: [
        { rule_id: customRule.id, type: "accuracy", suggested: "نص عربي" },
        { rule_id: "detect_gs2_names_terms", type: "terminology", suggested: "خاطئ" },
        { type: "style", suggested: "بدون قاعدة فعالة" },
        { rule_id: "custom_fake", type: "custom", suggested: "غير موجود" },
      ],
    }, "enhance", new Set([customRule.id]));
    expect(filtered.suggestions).toEqual([{ rule_id: customRule.id, type: "accuracy", suggested: "نص عربي" }]);
  });

  it("allows correctly named GS2 rule findings but rejects an unrelated one", () => {
    const filtered = filterDirectEnhancementFindings({
      results: [
        { rule_id: "detect_gs2_control_codes", type: "split_and_tags" },
        { rule_id: "detect_split_and_tags", type: "split_and_tags" },
        { type: "terminology" },
      ],
    }, "combined", new Set(["detect_gs2_control_codes"]));
    expect(filtered.results).toEqual([{ rule_id: "detect_gs2_control_codes", type: "split_and_tags" }]);
  });

  it("keeps no-detection profile empty, including grammar mode", () => {
    expect(filterDirectEnhancementFindings({
      issues: [{ category: "wrong" }, { rule_id: customRule.id, category: "weak" }],
    }, "grammar", new Set()).issues).toEqual([]);
  });

  it("mirrors all GS2 rule IDs on the backend and routes allowed findings via rule_id", () => {
    const server = readFileSync("supabase/functions/enhance-translations/index.ts", "utf8");
    for (const id of GS2_IDS) expect(server).toContain("id: '" + id + "'");
    expect(server).toContain("GOLDENSUN2_ONLY_RULE_IDS");
    expect(server).toContain("&& !isGoldenSun");
    expect(server).toContain("ruleId: s.rule_id");
    expect(server).toContain("ruleId: i.rule_id");
    expect(server).toContain("detectRuleIds");
  });

  it("invalidates cached scans when prompts change and applies rules to direct providers", () => {
    const ui = readFileSync("src/components/editor/TranslationAIEnhancePanel.tsx", "utf8");
    expect(ui).toContain('"profiles-v2"');
    expect(ui).toContain("fingerprintAiContext(JSON.stringify(activeRulesForThisRun");
    expect(ui).toContain("filterDirectEnhancementFindings(data, mode, activeDetectIds)");
    expect(ui).toContain("activeRulesPrompt");
  });
});
