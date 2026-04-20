/**
 * Pure detection layer for the Deep Diagnostic Panel.
 *
 * This module is intentionally side-effect-free and React-free so it can run
 * inside a Web Worker. The dependency graph is:
 *   diagnostic-detect.ts
 *     └─ xc3-build-tag-guard.ts (diffTechnicalTags)
 *          └─ xc3-tag-restoration.ts
 *               └─ tag-bracket-fix.ts
 * — all of which are pure regex / string utilities.
 *
 * The UI layer (`DeepDiagnosticPanel.tsx`) re-exports `detectIssues` from here
 * for backward compatibility with existing imports and tests.
 */

import { diffTechnicalTags } from "@/lib/xc3-build-tag-guard";
import { countEffectiveLines } from "@/lib/text-tokens";

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export type Severity = "critical" | "warning" | "info";

export interface DiagnosticIssue {
  key: string;
  label: string;
  original: string;
  translation: string;
  severity: Severity;
  category: string;
  message: string;
}

/** Subset of `ExtractedEntry` actually consumed by detection. Keeping the
 *  surface narrow lets the worker accept transferable plain objects without
 *  pulling in the full editor types. */
export interface DetectableEntry {
  msbtFile: string;
  index: number | string;
  label: string;
  original: string;
  maxBytes: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Patterns
// ───────────────────────────────────────────────────────────────────────────

const RE_CONTROL = /[\uFFF9\uFFFA\uFFFB\uFFFC]/g;
const RE_PUA = /[\uE000-\uE0FF]/g;
const RE_TECHNICAL_SLOT = /\d+\s*\\?\[[^\]]*\\?\]|\\?\[[^\]]*\\?\]\s*\d+|\\?\[[^\]]*\\?\]|\{[^}]*\}/g;
const RE_PLACEHOLDER = /\uFFFC/g;
const RE_PRESENTATION_B = /[\uFE70-\uFEFF]/;
const RE_PRESENTATION_A = /[\uFB50-\uFDFF]/;
const RE_ARABIC_STANDARD = /[\u0600-\u06FF]/;
const RE_NULL_CHAR = /\x00/;
const RE_INVISIBLE = /[\u200B\u200C\u200D\u200E\u200F\u202A-\u202E\u2060\u2061\u2062\u2063\u2064\uFEFF\u00AD\u034F\u061C\u180E]/g;
const RE_ORIG_DOLLAR_VARS = /\$\d+/g;
const RE_CORRUPTED_DOLLAR = /دولار\s*\$?\d+|\d+\s*\.\s*\$|\$\s*\.\s*\d+|\d+\s+دولار|\$\d+\.(?!\d)/g;
const RE_RUBY_OPEN = /\[\s*System\s*:\s*Ruby[^\]]*\]/gi;
const RE_RUBY_CLOSE = /\[\s*\/\s*System\s*:\s*Ruby[^\]]*\]/gi;
const RE_TRANSLATED_TECHNICAL_SLOT = /\d+\s*\\?\[[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\s:]+\\?\]|\\?\[[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\s:]+\\?\]\s*\d+|\\?\[[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\s]+\\?\]|\{[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\s:]+\}/g;

const encoder = new TextEncoder();

const SPECIFIC_TECHNICAL_ISSUE_CATEGORIES = new Set([
  "control_chars",
  "pua_chars",
  "unmatched_ruby",
  "broken_tag_syntax",
  "control_extra",
  "translated_tags",
  "tag_mismatch",
  "placeholder_mismatch",
  "corrupted_vars",
  "missing_vars",
]);

type TechnicalTagKind = "bracket" | "brace";

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function countMatches(text: string, re: RegExp): number {
  re.lastIndex = 0;
  return (text.match(re) || []).length;
}

function getMatches(text: string, re: RegExp): string[] {
  re.lastIndex = 0;
  return text.match(re) || [];
}

function getTechnicalTagKind(tag: string): TechnicalTagKind {
  return tag.trim().startsWith("{") ? "brace" : "bracket";
}

