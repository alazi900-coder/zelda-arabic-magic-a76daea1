import { beforeEach, describe, expect, it } from "vitest";
import {
  AI_PROFILE_NAMES, resolveAiGameProfile,
  loadAiProfilePrompt, saveAiProfilePrompt, profileDefaultPrompt,
} from "@/lib/ai-game-profiles";
import {
  getProfileBuiltinRules, loadEnabledRules, saveEnabledRules,
  loadCustomRules, saveCustomRules, loadBuiltinOverrides, saveBuiltinOverrides,
} from "@/lib/enhance-rules";

describe("game-specific AI enhancement profiles", () => {
  beforeEach(() => localStorage.clear());

  it("distinguishes Golden Sun 1 and The Lost Age by actual text source", () => {
    expect(resolveAiGameProfile("goldensun/dialogue")).toBe("goldensun");
    expect(resolveAiGameProfile("goldensun/lost-age/strings")).toBe("goldensun2");
    expect(resolveAiGameProfile("gtaiv/mission")).toBe("gtaiv");
    expect(resolveAiGameProfile("unknown-game/custom.bin")).toBe("generic");
    expect(AI_PROFILE_NAMES.goldensun2).toContain("The Lost Age");
  });

  it("filters away rules and literal [XENO:n] from Golden Sun profiles", () => {
    const gs = getProfileBuiltinRules("goldensun2");
    const xeno = getProfileBuiltinRules("xenoblade");
    expect(gs.some(r => r.id === "detect_split_and_tags")).toBe(false);
    expect(gs.some(r => r.id === "detect_line_breaks")).toBe(false);
    expect(gs.some(r => r.id === "detect_pkm_linebreaks")).toBe(false);
    expect(gs.find(r => r.id === "protect_tech_tags")?.prompt).toContain("\\xNN");
    expect(gs.some(r => r.prompt.includes("[XENO:n]"))).toBe(false);
    expect(xeno.some(r => r.id === "detect_split_and_tags")).toBe(true);
    expect(xeno.some(r => r.id === "detect_risen_gendered_pickup")).toBe(false);
    expect(profileDefaultPrompt("goldensun")).toContain("Isaac");
    expect(profileDefaultPrompt("goldensun2")).toContain("Felix");
  });

  it("keeps the original Xenoblade settings in their legacy keys", () => {
    localStorage.setItem("xc1_enhance_rules_v1", '["detect_accuracy","detect_split_and_tags"]');
    expect(loadEnabledRules("xenoblade")).toEqual(new Set(["detect_accuracy", "detect_split_and_tags"]));
    expect(loadEnabledRules("goldensun2").has("detect_split_and_tags")).toBe(false);
    saveEnabledRules(new Set(["detect_phrasing"]), "xenoblade");
    expect(localStorage.getItem("xc1_enhance_rules_v1")).toBe('["detect_phrasing"]');
  });

  it("persists rules, custom prompts and built-in edits independently", () => {
    saveEnabledRules(new Set(["detect_accuracy"]), "goldensun");
    saveEnabledRules(new Set(["detect_phrasing"]), "goldensun2");
    expect(loadEnabledRules("goldensun")).toEqual(new Set(["detect_accuracy"]));
    expect(loadEnabledRules("goldensun2")).toEqual(new Set(["detect_phrasing"]));
    saveAiProfilePrompt("goldensun", "الجزء الأول");
    saveAiProfilePrompt("goldensun2", "الجزء الثاني");
    expect(loadAiProfilePrompt("goldensun")).toBe("الجزء الأول");
    expect(loadAiProfilePrompt("goldensun2")).toBe("الجزء الثاني");
    expect(loadAiProfilePrompt("xenoblade")).toBe("");
    const custom = { id: "custom_test", label: "خاص", description: "", kind: "detect" as const, prompt: "تدقيق خاص", defaultEnabled: true };
    saveCustomRules([custom], "goldensun2");
    expect(loadCustomRules("goldensun")).toHaveLength(0);
    expect(loadCustomRules("goldensun2")).toHaveLength(1);
    saveBuiltinOverrides({ detect_accuracy: { prompt: "نسخة ثانية" } }, "goldensun2");
    expect(loadBuiltinOverrides("goldensun")).toEqual({});
    expect(loadBuiltinOverrides("goldensun2").detect_accuracy.prompt).toBe("نسخة ثانية");
  });
});
