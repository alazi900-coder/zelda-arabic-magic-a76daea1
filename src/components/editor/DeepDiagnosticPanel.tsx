import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, ShieldAlert, CheckCircle2, Search, Loader2, Filter, Wrench, Zap, FileText } from "lucide-react";
import { ExtractedEntry, EditorState } from "@/components/editor/types";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { diffTechnicalTags, repairTranslationTagsForBuild } from "@/lib/xc3-build-tag-guard";
import { Collapsible as InnerCollapsible, CollapsibleContent as InnerCollapsibleContent, CollapsibleTrigger as InnerCollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface FixReportEntry {
  key: string;
  label: string;
  category: string;
  action: 'fixed' | 'unchanged' | 'restored';
  reason: string;
}

interface FixReport {
  totalAttempted: number;
  totalFixed: number;
  totalUnchanged: number;
  totalRestored: number;
  entries: FixReportEntry[];
}

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════

type Severity = "critical" | "warning" | "info";

export interface DiagnosticIssue {
  key: string;
  label: string;
  original: string;
  translation: string;
  severity: Severity;
  category: string;
  message: string;
}

interface DiagnosticCategory {
  id: string;
  label: string;
  icon: string;
  severity: Severity;
  description: string;
}

const CATEGORIES: DiagnosticCategory[] = [
  { id: "control_chars", label: "رموز تحكم مفقودة", icon: "⛔", severity: "critical", description: "رموز تحكم (U+FFF9-FFFC) مفقودة من الترجمة — تسبب توقف اللعبة وخلل الرسوميات" },
  { id: "pua_chars", label: "رموز خاصة مفقودة", icon: "🔴", severity: "critical", description: "رموز المنطقة الخاصة (U+E000-E0FF) مفقودة — تتحكم بالأيقونات والألوان" },
  { id: "byte_overflow", label: "تجاوز حد البايت", icon: "📏", severity: "critical", description: "الترجمة تتجاوز الحد الأقصى للبايتات — تُفسد جدول النصوص" },
  { id: "double_shaped", label: "معالجة عربية مزدوجة", icon: "🔄", severity: "critical", description: "نص معالج مرتين (Double Reshaping) — يظهر مقلوب ومفكك في اللعبة" },
  { id: "null_char", label: "رمز NULL داخل النص", icon: "💀", severity: "critical", description: "وجود \\0 (NULL) وسط النص — يقطع النص فوراً ويسبب تجمّد المحرك" },
  { id: "unmatched_ruby", label: "وسم Ruby غير مغلق", icon: "🔓", severity: "critical", description: "وسم [System:Ruby] بدون إغلاق [/System:Ruby] أو العكس — يعلّق محرك الرسائل" },
  { id: "broken_tag_syntax", label: "وسم بصيغة تالفة", icon: "🧩", severity: "critical", description: "أقواس [...] غير متوازنة (بعد استثناء الأقواس المحمية) — يتجمّد المحلل" },
  { id: "control_extra", label: "رموز تحكم زائدة", icon: "⚠️", severity: "critical", description: "رموز تحكم في الترجمة أكثر من الأصل — تُربك محرك الرسائل" },
  { id: "translated_tags", label: "وسوم مترجمة", icon: "🔀", severity: "warning", description: "وسوم تقنية تم ترجمتها بالخطأ (عربي داخل أقواس تقنية) — يجب إصلاحها" },
  { id: "invisible_chars", label: "أحرف غير مرئية مشبوهة", icon: "👻", severity: "warning", description: "أحرف Unicode غير مرئية (ZWJ, ZWNJ, BOM, إلخ) قد تُربك المحرك" },
  { id: "tag_mismatch", label: "وسوم [Tag] مفقودة", icon: "🏷️", severity: "warning", description: "وسوم أصلية مفقودة فعلياً بعد استثناء الوسوم التي تُرجمت بالخطأ — قد تسبب خلل في العرض" },
  { id: "technical_mismatch", label: "اختلاف الرموز التقنية", icon: "🧷", severity: "critical", description: "مجموعة الرموز التقنية لا تطابق الأصل بدقة حتى لو كان العدد متساوياً — قد تسبب تجمّد اللعبة" },
  { id: "tag_order_mismatch", label: "ترتيب الوسوم مقلوب", icon: "🔀", severity: "critical", description: "الوسوم التقنية موجودة لكن بترتيب مختلف عن الأصل — يسبب تجمّد المشاهد السينمائية" },
  { id: "placeholder_mismatch", label: "عناصر نائبة مفقودة", icon: "⬛", severity: "warning", description: "رموز \uFFFC نائبة مفقودة — قد تسبب خلل في الواجهة" },
  { id: "newline_mismatch", label: "فرق كبير بعدد الأسطر", icon: "📄", severity: "warning", description: "عدد الأسطر في الترجمة يختلف كثيراً عن الأصل — قد يكسر صندوق الحوار" },
  { id: "byte_budget", label: "تجاوز ميزانية البايتات", icon: "💾", severity: "warning", description: "الترجمة أكبر من ضعف حجم الأصل بالبايتات — قد تستنفد ذاكرة المحرك" },
  { id: "excessive_lines", label: "أسطر زائدة عن الأصل", icon: "📐", severity: "warning", description: "الترجمة تحتوي أسطر أكثر بكثير من الأصل (+3) — قد تكسر صندوق الحوار" },
  { id: "empty_translation", label: "ترجمة فارغة/مسافات فقط", icon: "🫥", severity: "warning", description: "ترجمة تحتوي مسافات أو أحرف غير مرئية فقط" },
  { id: "corrupted_vars", label: "متغيرات $N تالفة", icon: "💲", severity: "critical", description: "متغيرات $1/$2 مترجمة خطأً (دولار1، 1.$، إلخ) — تسبب تجمّد اللعبة" },
  { id: "missing_vars", label: "متغيرات $N مفقودة", icon: "🚫", severity: "critical", description: "متغيرات $1/$2 محذوفة كلياً من الترجمة — تسبب تجمّد اللعبة أو قيم خاطئة" },
  { id: "xeno_n_no_newline", label: "[XENO:n] بدون سطر جديد", icon: "↩️", severity: "warning", description: "وسم [XENO:n ] غير متبوع بـ \\n — يمنع كسر السطر في صندوق الحوار" },
  { id: "identical_to_original", label: "ترجمة مطابقة للأصل", icon: "📋", severity: "info", description: "النص لم يُترجم (مطابق للنص الإنجليزي)" },
];

// ═══════════════════════════════════════════════════
// Detection
// ═══════════════════════════════════════════════════

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
  const translatedSlots = {
    bracket: 0,
    brace: 0,
  } satisfies Record<TechnicalTagKind, number>;

  for (const tag of translatedTags) {
    translatedSlots[getTechnicalTagKind(tag)]++;
  }

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
    const prev = i > 0 ? text[i - 1] : '';
    if (text[i] === '[' && prev !== '\\') open++;
    if (text[i] === ']' && prev !== '\\') close++;
  }
  return { open, close };
}

