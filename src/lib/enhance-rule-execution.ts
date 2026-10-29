import {
  getProfileBuiltinRules, type EnhanceRule, type BuiltinOverride,
} from "./enhance-rules";
import type { AiGameProfile } from "./ai-game-profiles";

type Mode = "grammar" | "enhance" | "combined";

const TYPE_RULE_IDS: Record<string, string[]> = {
  missing_char: ["detect_missing_char"], accuracy: ["detect_accuracy", "detect_risen_gendered_pickup", "detect_pkm_var"],
  grammar: ["detect_accuracy"], punctuation: ["detect_accuracy"],
  style: ["detect_phrasing", "detect_gs2_dialogue_voice", "detect_gs2_line_fit"],
  weak: ["detect_phrasing", "detect_gs2_dialogue_voice", "detect_gs2_line_fit"],
  reorder: ["detect_word_order", "detect_gs2_control_codes"],
  consistency: ["detect_consistency", "detect_pkm_name_consistency", "detect_gs2_ui_consistency"],
  terminology: ["detect_terminology", "detect_gs2_names_terms"],
  untranslated: ["detect_untranslated"],
  line_breaks: ["detect_line_breaks", "detect_risen_line_structure", "detect_pkm_linebreaks", "detect_gs2_control_codes"],
  split_and_tags: ["detect_split_and_tags", "detect_black2_tags", "detect_plat_tags", "detect_pkm_overflow", "detect_gs2_control_codes"],
};
const CATEGORY_RULE_IDS: Record<string, string[]> = {
  wrong: ["detect_accuracy", "detect_missing_char", "detect_terminology", "detect_untranslated", "detect_risen_gendered_pickup", "detect_gs2_control_codes", "detect_gs2_names_terms", "detect_gs2_ui_consistency"],
  reorder: ["detect_word_order", "detect_gs2_control_codes"],
  weak: ["detect_phrasing", "detect_gs2_dialogue_voice", "detect_gs2_line_fit"],
};

export function getActiveEnhancementRules(
  profile: AiGameProfile,
  enabled: ReadonlySet<string>,
  custom: EnhanceRule[],
  overrides: Record<string, BuiltinOverride>,
): EnhanceRule[] {
  const builtin = getProfileBuiltinRules(profile).map(rule => {
    const override = overrides[rule.id];
    return override ? { ...rule, ...override } : rule;
  });
  return [...builtin, ...custom].filter(rule => enabled.has(rule.id));
}

export function buildActiveEnhancementInstructions(activeRules: EnhanceRule[]): string {
  const detect = activeRules.filter(rule => rule.kind === "detect");
  const protect = activeRules.filter(rule => rule.kind === "protect");
  return [
    "Apply ONLY the enabled detection rules below. Every reported finding MUST include rule_id set to the exact id of its responsible enabled detection rule, not a disabled or invented id. If no detector applies, return an empty array.",
    "قواعد الاكتشاف المفعلة:",
    ...detect.map(rule => "[" + rule.id + "] " + rule.prompt),
    "قواعد الحماية المفعلة:",
    ...protect.map(rule => "[" + rule.id + "] " + rule.prompt),
  ].join("\n");
}

/** Client-side post-validation for browser-direct providers. Backend providers
 * separately enforce enabled rule ids after their model has responded. */
export function isFindingAllowedByRules(
  finding: Record<string, unknown>,
  mode: Mode,
  activeDetectIds: ReadonlySet<string>,
): boolean {
  const explicit = typeof finding.rule_id === "string" ? finding.rule_id
    : typeof finding.ruleId === "string" ? finding.ruleId : "";
  if (explicit) return activeDetectIds.has(explicit);
  const raw = mode === "grammar" ? finding.category : finding.type;
  const id = typeof raw === "string" ? raw : "";
  const known = mode === "grammar" ? CATEGORY_RULE_IDS[id] : TYPE_RULE_IDS[id];
  return !!known?.some(ruleId => activeDetectIds.has(ruleId));
}

export function filterDirectEnhancementFindings(
  response: Record<string, unknown>,
  mode: Mode,
  activeDetectIds: ReadonlySet<string>,
): Record<string, unknown> {
  const field = mode === "grammar" ? "issues" : mode === "combined" ? "results" : "suggestions";
  const items = response[field];
  if (!Array.isArray(items)) return response;
  return {
    ...response,
    [field]: items.filter(item =>
      !!item && typeof item === "object" &&
      isFindingAllowedByRules(item as Record<string, unknown>, mode, activeDetectIds)),
  };
}