function formatTechnicalToken(token: string): string {
  return Array.from(token).map((char) => {
    if (/[\uFFF9-\uFFFC\uE000-\uE0FF]/.test(char)) {
      return `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
    }
    return char;
  }).join("");
}

function excludeTranslatedReplacementTags(missingTags: string[], translatedTags: string[]): string[] {
  const translatedSlots: Record<TechnicalTagKind, number> = { bracket: 0, brace: 0 };
  for (const tag of translatedTags) translatedSlots[getTechnicalTagKind(tag)]++;
  const unresolved: string[] = [];
  for (const tag of missingTags) {
    const kind = getTechnicalTagKind(tag);
    if (translatedSlots[kind] > 0) {
      translatedSlots[kind]--;
      continue;
    }
    unresolved.push(tag);
  }
  return unresolved;
}

/** Count unescaped brackets (exclude \[ and \]) */
function countUnescapedBrackets(text: string): { open: number; close: number } {
  let open = 0, close = 0;
  for (let i = 0; i < text.length; i++) {
    const prev = i > 0 ? text[i - 1] : "";
    if (text[i] === "[" && prev !== "\\") open++;
    if (text[i] === "]" && prev !== "\\") close++;
  }
  return { open, close };
}

// ───────────────────────────────────────────────────────────────────────────
// Detection (pure)
// ───────────────────────────────────────────────────────────────────────────

export function detectIssues(entry: DetectableEntry, translation: string): DiagnosticIssue[] {
  const key = `${entry.msbtFile}:${entry.index}`;
  const trimmed = translation.trim();
  const issues: DiagnosticIssue[] = [];
  const base = { key, label: entry.label, original: entry.original, translation };

  // 1. Control characters missing
  const origControl = countMatches(entry.original, RE_CONTROL);
  const transControl = countMatches(trimmed, RE_CONTROL);
  if (origControl > 0 && transControl < origControl) {
    issues.push({ ...base, severity: "critical", category: "control_chars",
      message: `${origControl - transControl} رمز تحكم مفقود من أصل ${origControl}` });
  }

  // 2. PUA characters missing
  const origPua = countMatches(entry.original, RE_PUA);
  const transPua = countMatches(trimmed, RE_PUA);
  if (origPua > 0 && transPua < origPua) {
    issues.push({ ...base, severity: "critical", category: "pua_chars",
      message: `${origPua - transPua} رمز خاص مفقود من أصل ${origPua}` });
  }

  // 3. Byte overflow
  if (entry.maxBytes > 0) {
    const byteLen = encoder.encode(trimmed).length;
    if (byteLen > entry.maxBytes) {
      issues.push({ ...base, severity: "critical", category: "byte_overflow",
        message: `${byteLen} بايت من حد أقصى ${entry.maxBytes} (تجاوز ${byteLen - entry.maxBytes})` });
    }
  }

  // 4. Double-shaped Arabic
  if ((RE_PRESENTATION_B.test(trimmed) || RE_PRESENTATION_A.test(trimmed)) && RE_ARABIC_STANDARD.test(trimmed)) {
    issues.push({ ...base, severity: "critical", category: "double_shaped",
      message: "النص يحتوي حروف عربية عادية ومعالجة في نفس الوقت — معالجة مزدوجة" });
  }

  // 5. NULL character
  if (RE_NULL_CHAR.test(trimmed)) {
    issues.push({ ...base, severity: "critical", category: "null_char",
      message: "يحتوي رمز NULL (\\0) — يقطع النص ويسبب تجمّد المحرك" });
  }

  // 6. Unmatched Ruby tags
  const rubyOpens = countMatches(trimmed, RE_RUBY_OPEN);
  const rubyCloses = countMatches(trimmed, RE_RUBY_CLOSE);
  if (rubyOpens !== rubyCloses) {
    issues.push({ ...base, severity: "critical", category: "unmatched_ruby",
      message: `${rubyOpens} فتح [System:Ruby] مقابل ${rubyCloses} إغلاق — غير متطابقة` });
  }

  // 7. Broken bracket syntax — use smart counting that excludes \[ \]
  const origBrackets = countUnescapedBrackets(entry.original);
  const transBrackets = countUnescapedBrackets(trimmed);
  if (transBrackets.open !== transBrackets.close && origBrackets.open === origBrackets.close) {
    issues.push({ ...base, severity: "critical", category: "broken_tag_syntax",
      message: `${transBrackets.open} قوس '[' مقابل ${transBrackets.close} قوس ']' — أقواس غير متوازنة` });
  }

  // 8. Extra control characters
  if (transControl > origControl && origControl > 0) {
    issues.push({ ...base, severity: "critical", category: "control_extra",
      message: `${transControl - origControl} رمز تحكم زائد (${transControl} مقابل ${origControl} في الأصل)` });
  }

  // 9. Translated tags — Arabic text inside bracket patterns
  const origTags = getMatches(entry.original, RE_TECHNICAL_SLOT);
  const translatedTags = origTags.length > 0
    ? getMatches(trimmed, RE_TRANSLATED_TECHNICAL_SLOT)
    : [];
  if (origTags.length > 0 && translatedTags.length > 0) {
    issues.push({ ...base, severity: "warning", category: "translated_tags",
      message: `${translatedTags.length} وسم مترجم: ${translatedTags.slice(0, 3).join(", ")}${translatedTags.length > 3 ? "..." : ""}` });
  }

  // 10. Invisible characters
  const invisibleMatches = getMatches(trimmed, RE_INVISIBLE);
  if (invisibleMatches.length > 0) {
    const codepoints = invisibleMatches.slice(0, 5).map(c => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`);
    issues.push({ ...base, severity: "warning", category: "invisible_chars",
      message: `${invisibleMatches.length} حرف غير مرئي: ${codepoints.join(", ")}${invisibleMatches.length > 5 ? "..." : ""}` });
  }

  // 11. Tag mismatch
  if (origTags.length > 0) {
    const missingTags = origTags.filter(t => !trimmed.includes(t));
    const unresolvedMissingTags = excludeTranslatedReplacementTags(missingTags, translatedTags);
    if (unresolvedMissingTags.length > 0) {
      issues.push({ ...base, severity: "warning", category: "tag_mismatch",
        message: `${unresolvedMissingTags.length} وسم مفقود: ${unresolvedMissingTags.slice(0, 3).join(", ")}${unresolvedMissingTags.length > 3 ? "..." : ""}` });
    }
  }

  // 12. Placeholder mismatch
  const origPh = countMatches(entry.original, RE_PLACEHOLDER);
  const transPh = countMatches(trimmed, RE_PLACEHOLDER);
  if (origPh > 0 && origPh !== transPh) {
    issues.push({ ...base, severity: "warning", category: "placeholder_mismatch",
      message: `${origPh} عنصر نائب في الأصل، ${transPh} في الترجمة` });
  }

  // 13. Newline mismatch
  const origNewlines = (entry.original.match(/\n/g) || []).length;
  const transNewlines = (trimmed.match(/\n/g) || []).length;
  if (origNewlines > 0 && Math.abs(transNewlines - origNewlines) >= 2) {
    issues.push({ ...base, severity: "warning", category: "newline_mismatch",
      message: `${origNewlines} سطر في الأصل مقابل ${transNewlines} في الترجمة (فرق ${Math.abs(transNewlines - origNewlines)})` });
  }

  // 14. Byte budget
  const origBytes = encoder.encode(entry.original).length;
  const transBytes = encoder.encode(trimmed).length;
  if (origBytes > 10 && transBytes > origBytes * 2) {
    const pct = Math.round((transBytes / origBytes) * 100);
    issues.push({ ...base, severity: "warning", category: "byte_budget",
      message: `${transBytes} بايت مقابل ${origBytes} في الأصل (${pct}%) — قد تستنفد ذاكرة المحرك` });
  }

  // 15. Excessive lines
  if (transNewlines >= origNewlines + 3) {
    issues.push({ ...base, severity: "warning", category: "excessive_lines",
      message: `${transNewlines + 1} سطر مقابل ${origNewlines + 1} في الأصل — زيادة ${transNewlines - origNewlines}` });
  }

  // 16. Empty translation
  if (translation.length > 0 && trimmed.length === 0) {
    issues.push({ ...base, severity: "warning", category: "empty_translation",
      message: "الترجمة تحتوي مسافات أو أحرف غير مرئية فقط" });
  }

  // 17. Corrupted / Missing $N variables
  const origDollarVars = getMatches(entry.original, RE_ORIG_DOLLAR_VARS);
  if (origDollarVars.length > 0) {
    const corruptedMatches = getMatches(trimmed, RE_CORRUPTED_DOLLAR);
    if (corruptedMatches.length > 0) {
      issues.push({ ...base, severity: "critical", category: "corrupted_vars",
        message: `${corruptedMatches.length} متغير تالف: ${corruptedMatches.slice(0, 3).join("، ")} — يجب أن تكون ${origDollarVars.join("، ")}` });
    }
    const transDollarVars = getMatches(trimmed, RE_ORIG_DOLLAR_VARS);
    if (corruptedMatches.length === 0) {
      const allMissing = origDollarVars.filter(v => !transDollarVars.includes(v));
      if (allMissing.length > 0) {
        issues.push({ ...base, severity: "critical", category: "missing_vars",
          message: `${allMissing.length} متغير مفقود: ${allMissing.join("، ")} — غير موجود في الترجمة` });
      }
    }
  }

  // 18. Technical multiset mismatch
  const technicalDiff = diffTechnicalTags(entry.original, trimmed);
  const hasSpecificTechnicalIssue = issues.some(issue => SPECIFIC_TECHNICAL_ISSUE_CATEGORIES.has(issue.category));
  if (!technicalDiff.exactTagMatch && !hasSpecificTechnicalIssue) {
    const messageParts: string[] = [];
    if (technicalDiff.missingTags.length > 0) {
      messageParts.push(
        `مفقود: ${technicalDiff.missingTags.slice(0, 3).map(formatTechnicalToken).join("، ")}${technicalDiff.missingTags.length > 3 ? "..." : ""}`
      );
    }
    if (technicalDiff.extraTags.length > 0) {
      messageParts.push(
        `مختلف/زائد: ${technicalDiff.extraTags.slice(0, 3).map(formatTechnicalToken).join("، ")}${technicalDiff.extraTags.length > 3 ? "..." : ""}`
      );
    }
    issues.push({
      ...base, severity: "critical", category: "technical_mismatch",
      message: messageParts.length > 0 ? messageParts.join(" — ") : "مجموعة الرموز التقنية لا تطابق الأصل بدقة",
    });
  }

  // 19. Tag order mismatch
  if (technicalDiff.exactTagMatch && !technicalDiff.sequenceMatch) {
    issues.push({
      ...base, severity: "critical", category: "tag_order_mismatch",
      message: "الوسوم التقنية موجودة لكن ترتيبها مقلوب مقارنة بالأصل — يسبب تجمّد المشاهد",
    });
  }

  // 20. [XENO:n ] not followed by \n
  const xenoNMatches = [...trimmed.matchAll(/\[XENO:n\s*\]/g)];
  if (xenoNMatches.length > 0) {
    const missingNewline = xenoNMatches.filter(m => {
      const afterIdx = m.index! + m[0].length;
      return afterIdx >= trimmed.length || trimmed[afterIdx] !== "\n";
    });
    if (missingNewline.length > 0) {
      issues.push({ ...base, severity: "warning", category: "xeno_n_no_newline",
        message: `${missingNewline.length} وسم [XENO:n ] غير متبوع بسطر جديد (\\n) — يمنع كسر السطر` });
    }
  }

  // 21. Identical to original
  if (trimmed === entry.original.trim() && trimmed.length > 6) {
    issues.push({ ...base, severity: "info", category: "identical_to_original",
      message: "النص مطابق للأصل الإنجليزي (لم يُترجم)" });
  }

  return issues;
}