export function detectIssues(entry: ExtractedEntry, translation: string): DiagnosticIssue[] {
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
  // Only flag if translation brackets are unbalanced AND original was balanced
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
  if (origTags.length > 0) {
    if (translatedTags.length > 0) {
      issues.push({ ...base, severity: "warning", category: "translated_tags",
        message: `${translatedTags.length} وسم مترجم: ${translatedTags.slice(0, 3).join(', ')}${translatedTags.length > 3 ? '...' : ''}` });
    }
  }

  // 10. Invisible characters
  const invisibleMatches = getMatches(trimmed, RE_INVISIBLE);
  if (invisibleMatches.length > 0) {
    const codepoints = invisibleMatches.slice(0, 5).map(c => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`);
    issues.push({ ...base, severity: "warning", category: "invisible_chars",
      message: `${invisibleMatches.length} حرف غير مرئي: ${codepoints.join(', ')}${invisibleMatches.length > 5 ? '...' : ''}` });
  }

  // 11. Tag mismatch
  if (origTags.length > 0) {
    const missingTags = origTags.filter(t => !trimmed.includes(t));
    const unresolvedMissingTags = excludeTranslatedReplacementTags(missingTags, translatedTags);
    if (unresolvedMissingTags.length > 0) {
      issues.push({ ...base, severity: "warning", category: "tag_mismatch",
        message: `${unresolvedMissingTags.length} وسم مفقود: ${unresolvedMissingTags.slice(0, 3).join(', ')}${unresolvedMissingTags.length > 3 ? '...' : ''}` });
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

  // 17. Corrupted $N variables (دولار1, 1.$, etc.)
  const origDollarVars = getMatches(entry.original, RE_ORIG_DOLLAR_VARS);
  if (origDollarVars.length > 0) {
    // 17a. Corrupted $N
    const corruptedMatches = getMatches(trimmed, RE_CORRUPTED_DOLLAR);
    if (corruptedMatches.length > 0) {
      issues.push({ ...base, severity: "critical", category: "corrupted_vars",
        message: `${corruptedMatches.length} متغير تالف: ${corruptedMatches.slice(0, 3).join('، ')} — يجب أن تكون ${origDollarVars.join('، ')}` });
    }

    // 17b. Missing $N completely
    const transDollarVars = getMatches(trimmed, RE_ORIG_DOLLAR_VARS);
    // If there are corrupted matches, skip missing check (corrupted_vars covers it)
    if (corruptedMatches.length === 0) {
      const allMissing = origDollarVars.filter(v => !transDollarVars.includes(v));
      if (allMissing.length > 0) {
        issues.push({ ...base, severity: "critical", category: "missing_vars",
          message: `${allMissing.length} متغير مفقود: ${allMissing.join('، ')} — غير موجود في الترجمة` });
      }
    }
  }

  const technicalDiff = diffTechnicalTags(entry.original, trimmed);
  const hasSpecificTechnicalIssue = issues.some(issue => SPECIFIC_TECHNICAL_ISSUE_CATEGORIES.has(issue.category));
  if (!technicalDiff.exactTagMatch && !hasSpecificTechnicalIssue) {
    const messageParts: string[] = [];

    if (technicalDiff.missingTags.length > 0) {
      messageParts.push(
        `مفقود: ${technicalDiff.missingTags.slice(0, 3).map(formatTechnicalToken).join('، ')}${technicalDiff.missingTags.length > 3 ? '...' : ''}`
      );
    }

    if (technicalDiff.extraTags.length > 0) {
      messageParts.push(
        `مختلف/زائد: ${technicalDiff.extraTags.slice(0, 3).map(formatTechnicalToken).join('، ')}${technicalDiff.extraTags.length > 3 ? '...' : ''}`
      );
    }

    issues.push({
      ...base,
      severity: "critical",
      category: "technical_mismatch",
      message: messageParts.length > 0 ? messageParts.join(" — ") : "مجموعة الرموز التقنية لا تطابق الأصل بدقة",
    });
  }

  // Tag order mismatch: multiset ok but sequence wrong — causes cinematic freezes
  if (technicalDiff.exactTagMatch && !technicalDiff.sequenceMatch) {
    issues.push({
      ...base,
      severity: "critical",
      category: "tag_order_mismatch",
      message: "الوسوم التقنية موجودة لكن ترتيبها مقلوب مقارنة بالأصل — يسبب تجمّد المشاهد",
    });
  }

  // [XENO:n ] not followed by \n
  const xenoNMatches = [...trimmed.matchAll(/\[XENO:n\s*\]/g)];
  if (xenoNMatches.length > 0) {
    const missingNewline = xenoNMatches.filter(m => {
      const afterIdx = m.index! + m[0].length;
      return afterIdx >= trimmed.length || trimmed[afterIdx] !== '\n';
    });
    if (missingNewline.length > 0) {
      issues.push({ ...base, severity: "warning", category: "xeno_n_no_newline",
        message: `${missingNewline.length} وسم [XENO:n ] غير متبوع بسطر جديد (\\n) — يمنع كسر السطر` });
    }
  }

  if (trimmed === entry.original.trim() && trimmed.length > 6) {
    issues.push({ ...base, severity: "info", category: "identical_to_original",
      message: "النص مطابق للأصل الإنجليزي (لم يُترجم)" });
  }

  return issues;
}

// ═══════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════

interface DeepDiagnosticPanelProps {
  state: EditorState;
  onNavigateToEntry?: (key: string) => void;
  onApplyFix?: (key: string, fixedText: string) => void;
  onFilterByKeys?: (keys: Set<string>) => void;
  onFixSelectedLocally?: (keys: string[]) => void;
}

// Categories fixable via build tag guard
const TAG_FIXABLE_CATEGORIES = new Set(["tag_mismatch", "placeholder_mismatch", "translated_tags", "tag_order_mismatch"]);
// Categories fixable by repairing $N variables
const DOLLAR_VAR_FIXABLE_CATEGORIES = new Set(["corrupted_vars"]);
// Categories fixable by restoring original text
const RESTORE_ORIGINAL_CATEGORIES = new Set(["control_chars", "pua_chars", "null_char", "unmatched_ruby", "broken_tag_syntax", "control_extra", "double_shaped", "missing_vars", "technical_mismatch"]);
// Categories fixable by stripping invisible chars
const STRIP_INVISIBLE_CATEGORIES = new Set(["invisible_chars"]);
// Categories fixable by inserting \n after [XENO:n ]
const XENO_N_FIXABLE_CATEGORIES = new Set(["xeno_n_no_newline"]);
// All locally fixable categories
const LOCAL_FIXABLE_CATEGORIES = new Set([...TAG_FIXABLE_CATEGORIES, ...DOLLAR_VAR_FIXABLE_CATEGORIES, ...RESTORE_ORIGINAL_CATEGORIES, ...STRIP_INVISIBLE_CATEGORIES, ...XENO_N_FIXABLE_CATEGORIES, "empty_translation"]);

export default function DeepDiagnosticPanel({ state, onNavigateToEntry, onApplyFix, onFilterByKeys, onFixSelectedLocally }: DeepDiagnosticPanelProps) {
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [issues, setIssues] = useState<DiagnosticIssue[]>([]);
  const [activeFilter, setActiveFilter] = useState<string | null>(null); 
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [fixReport, setFixReport] = useState<FixReport | null>(null);
  const latestStateRef = useRef(state);

  // Build entry lookup map for O(1) access
  const entryMap = useMemo(() => {
    const map = new Map<string, ExtractedEntry>();
    for (const entry of state.entries) {
      map.set(`${entry.msbtFile}:${entry.index}`, entry);
    }
    return map;
  }, [state.entries]);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  const runScan = useCallback((preserveActiveFilter = false) => {
    setScanning(true);
    setScanned(false);
    if (!preserveActiveFilter) setActiveFilter(null);

    setTimeout(() => {
      const currentState = latestStateRef.current;
      const allIssues: DiagnosticIssue[] = [];
      for (const entry of currentState.entries) {
        const key = `${entry.msbtFile}:${entry.index}`;
        const translation = currentState.translations[key];
        if (!translation) continue;
        allIssues.push(...detectIssues(entry, translation));
      }
      setIssues(allIssues);
      setScanning(false);
      setScanned(true);
    }, 50);
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of CATEGORIES) counts[cat.id] = 0;
    for (const issue of issues) counts[issue.category] = (counts[issue.category] || 0) + 1;
    return counts;
  }, [issues]);

  const severityCounts = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0 };
    for (const issue of issues) c[issue.severity]++;
    return c;
  }, [issues]);

  const filteredIssues = useMemo(() => {
    if (!activeFilter) return issues;
    return issues.filter(i => i.category === activeFilter);
  }, [issues, activeFilter]);

  const handleFilterInEditor = useCallback((categoryId: string) => {
    const keys = new Set(issues.filter(i => i.category === categoryId).map(i => i.key));
    if (keys.size > 0 && onFilterByKeys) {
      onFilterByKeys(keys);
      toast({ title: "🔍 تصفية", description: `عرض ${keys.size} نص في المحرر` });
    }
  }, [issues, onFilterByKeys]);

  /** Run the same build guard used during export; if result is still unsafe, restore English */
  const getSafeTagRepair = useCallback((entry: ExtractedEntry, text: string) => {
    const repaired = repairTranslationTagsForBuild(entry.original, text);
    const repairedIssues = detectIssues(entry, repaired.text);
    const stillCritical = repairedIssues.some((issue) => issue.severity === "critical");
    const mustRestoreOriginal =
      !repaired.exactTagMatch ||
      !repaired.sequenceMatch ||
      repaired.missingClosingTags ||
      repaired.missingControlOrPua ||
      stillCritical;

    const finalText = mustRestoreOriginal ? entry.original : repaired.text;

    return {
      finalText,
      repairedText: repaired.text,
      changed: finalText !== text,
      restoredOriginal: mustRestoreOriginal && entry.original !== text,
      repairedIssues,
    };
  }, []);

  /** Generate debug info for why an issue wasn't auto-fixed */
  const getFixDebugInfo = useCallback((issue: DiagnosticIssue): { fixResult: string; reason: string } => {
    const entry = entryMap.get(issue.key);
    if (!entry) return { fixResult: '', reason: '❌ المدخلة غير موجودة في الخريطة' };
    const trans = state.translations[issue.key] || '';
    if (!trans.trim()) return { fixResult: '', reason: '❌ الترجمة فارغة' };

    if (TAG_FIXABLE_CATEGORIES.has(issue.category)) {
      const safeRepair = getSafeTagRepair(entry, trans);
      if (!safeRepair.changed) {
        return { fixResult: safeRepair.finalText, reason: '⚠️ حارس البناء أعاد نفس النص — لم يجد تعديلاً آمناً فعلياً' };
      }
      if (safeRepair.restoredOriginal) {
        return { fixResult: safeRepair.finalText, reason: '↩️ محاولة الإصلاح أبقت النص غير آمن، لذا سيتم استعادة الأصل الإنجليزي لمنع التجمّد' };
      }
      const stillHas = safeRepair.repairedIssues.some(fi => fi.category === issue.category);
      if (stillHas) {
        return { fixResult: safeRepair.finalText, reason: '⚠️ تم تعديل النص لكن هذه المشكلة لا تزال موجودة بعد الحماية' };
      }
      return { fixResult: safeRepair.finalText, reason: '✅ سيتم إصلاح الوسوم بآلية الحماية نفسها المستخدمة وقت البناء' };
    }

    if (RESTORE_ORIGINAL_CATEGORIES.has(issue.category)) {
      return { fixResult: entry.original, reason: '↩️ سيتم استعادة النص الأصلي الإنجليزي' };
    }

    if (issue.category === 'invisible_chars') {
      const cleaned = trans.replace(RE_INVISIBLE, '');
      return { fixResult: cleaned, reason: cleaned !== trans ? '🧹 سيتم إزالة الأحرف غير المرئية' : '⚠️ لم يُعثر على أحرف غير مرئية' };
    }

    if (DOLLAR_VAR_FIXABLE_CATEGORIES.has(issue.category)) {
      const repaired = repairTranslationTagsForBuild(entry.original, trans);
      if (repaired.text !== trans) {
        return { fixResult: repaired.text, reason: '💲 سيتم إصلاح متغيرات $N التالفة' };
      }
      return { fixResult: trans, reason: '⚠️ لم يتمكن من إصلاح المتغيرات تلقائياً' };
    }

    if (XENO_N_FIXABLE_CATEGORIES.has(issue.category)) {
      const fixed = trans.replace(/(\[XENO:n\s*\])(?!\n)/g, '$1\n');
      return { fixResult: fixed, reason: fixed !== trans ? '↩️ سيتم إضافة \\n بعد [XENO:n ]' : '⚠️ لم يُعثر على وسم بدون سطر جديد' };
    }

    return { fixResult: '', reason: '❓ لا توجد استراتيجية إصلاح لهذه الفئة' };
  }, [entryMap, state.translations, getSafeTagRepair]);

  const applyTagFixes = useCallback((keys: string[]): number => {
    if (keys.length === 0) return 0;

    if (onApplyFix) {
      let count = 0;
      for (const key of keys) {
        const entry = entryMap.get(key);
        const trans = state.translations[key];
        if (!entry || !trans) continue;
        const safeRepair = getSafeTagRepair(entry, trans);
        if (safeRepair.changed) {
          onApplyFix(key, safeRepair.finalText);
          count++;
        }
      }
      return count;
    }

    if (onFixSelectedLocally) {
      onFixSelectedLocally(keys);
      return keys.length;
    }

    return 0;
  }, [entryMap, getSafeTagRepair, onApplyFix, onFixSelectedLocally, state.translations]);

  /** Fix a single issue */
  const handleFixSingle = useCallback((issue: DiagnosticIssue) => {
    const entry = entryMap.get(issue.key);
    if (!entry) return;

    if (TAG_FIXABLE_CATEGORIES.has(issue.category)) {
      if (onApplyFix) {
        const safeRepair = getSafeTagRepair(entry, issue.translation);
        if (safeRepair.changed) {
          onApplyFix(issue.key, safeRepair.finalText);
          toast({
            title: safeRepair.restoredOriginal ? '↩️ استعادة آمنة' : '🔧 إصلاح آمن',
            description: safeRepair.restoredOriginal
              ? 'بقي النص غير آمن بعد محاولة الإصلاح، فتمت استعادة الأصل الإنجليزي'
              : 'تم إصلاح الوسوم وترتيبها عبر حارس البناء',
          });
        } else {
          toast({ title: '⚠️ لم يتغير النص', description: 'حارس البناء لم يجد تعديلاً آمناً فعلياً لهذا النص' });
        }
        return;
      }

      const fixedCount = applyTagFixes([issue.key]);
      toast({
        title: fixedCount > 0 ? '🛡️ تعديل' : '⚠️ لم يتغير النص',
        description: fixedCount > 0 ? 'تم تعديل النص عبر حارس الحماية' : 'لم يتم العثور على تعديل فعلي لهذه الوسوم',
      });
      return;
    }

    if (DOLLAR_VAR_FIXABLE_CATEGORIES.has(issue.category) && onApplyFix) {
      const repaired = repairTranslationTagsForBuild(entry.original, issue.translation);
      onApplyFix(issue.key, repaired.text);
      toast({ title: '💲 إصلاح', description: 'تم إصلاح متغيرات $N' });
      return;
    }

    if (issue.category === 'invisible_chars' && onApplyFix) {
      onApplyFix(issue.key, issue.translation.replace(RE_INVISIBLE, ''));
      toast({ title: '🧹 تنظيف', description: 'تم إزالة الأحرف غير المرئية' });
      return;
    }

    if (XENO_N_FIXABLE_CATEGORIES.has(issue.category) && onApplyFix) {
      const fixed = issue.translation.replace(/(\[XENO:n\s*\])(?!\n)/g, '$1\n');
      if (fixed !== issue.translation) onApplyFix(issue.key, fixed);
      toast({ title: '↩️ إصلاح', description: 'تم إضافة \\n بعد [XENO:n ]' });
      return;
    }

    if (issue.category === 'empty_translation' && onApplyFix) {
      onApplyFix(issue.key, '');
      return;
    }

    if (onApplyFix) {
      onApplyFix(issue.key, entry.original);
      toast({ title: '↩️ استعادة النص الأصلي' });
    }
  }, [applyTagFixes, entryMap, getSafeTagRepair, onApplyFix]);

  /** Fix all issues in active category */
  const handleLocalFixAll = useCallback(() => {
    if (!activeFilter) return;
    const categoryIssues = issues.filter(issue => issue.category === activeFilter);
    const uniqueKeys = [...new Set(categoryIssues.map(issue => issue.key))];
    if (uniqueKeys.length === 0) return;

    if (TAG_FIXABLE_CATEGORIES.has(activeFilter)) {
      const count = applyTagFixes(uniqueKeys);
      toast({ title: count > 0 ? '🛡️ إصلاح آمن' : '⚠️ لم يتغير شيء', description: `تم تعديل ${count} نص عبر حارس البناء` });
      setTimeout(() => runScan(true), 250);
      return;
    }

    if (DOLLAR_VAR_FIXABLE_CATEGORIES.has(activeFilter) && onApplyFix) {
      let count = 0;
      for (const key of uniqueKeys) {
        const entry = entryMap.get(key);
        const trans = state.translations[key];
        if (!entry || !trans) continue;
        const repaired = repairTranslationTagsForBuild(entry.original, trans);
        if (repaired.text !== trans) { onApplyFix(key, repaired.text); count++; }
      }
      toast({ title: '💲 إصلاح جماعي', description: `تم إصلاح متغيرات $N في ${count} نص` });
      setTimeout(() => runScan(true), 250);
      return;
    }

    if (RESTORE_ORIGINAL_CATEGORIES.has(activeFilter) && onApplyFix) {
      let count = 0;
      for (const key of uniqueKeys) {
        const entry = entryMap.get(key);
        if (entry) { onApplyFix(key, entry.original); count++; }
      }
      toast({ title: '↩️ استعادة جماعية', description: `تم استعادة النص الأصلي لـ ${count} نص` });
      setTimeout(() => runScan(true), 250);
      return;
    }

    if (STRIP_INVISIBLE_CATEGORIES.has(activeFilter) && onApplyFix) {
      let count = 0;
      for (const key of uniqueKeys) {
        const trans = state.translations[key];
        if (!trans) continue;
        const cleaned = trans.replace(RE_INVISIBLE, '');
        if (cleaned !== trans) { onApplyFix(key, cleaned); count++; }
      }
      toast({ title: '🧹 تنظيف', description: `تم إزالة الأحرف غير المرئية من ${count} نص` });
      setTimeout(() => runScan(true), 250);
      return;
    }

    if (XENO_N_FIXABLE_CATEGORIES.has(activeFilter) && onApplyFix) {
      // Chunked processing to avoid freezing the browser on huge batches (10k+ entries)
      const CHUNK = 200;
      let count = 0;
      let i = 0;
      toast({ title: '↩️ بدء الإصلاح الجماعي', description: `جاري معالجة ${uniqueKeys.length} نص على دفعات...` });
      const processChunk = () => {
        const end = Math.min(i + CHUNK, uniqueKeys.length);
        for (; i < end; i++) {
          const key = uniqueKeys[i];
          const trans = state.translations[key];
          if (!trans) continue;
          const fixed = trans.replace(/(\[XENO:n\s*\])(?!\n)/g, '$1\n');
          if (fixed !== trans) { onApplyFix(key, fixed); count++; }
        }
        if (i < uniqueKeys.length) {
          requestAnimationFrame(processChunk);
        } else {
          toast({ title: '↩️ إصلاح جماعي مكتمل', description: `تم إضافة \\n بعد [XENO:n ] في ${count} نص` });
          setTimeout(() => runScan(true), 250);
        }
      };
      requestAnimationFrame(processChunk);
      return;
    }

    if (activeFilter === 'empty_translation' && onApplyFix) {
      for (const key of uniqueKeys) onApplyFix(key, '');
      toast({ title: '🗑️ حذف', description: `تم مسح ${uniqueKeys.length} ترجمة فارغة` });
      setTimeout(() => runScan(true), 250);
    }
  }, [activeFilter, applyTagFixes, issues, onApplyFix, entryMap, state.translations, runScan]);

  /** Fix ALL fixable issues across all categories at once (chunked to avoid browser freeze) */
  const handleFixEverything = useCallback(() => {
    if (!onApplyFix) return;
    const allFixableIssues = issues.filter(i => LOCAL_FIXABLE_CATEGORIES.has(i.category));
    const processedKeys = new Set<string>();
    const tagFixKeys: string[] = [];
    const reportEntries: FixReportEntry[] = [];
    const counters = { restore: 0, strip: 0, clear: 0, dollar: 0, xenoN: 0, tagFixed: 0 };

    const totalToProcess = allFixableIssues.length;
    toast({
      title: '⚡ بدء الإصلاح الشامل',
      description: `جاري معالجة ${totalToProcess} مشكلة على دفعات لمنع تجمّد المتصفح...`,
    });

    const CHUNK = 150;
    let idx = 0;

    const processNonTagChunk = () => {
      const end = Math.min(idx + CHUNK, allFixableIssues.length);
      for (; idx < end; idx++) {
        const issue = allFixableIssues[idx];
        if (processedKeys.has(issue.key)) continue;
        const catLabel = CATEGORIES.find(c => c.id === issue.category)?.label || issue.category;

        if (TAG_FIXABLE_CATEGORIES.has(issue.category)) {
          tagFixKeys.push(issue.key);
          processedKeys.add(issue.key);
          continue;
        }

        if (DOLLAR_VAR_FIXABLE_CATEGORIES.has(issue.category)) {
          const entry = entryMap.get(issue.key);
          const trans = state.translations[issue.key];
          if (entry && trans) {
            const repaired = repairTranslationTagsForBuild(entry.original, trans);
            if (repaired.text !== trans) {
              onApplyFix(issue.key, repaired.text);
              counters.dollar++;
              reportEntries.push({ key: issue.key, label: issue.label, category: catLabel, action: 'fixed', reason: '💲 تم إصلاح متغيرات $N' });
            } else {
              reportEntries.push({ key: issue.key, label: issue.label, category: catLabel, action: 'unchanged', reason: '⚠️ محرك الإصلاح لم يجد تعديلاً فعلياً للمتغيرات' });
            }
          }
          processedKeys.add(issue.key);
          continue;
        }

        if (RESTORE_ORIGINAL_CATEGORIES.has(issue.category)) {
          const entry = entryMap.get(issue.key);
          if (entry) {
            onApplyFix(issue.key, entry.original);
            counters.restore++;
            reportEntries.push({ key: issue.key, label: issue.label, category: catLabel, action: 'restored', reason: '↩️ تمت استعادة النص الأصلي الإنجليزي (المشكلة غير قابلة للإصلاح مع الحفاظ على الترجمة)' });
          }
          processedKeys.add(issue.key);
          continue;
        }

        if (STRIP_INVISIBLE_CATEGORIES.has(issue.category)) {
          const trans = state.translations[issue.key];
          if (trans) {
            const cleaned = trans.replace(RE_INVISIBLE, '');
            if (cleaned !== trans) {
              onApplyFix(issue.key, cleaned);
              counters.strip++;
              reportEntries.push({ key: issue.key, label: issue.label, category: catLabel, action: 'fixed', reason: '🧹 تم إزالة الأحرف غير المرئية' });
            } else {
              reportEntries.push({ key: issue.key, label: issue.label, category: catLabel, action: 'unchanged', reason: '⚠️ لم يُعثر على أحرف غير مرئية فعلية' });
            }
          }
          processedKeys.add(issue.key);
          continue;
        }

        if (XENO_N_FIXABLE_CATEGORIES.has(issue.category)) {
          const trans = state.translations[issue.key];
          if (trans) {
            const fixed = trans.replace(/(\[XENO:n\s*\])(?!\n)/g, '$1\n');
            if (fixed !== trans) {
              onApplyFix(issue.key, fixed);
              counters.xenoN++;
              reportEntries.push({ key: issue.key, label: issue.label, category: catLabel, action: 'fixed', reason: '↩️ تم إضافة \\n بعد [XENO:n ]' });
            } else {
              reportEntries.push({ key: issue.key, label: issue.label, category: catLabel, action: 'unchanged', reason: '⚠️ لم يُعثر على وسم بدون سطر جديد فعلياً' });
            }
          }
          processedKeys.add(issue.key);
          continue;
        }

        if (issue.category === 'empty_translation') {
          onApplyFix(issue.key, '');
          counters.clear++;
          reportEntries.push({ key: issue.key, label: issue.label, category: catLabel, action: 'fixed', reason: '🗑️ تم مسح الترجمة الفارغة' });
          processedKeys.add(issue.key);
        }
      }

      if (idx < allFixableIssues.length) {
        requestAnimationFrame(processNonTagChunk);
      } else {
        // Phase 2: process tag-fixable keys (heavier work)
        let tagIdx = 0;
        const processTagChunk = () => {
          const tagEnd = Math.min(tagIdx + CHUNK, tagFixKeys.length);
          for (; tagIdx < tagEnd; tagIdx++) {
            const key = tagFixKeys[tagIdx];
            const entry = entryMap.get(key);
            const trans = state.translations[key];
            if (!entry || !trans) continue;

            const safeRepair = getSafeTagRepair(entry, trans);
            const catLabel = 'وسوم تقنية';
            const issuesForKey = issues.filter(i => i.key === key);
            const cats = issuesForKey.map(i => CATEGORIES.find(c => c.id === i.category)?.label || i.category).join('، ');

            if (safeRepair.changed) {
              onApplyFix(key, safeRepair.finalText);
              if (safeRepair.restoredOriginal) {
                counters.restore++;
                reportEntries.push({ key, label: entry.label, category: catLabel, action: 'restored', reason: `↩️ بقي النص غير آمن بعد محاولة الإصلاح (${cats})، فتمت استعادة الأصل الإنجليزي لمنع التجمّد` });
              } else {
                counters.tagFixed++;
                reportEntries.push({ key, label: entry.label, category: catLabel, action: 'fixed', reason: '🔧 تم إصلاح الوسوم التقنية وترتيبها عبر حارس البناء' });
              }
            } else {
              reportEntries.push({ key, label: entry.label, category: catLabel, action: 'unchanged', reason: `⚠️ حارس البناء أعاد نفس النص — المشاكل (${cats}) تحتاج إصلاحاً يدوياً` });
            }
          }

          if (tagIdx < tagFixKeys.length) {
            requestAnimationFrame(processTagChunk);
          } else {
            const totalFixed = counters.tagFixed + counters.restore + counters.strip + counters.clear + counters.dollar + counters.xenoN;
            const totalUnchanged = reportEntries.filter(e => e.action === 'unchanged').length;
            const totalRestored = reportEntries.filter(e => e.action === 'restored').length;
            const report: FixReport = {
              totalAttempted: reportEntries.length,
              totalFixed,
              totalUnchanged,
              totalRestored,
              entries: reportEntries,
            };
            setFixReport(report);
            toast({
              title: totalFixed > 0 ? '⚡ إصلاح شامل مكتمل' : '⚠️ لم يتم تعديل أي نص',
              description: `تم تعديل ${totalFixed} نص — اضغط 📋 لعرض التقرير التفصيلي`,
            });
            setTimeout(() => runScan(false), 500);
          }
        };
        requestAnimationFrame(processTagChunk);
      }
    };

    requestAnimationFrame(processNonTagChunk);
  }, [entryMap, getSafeTagRepair, issues, onApplyFix, runScan, state.translations]);

  const criticalCount = severityCounts.critical;
  const warningCount = severityCounts.warning;
  const activeFilterKeys = activeFilter
    ? new Set(issues.filter(issue => issue.category === activeFilter).map(issue => issue.key))
    : new Set<string>();
  const canLocalFixActiveFilter = Boolean(
    activeFilter &&
    (onFixSelectedLocally || onApplyFix) &&
    LOCAL_FIXABLE_CATEGORIES.has(activeFilter) &&
    activeFilterKeys.size > 0
  );
  const totalFixable = issues.filter(i => LOCAL_FIXABLE_CATEGORIES.has(i.category)).length;

  return (
    <>
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Card className="cursor-pointer hover:bg-muted/30 transition-colors border-destructive/30">
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              <span className="font-display font-bold text-sm">فحص عميق للمشاكل الحرجة</span>
              {scanned && (
                <>
                  {criticalCount > 0 && (
                    <Badge variant="destructive" className="text-xs">{criticalCount} حرج</Badge>
                  )}
                  {warningCount > 0 && (
                    <Badge className="text-xs bg-amber-600">{warningCount} تحذير</Badge>
                  )}
                  {criticalCount === 0 && warningCount === 0 && (
                    <Badge className="text-xs bg-secondary">✅ سليم</Badge>
                  )}
                </>
              )}
            </div>
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </CardContent>
        </Card>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <Card className="mt-1 border-destructive/20">
          <CardContent className="p-3 space-y-3">
            {/* Scan button */}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="destructive" onClick={() => runScan(false)} disabled={scanning} className="font-display font-bold">
                {scanning ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Search className="w-4 h-4 ml-1" />}
                {scanning ? "جاري الفحص..." : "فحص شامل"}
              </Button>
              {scanned && (
                <span className="text-xs text-muted-foreground">
                  فُحص {state.entries.length} نص — وُجدت {issues.length} مشكلة
                </span>
              )}
            </div>

            {scanned && issues.length > 0 && (
              <>
                {/* Summary */}
                <div className={`p-3 rounded-lg border ${
                  criticalCount > 0 ? 'bg-destructive/10 border-destructive/30' :
                  warningCount > 0 ? 'bg-amber-500/10 border-amber-500/30' :
                  'bg-secondary/10 border-secondary/30'
                }`}>
                  <p className="text-sm font-display font-bold mb-2">
                    {criticalCount > 0
                      ? `⛔ ${criticalCount} مشكلة حرجة ستسبب مشاكل في اللعبة!`
                      : `⚠️ ${warningCount} تحذير — قد تؤثر على جودة العرض`
                    }
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {CATEGORIES.map(cat => {
                      const count = categoryCounts[cat.id];
                      if (count === 0) return null;
                      return (
                        <Badge
                          key={cat.id}
                          variant={cat.severity === "critical" ? "destructive" : "outline"}
                          className={`text-xs cursor-pointer ${activeFilter === cat.id ? 'ring-2 ring-primary' : ''} ${
                            cat.severity === "warning" ? 'border-amber-500 text-amber-400' : ''
                          }`}
                          onClick={() => setActiveFilter(activeFilter === cat.id ? null : cat.id)}
                        >
                          {cat.icon} {cat.label}: {count}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                {/* Fix All button + Report button */}
                {totalFixable > 0 && (onApplyFix || onFixSelectedLocally) && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" className="flex-1 font-display font-bold text-sm" onClick={handleFixEverything}>
                      <Zap className="w-4 h-4 ml-1" />
                      ⚡ إصلاح كل المشاكل ({new Set(issues.filter(i => LOCAL_FIXABLE_CATEGORIES.has(i.category)).map(i => i.key)).size} نص)
                    </Button>
                    {fixReport && (
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => setFixReport({ ...fixReport })}>
                        <FileText className="w-4 h-4 ml-1" />
                        📋 التقرير
                      </Button>
                    )}
                  </div>
                )}

                {/* Category details */}
                {activeFilter && (
                  <div className="space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        {CATEGORIES.find(c => c.id === activeFilter)?.description}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {canLocalFixActiveFilter && (
                          <Button size="sm" variant="default" className="text-xs h-7" onClick={handleLocalFixAll}>
                            <Wrench className="w-3 h-3 ml-1" />
                            {RESTORE_ORIGINAL_CATEGORIES.has(activeFilter)
                              ? `↩️ استعادة الأصل (${activeFilterKeys.size})`
                              : DOLLAR_VAR_FIXABLE_CATEGORIES.has(activeFilter)
                              ? `💲 إصلاح المتغيرات (${activeFilterKeys.size})`
                              : activeFilter === "invisible_chars"
                              ? `🧹 تنظيف (${activeFilterKeys.size})`
                              : `🔧 إصلاح الكل محلياً (${activeFilterKeys.size})`
                            }
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleFilterInEditor(activeFilter)}>
                          <Filter className="w-3 h-3 ml-1" />
                          عرض في المحرر
                        </Button>
                      </div>
                    </div>

                    <ScrollArea className="max-h-64" dir="rtl">
                      <div className="space-y-1">
                        {filteredIssues.slice(0, 100).map((issue, i) => (
                          <div
                            key={`${issue.key}-${i}`}
                            className={`p-2 rounded text-xs border cursor-pointer hover:ring-1 hover:ring-primary/40 transition-all ${
                              issue.severity === "critical" ? "bg-destructive/5 border-destructive/20" :
                              issue.severity === "warning" ? "bg-amber-500/5 border-amber-500/20" :
                              "bg-muted/20 border-border/50"
                            }`}
                            onClick={() => onNavigateToEntry?.(issue.key)}
                            title="اضغط للانتقال لهذا النص في المحرر"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                                <p className="font-mono text-[10px] text-muted-foreground truncate">{issue.label}</p>
                                <p className="text-foreground mt-0.5 cursor-pointer" onClick={() => onNavigateToEntry?.(issue.key)}>{issue.message}</p>
                              </div>
                              <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                                  onClick={() => setExpandedIssue(expandedIssue === `${issue.key}-${i}` ? null : `${issue.key}-${i}`)}
                                  title="تفاصيل التشخيص">
                                  🔬
                                </Button>
                                {onNavigateToEntry && (
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                                    onClick={() => onNavigateToEntry(issue.key)} title="انتقل للنص">
                                    🔍
                                  </Button>
                                )}
                                {LOCAL_FIXABLE_CATEGORIES.has(issue.category) && (onApplyFix || onFixSelectedLocally) && (
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                                    onClick={() => handleFixSingle(issue)}
                                    title={TAG_FIXABLE_CATEGORIES.has(issue.category) ? "إصلاح الوسوم" :
                                           DOLLAR_VAR_FIXABLE_CATEGORIES.has(issue.category) ? "إصلاح المتغيرات" :
                                           RESTORE_ORIGINAL_CATEGORIES.has(issue.category) ? "استعادة الأصل" :
                                           issue.category === "invisible_chars" ? "تنظيف" : "إصلاح"}>
                                    {TAG_FIXABLE_CATEGORIES.has(issue.category) ? "🔧" :
                                     DOLLAR_VAR_FIXABLE_CATEGORIES.has(issue.category) ? "💲" :
                                     RESTORE_ORIGINAL_CATEGORIES.has(issue.category) ? "↩️" :
                                     issue.category === "invisible_chars" ? "🧹" : "🔧"}
                                  </Button>
                                )}
                              </div>
                            </div>
                            {expandedIssue === `${issue.key}-${i}` && (() => {
                              const entry = entryMap.get(issue.key);
                              const trans = state.translations[issue.key] || '';
                              const debug = getFixDebugInfo(issue);
                              return (
                                <div className="mt-2 space-y-1.5 border-t border-border/30 pt-2">
                                  <div>
                                    <span className="text-[10px] text-muted-foreground font-bold">الأصل:</span>
                                    <pre className="text-[10px] bg-muted/30 p-1 rounded mt-0.5 whitespace-pre-wrap break-all font-mono max-h-20 overflow-auto" dir="ltr">{entry?.original || '—'}</pre>
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-muted-foreground font-bold">الترجمة الحالية:</span>
                                    <pre className="text-[10px] bg-muted/30 p-1 rounded mt-0.5 whitespace-pre-wrap break-all font-mono max-h-20 overflow-auto" dir="rtl">{trans || '—'}</pre>
                                  </div>
                                  {debug.fixResult && (
                                    <div>
                                      <span className="text-[10px] text-muted-foreground font-bold">نتيجة الإصلاح:</span>
                                      <pre className="text-[10px] bg-secondary/20 p-1 rounded mt-0.5 whitespace-pre-wrap break-all font-mono max-h-20 overflow-auto" dir="rtl">{debug.fixResult}</pre>
                                    </div>
                                  )}
                                  <p className="text-[10px] font-bold">{debug.reason}</p>
                                </div>
                              );
                            })()}
                          </div>
                        ))}
                        {filteredIssues.length > 100 && (
                          <p className="text-xs text-center text-muted-foreground py-2">
                            +{filteredIssues.length - 100} مشكلة أخرى...
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </>
            )}

            {scanned && issues.length === 0 && (
              <div className="text-center p-4 bg-secondary/10 rounded-lg border border-secondary/30">
                <CheckCircle2 className="w-8 h-8 text-secondary mx-auto mb-2" />
                <p className="text-sm font-display font-bold">✅ لا توجد مشاكل حرجة</p>
                <p className="text-xs text-muted-foreground mt-1">كل الترجمات سليمة ولا تحتوي رموز مفقودة أو تالفة</p>
              </div>
            )}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>

    {/* Fix Report Dialog */}
    <Dialog open={fixReport !== null} onOpenChange={(open) => { if (!open) setFixReport(null); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-display text-base">📋 تقرير الإصلاح الشامل</DialogTitle>
        </DialogHeader>
        {fixReport && (
          <div className="space-y-3">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-secondary/20 border border-secondary/30">
                <p className="text-lg font-bold text-secondary">{fixReport.totalFixed}</p>
                <p className="text-[10px] text-muted-foreground">✅ تم إصلاحه</p>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <p className="text-lg font-bold text-amber-400">{fixReport.totalUnchanged}</p>
                <p className="text-[10px] text-muted-foreground">⚠️ لم يتغير</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
                <p className="text-lg font-bold text-blue-400">{fixReport.totalRestored}</p>
                <p className="text-[10px] text-muted-foreground">↩️ استعادة أصل</p>
              </div>
            </div>

            {/* Unchanged entries - most important */}
            {fixReport.entries.filter(e => e.action === 'unchanged').length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-bold text-amber-400">⚠️ نصوص لم تتغير ({fixReport.entries.filter(e => e.action === 'unchanged').length}):</p>
                <ScrollArea className="max-h-40">
                  <div className="space-y-1">
                    {fixReport.entries.filter(e => e.action === 'unchanged').map((entry, i) => (
                      <div key={i} className="p-2 rounded text-xs bg-amber-500/5 border border-amber-500/20 cursor-pointer hover:ring-1 hover:ring-primary/40"
                        onClick={() => { setFixReport(null); onNavigateToEntry?.(entry.key); }}>
                        <p className="font-mono text-[10px] text-muted-foreground truncate">{entry.label}</p>
                        <p className="text-[10px] mt-0.5">{entry.reason}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Restored entries */}
            {fixReport.entries.filter(e => e.action === 'restored').length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-bold text-blue-400">↩️ نصوص أُعيدت للأصل الإنجليزي ({fixReport.entries.filter(e => e.action === 'restored').length}):</p>
                <ScrollArea className="max-h-32">
                  <div className="space-y-1">
                    {fixReport.entries.filter(e => e.action === 'restored').map((entry, i) => (
                      <div key={i} className="p-2 rounded text-xs bg-blue-500/5 border border-blue-500/20 cursor-pointer hover:ring-1 hover:ring-primary/40"
                        onClick={() => { setFixReport(null); onNavigateToEntry?.(entry.key); }}>
                        <p className="font-mono text-[10px] text-muted-foreground truncate">{entry.label}</p>
                        <p className="text-[10px] mt-0.5">{entry.reason}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Fixed entries (collapsed by default) */}
            {fixReport.entries.filter(e => e.action === 'fixed').length > 0 && (
              <InnerCollapsible>
                <InnerCollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full text-xs text-secondary">
                    ✅ نصوص تم إصلاحها ({fixReport.entries.filter(e => e.action === 'fixed').length}) — اضغط للتفاصيل
                  </Button>
                </InnerCollapsibleTrigger>
                <InnerCollapsibleContent>
                  <ScrollArea className="max-h-32 mt-1">
                    <div className="space-y-1">
                      {fixReport.entries.filter(e => e.action === 'fixed').map((entry, i) => (
                        <div key={i} className="p-1.5 rounded text-xs bg-secondary/5 border border-secondary/20">
                          <p className="font-mono text-[10px] text-muted-foreground truncate">{entry.label}</p>
                          <p className="text-[10px] mt-0.5">{entry.reason}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </InnerCollapsibleContent>
              </InnerCollapsible>
            )}

            <p className="text-[10px] text-muted-foreground text-center">
              💡 النصوص التي لم تتغير تحتاج إصلاحاً يدوياً — اضغط عليها للانتقال إليها في المحرر
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
