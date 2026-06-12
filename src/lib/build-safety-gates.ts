/**
 * Pure, testable safety-gate helpers used by `useEditorBuild.ts`.
 *
 * These rules decide whether a user's translation is kept, repaired, or
 * reverted/deleted during the build. Centralizing them here:
 *   1. Guarantees the build hook and the unit tests use the SAME logic
 *      (no drift between "what we test" and "what runs").
 *   2. Makes silent reverts impossible to re-introduce without breaking tests.
 *
 * Invariant (regression-proofed by tests):
 *   A translation is NEVER silently replaced by the English original unless
 *   the gate returns an explicit `reason`. Tag-sequence / missing-control /
 *   exactTagMatch differences alone are NOT enough to delete a translation.
 */
import { repairTranslationTagsForBuild } from "@/lib/xc3-build-tag-guard";

const RE_CONTROL = /[\uFFF9\uFFFA\uFFFB\uFFFC]/g;
const RE_PUA = /[\uE000-\uE0FF]/g;

export type GateAction = "keep" | "repair" | "revert" | "delete";

export interface MsbtGateResult {
  action: "keep" | "repair" | "delete";
  text: string;
  /** Localized Arabic reason; present only when action !== 'keep'. */
  reason?: string;
  /** Soft warnings — translation is kept but flagged in the report. */
  warnings: string[];
}

/**
 * MSBT safety gate. ONLY deletes on truly catastrophic conditions
 * (NULL char, unbalanced brackets, unbalanced Ruby tags). Everything
 * else is kept (with warnings logged for the report).
 */
export function evaluateMsbtSafety(original: string, translation: string): MsbtGateResult {
  const tagRepair = repairTranslationTagsForBuild(original, translation);
  const text = tagRepair.text;

  const hasNullChar = text.includes("\x00");
  const openBrackets = (text.match(/\[/g) || []).length;
  const closeBrackets = (text.match(/\]/g) || []).length;
  const bracketMismatch = openBrackets !== closeBrackets;
  const rubyOpen = (text.match(/\[\s*System\s*:\s*Ruby[^\]]*\]/gi) || []).length;
  const rubyClose = (text.match(/\[\s*\/\s*System\s*:\s*Ruby[^\]]*\]/gi) || []).length;
  const rubyMismatch = rubyOpen !== rubyClose;

  // NEVER delete. Catastrophic conditions are reported as warnings only —
  // the translation is always kept, and the user decides whether to fix it.
  const warnings: string[] = [];
  if (hasNullChar) warnings.push("⚠️ يحتوي على رمز NULL (قد يسبب توقف اللعبة)");
  if (bracketMismatch) warnings.push(`⚠️ أقواس غير متوازنة (${openBrackets}[ vs ${closeBrackets}])`);
  if (rubyMismatch) warnings.push(`⚠️ وسوم Ruby غير متطابقة (${rubyOpen} مفتوح / ${rubyClose} مغلق)`);
  if (!tagRepair.exactTagMatch) warnings.push("اختلاف عدد الوسوم التقنية");
  if (!tagRepair.sequenceMatch) warnings.push("ترتيب الوسوم مختلف عن الأصل");
  if (tagRepair.missingClosingTags) warnings.push("وسوم إغلاق ناقصة");
  if (tagRepair.missingControlOrPua) warnings.push("رموز تحكم/خاصة ناقصة");

  return { action: tagRepair.changed ? "repair" : "keep", text, warnings };
}

export interface DollarVarGateResult {
  action: "keep" | "repair" | "revert";
  text: string;
  reason?: string;
}

/**
 * `$N` variable gate. If the original has `$1`/`$2`/... and the translation
 * dropped them, first try local repair (handles `دولار1`, `1.$`, etc.).
 * Only revert if repair fails — silent revert without a repair attempt
 * is a bug we explicitly test against.
 */
export function evaluateDollarVarGate(original: string, translation: string): DollarVarGateResult {
  const origVars = original.match(/\$\d+/g);
  if (!origVars || origVars.length === 0) return { action: "keep", text: translation };
  if (origVars.every((v) => translation.includes(v))) return { action: "keep", text: translation };

  const repaired = repairTranslationTagsForBuild(original, translation);
  if (repaired.changed && origVars.every((v) => repaired.text.includes(v))) {
    return { action: "repair", text: repaired.text };
  }
  return { action: "revert", text: original, reason: "متغيرات $N غير قابلة للإصلاح" };
}

export interface ControlPuaGateResult {
  action: "keep" | "repair";
  text: string;
  warnings: string[];
}

/**
 * Final control/PUA char gate. Never reverts — keeps the user's text even
 * if some control chars are missing, logging a warning instead. The old
 * behaviour silently replaced with English when `repair.changed === false`,
 * which is the bug this gate guards against.
 */
export function evaluateControlPuaGate(original: string, translation: string): ControlPuaGateResult {
  const origCC = (original.match(RE_CONTROL) || []).length;
  const transCC = (translation.match(RE_CONTROL) || []).length;
  const origPUA = (original.match(RE_PUA) || []).length;
  const transPUA = (translation.match(RE_PUA) || []).length;

  if (origCC === transCC && origPUA === transPUA) {
    return { action: "keep", text: translation, warnings: [] };
  }
  if ((origCC > 0 && transCC === origCC) && (origPUA === 0 || transPUA === origPUA)) {
    return { action: "keep", text: translation, warnings: [] };
  }

  const repaired = repairTranslationTagsForBuild(original, translation);
  const fixedCC = (repaired.text.match(RE_CONTROL) || []).length;
  const fixedPUA = (repaired.text.match(RE_PUA) || []).length;
  const warnings: string[] = [];
  if (origCC > 0 && fixedCC !== origCC) warnings.push(`رموز تحكم ناقصة: ${origCC - fixedCC}`);
  if (origPUA > 0 && fixedPUA !== origPUA) warnings.push(`رموز خاصة ناقصة: ${origPUA - fixedPUA}`);

  return { action: repaired.changed ? "repair" : "keep", text: repaired.changed ? repaired.text : translation, warnings };
}
