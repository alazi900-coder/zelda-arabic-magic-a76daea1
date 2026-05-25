// Offline enhancement scanner — comprehensive rule-based detection for Arabic
// translation issues without an internet connection. Covers structural,
// punctuation, terminology, consistency and quality problems.
//
// Each rule produces a LocalIssue with: type, severity, a short label,
// a clear "why" explanation, and a concrete suggested fix when possible.

// Xenoblade Chronicles 1 MSBT files are UTF-16LE encoded, so use that byte length for the byte-limit rule.
import { utf16leByteLength as utf8ByteLength } from "./byte-utils";

export type IssueType =
  | "missing_char"
  | "style"
  | "consistency"
  | "punctuation"
  | "accuracy"
  | "terminology"
  | "grammar";

export type IssueSeverity = "high" | "medium" | "low";

export interface LocalIssue {
  key: string;
  original: string;
  translation: string;
  /** New translation suggestion (same as translation when no auto-fix). */
  suggestion: string;
  /** Short label for the problem (used as title). */
  issue: string;
  /** Detailed explanation of WHY this is a problem and which rule it breaks. */
  reason: string;
  severity: IssueSeverity;
  type: IssueType;
  /** Identifier of the rule that fired — useful for filtering & debugging. */
  rule: string;
}

export interface LocalScanContext {
  /** Optional max byte length for the translation (UTF-8). 0 means no limit. */
  maxBytes?: number;
}

const AR_RANGE = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF\u0750-\u077F\u08A0-\u08FF]/;
const TAG_RE = /\[[A-Z][^\]]*\]/g;
const PUA_RE = /[\uE000-\uF8FF\uFFF9-\uFFFC]/g;

/** Common gameplay/UI English words that should normally be translated. */
const COMMON_UNTRANSLATED = new Set<string>([
  "back", "next", "yes", "no", "ok", "cancel", "continue", "start", "pause",
  "save", "load", "quit", "exit", "menu", "options", "settings", "help",
  "item", "items", "weapon", "weapons", "shield", "sword", "bow", "arrow",
  "quest", "quests", "mission", "missions", "objective", "task",
  "player", "enemy", "boss", "level", "stage", "map", "dungeon",
  "chest", "key", "door", "gate", "treasure", "gold", "coin", "coins",
  "health", "magic", "mana", "stamina", "energy", "power", "skill",
  "attack", "defense", "speed", "damage", "block", "parry", "dodge",
  "win", "lose", "death", "game", "over", "score", "rank", "level",
  "new", "old", "find", "search", "open", "close", "use", "equip",
  "drop", "pick", "buy", "sell", "trade", "shop", "store", "merchant",
  "click", "tap", "press", "hold", "release", "select", "confirm",
  "tutorial", "title", "credits", "loading",
]);

const STRIP_FILLER = (s: string) => s.replace(TAG_RE, " ").replace(PUA_RE, " ");

// ============================================================================
// Whitespace & punctuation rules
// ============================================================================

function ruleDoubleSpaces(t: string): { fix: string; matched: boolean } {
  const fixed = t.replace(/[ \t]{2,}/g, " ");
  return { fix: fixed, matched: fixed !== t };
}

function ruleSpaceBeforePunct(t: string): { fix: string; matched: boolean } {
  const fixed = t.replace(/\s+([،.؛:!؟?,])/g, "$1");
  return { fix: fixed, matched: fixed !== t };
}

function ruleNoSpaceAfterPunct(t: string): { fix: string; matched: boolean } {
  // Don't touch punctuation followed by tag bracket, end, quote etc.
  const fixed = t.replace(/([،؛])(?=[^\s\])}»"'.،؛:!؟?\n]|$)/g, "$1 ").replace(/  +/g, " ");
  return { fix: fixed, matched: fixed !== t };
}

function ruleTabs(t: string): { fix: string; matched: boolean } {
  const fixed = t.replace(/\t/g, " ").replace(/  +/g, " ");
  return { fix: fixed, matched: fixed !== t };
}

function ruleLeadingTrailingSpaces(t: string): { fix: string; matched: boolean } {
  const fixed = t.replace(/^[ \t]+|[ \t]+$/g, "");
  return { fix: fixed, matched: fixed !== t };
}

// ============================================================================
// Repetition rules
// ============================================================================

function ruleRepeatedWord(t: string, orig: string): { fix: string; matched: boolean } {
  // \b doesn't work for Arabic in JS regex, so we use whitespace/start/end boundaries.
  const re = /(^|\s)(\S{2,})(\s+)\2(?=\s|[.,!?؟،؛:]|$)/gu;
  const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let matched = false;
  const fixed = t.replace(re, (full, before, word) => {
    // Skip if the original text also has the same word repeated
    const origRe = new RegExp(`(^|\\s)${escapeRe(word)}(\\s+)${escapeRe(word)}(?=\\s|[.,!?؟،؛:]|$)`, 'u');
    if (origRe.test(orig)) return full;
    matched = true;
    return `${before}${word}`;
  });
  return { fix: fixed, matched };
}

function ruleRepeatedChar(t: string): { match: RegExpMatchArray | null; fix: string } {
  // 4 or more of the same non-space character in a row
  const re = /([^\s])\1{3,}/u;
  const m = t.match(re);
  if (!m) return { match: null, fix: t };
  // Auto-fix: collapse to two of the same char (preserves emphasis)
  const fix = t.replace(/([^\s])\1{3,}/gu, "$1$1");
  return { match: m, fix };
}

// ============================================================================
// Glued scripts rules
// ============================================================================

function ruleGluedScripts(t: string): { fix: string; matched: boolean } {
  let fixed = t.replace(/([A-Za-z0-9])([\u0600-\u06FF])/g, "$1 $2");
  fixed = fixed.replace(/([\u0600-\u06FF])([A-Za-z0-9])/g, "$1 $2");
  return { fix: fixed, matched: fixed !== t };
}

// ============================================================================
// Tags & technical rules
// ============================================================================

function ruleMissingTags(orig: string, t: string): string[] {
  const origTags = orig.match(TAG_RE) || [];
  const missing: string[] = [];
  for (const tag of origTags) {
    if (!t.includes(tag)) missing.push(tag);
  }
  return missing;
}

function ruleDamagedPUA(orig: string, t: string): { origCount: number; transCount: number } {
  const origCount = (orig.match(PUA_RE) || []).length;
  const transCount = (t.match(PUA_RE) || []).length;
  return { origCount, transCount };
}

function ruleUnclosedBrackets(t: string): boolean {
  let depth = 0;
  for (const ch of t) {
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth < 0) return true;
    }
  }
  return depth !== 0;
}

function rulePlaceholderMismatch(orig: string, t: string): { origN: number; transN: number } {
  const origN = (orig.match(/\uFFFC/g) || []).length;
  const transN = (t.match(/\uFFFC/g) || []).length;
  return { origN, transN };
}

// ============================================================================
// Punctuation parity rules
// ============================================================================

function rulePunctParity(orig: string, t: string): { type: "question" | "exclaim" | null; fix: string } {
  const o = orig.trim();
  const tr = t.trim();
  if (o.endsWith("?") && !tr.endsWith("؟") && !tr.endsWith("?")) {
    return { type: "question", fix: tr.replace(/[.،,]?$/, "") + "؟" };
  }
  if (o.endsWith("!") && !tr.endsWith("!") && !tr.endsWith("؟")) {
    return { type: "exclaim", fix: tr.replace(/[.،,]?$/, "") + "!" };
  }
  return { type: null, fix: t };
}

function ruleMissingTerminalPunct(orig: string, t: string): boolean {
  const cleanOrig = STRIP_FILLER(orig).trim();
  const cleanT = STRIP_FILLER(t).trim();
  if (cleanOrig.length < 25 || cleanT.length < 15) return false;
  // Original ends with a sentence terminator
  if (!/[.!?؟…]$/.test(cleanOrig)) return false;
  // Translation does NOT
  return !/[.!?؟…»"')\]]$/.test(cleanT);
}

// ============================================================================
// Translation quality rules
// ============================================================================

function ruleUntranslated(orig: string, t: string): boolean {
  const stripped = STRIP_FILLER(t).trim();
  const origStripped = STRIP_FILLER(orig).trim();
  if (origStripped.length < 4) return false;
  return stripped.length > 0 && !AR_RANGE.test(stripped) && /[A-Za-z]/.test(stripped);
}

function ruleOriginalInTranslation(orig: string, t: string): string | null {
  // Detect long verbatim copies of the English original inside the translation
  const cleanOrig = STRIP_FILLER(orig).trim();
  const cleanT = STRIP_FILLER(t);
  if (cleanOrig.length < 12) return null;
  // Direct substring (case-insensitive)
  if (cleanT.toLowerCase().includes(cleanOrig.toLowerCase())) return cleanOrig;
  return null;
}

function ruleCommonUntranslated(t: string): string[] {
  const stripped = STRIP_FILLER(t);
  const found = new Set<string>();
  const matches = stripped.match(/[A-Za-z]{2,}/g) || [];
  for (const m of matches) {
    if (COMMON_UNTRANSLATED.has(m.toLowerCase())) found.add(m);
  }
  return [...found];
}

// ============================================================================
// Structural / line rules
// ============================================================================

function ruleLineCountMismatch(orig: string, t: string): { origLines: number; transLines: number } | null {
  const oN = orig.split("\n").length;
  const tN = t.split("\n").length;
  if (oN > 1 && oN !== tN) return { origLines: oN, transLines: tN };
  return null;
}

// ============================================================================
// Length rules
// ============================================================================

function ruleByteLimit(t: string, maxBytes: number): { bytes: number; over: boolean; near: boolean } {
  if (!maxBytes || maxBytes <= 0) return { bytes: 0, over: false, near: false };
  const bytes = utf8ByteLength(t);
  return { bytes, over: bytes > maxBytes, near: bytes <= maxBytes && bytes / maxBytes > 0.85 };
}

// ============================================================================
// Consistency map builder
// ============================================================================

export function buildConsistencyMap(
  pairs: { original: string; translation: string }[]
): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const { original, translation } of pairs) {
    const stripped = STRIP_FILLER(original).trim();
    const t = STRIP_FILLER(translation).trim();
    if (!stripped || !t) continue;
    const m = stripped.match(/^[A-Z][A-Za-z]{2,}$/);
    if (!m) continue;
    if (!counts.has(stripped)) counts.set(stripped, new Map());
    const inner = counts.get(stripped)!;
    inner.set(t, (inner.get(t) || 0) + 1);
  }
  const result = new Map<string, string>();
  for (const [term, inner] of counts) {
    let best = "", n = 0;
    for (const [tr, c] of inner) if (c > n) { best = tr; n = c; }
    if (n >= 2) result.set(term, best);
  }
  return result;
}

// ============================================================================
// Duplicate translation detection
// ============================================================================

function buildDuplicateMap(
  pairs: { key: string; translation: string }[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const { key, translation } of pairs) {
    const norm = STRIP_FILLER(translation).trim().toLowerCase();
    if (norm.length < 5) continue;
    if (!map.has(norm)) map.set(norm, []);
    map.get(norm)!.push(key);
  }
  return map;
}

// ============================================================================
// Main scanner
// ============================================================================

export function scanEntryLocally(
  key: string,
  original: string,
  translation: string,
  consistencyMap?: Map<string, string>,
  ctx?: LocalScanContext,
  duplicateKeys?: string[],
): LocalIssue[] {
  const issues: LocalIssue[] = [];
  const t = translation;
  const orig = original;

  if (!t.trim()) return issues;

  // 1. Byte limit
  if (ctx?.maxBytes && ctx.maxBytes > 0) {
    const r = ruleByteLimit(t, ctx.maxBytes);
    if (r.over) {
      issues.push({
        key, original: orig, translation: t, suggestion: t,
        issue: "تجاوز الحد المسموح من البايتات",
        reason: `طول الترجمة ${r.bytes} بايت بينما الحد الأقصى لهذا الإدخال هو ${ctx.maxBytes} بايت. لو لم يُختصر النص فلن يُحفظ بشكل صحيح في ملف اللعبة.`,
        severity: "high", type: "missing_char", rule: "byte_over",
      });
    } else if (r.near) {
      issues.push({
        key, original: orig, translation: t, suggestion: t,
        issue: "اقترب من حد البايتات",
        reason: `الترجمة تستهلك ${r.bytes} من ${ctx.maxBytes} بايت (أكثر من 85%). أيّ تعديل بسيط قد يتجاوز الحد.`,
        severity: "low", type: "missing_char", rule: "byte_near",
      });
    }
  }

  // 2. Missing tags
  const missingTags = ruleMissingTags(orig, t);
  if (missingTags.length > 0) {
    issues.push({
      key, original: orig, translation: t, suggestion: t,
      issue: `وسوم تقنية ناقصة (${missingTags.length})`,
      reason: `الوسوم ${missingTags.map(x => `"${x}"`).join(", ")} موجودة في النص الأصلي وغير موجودة في الترجمة. حذفها يكسر المتغيّرات والألوان والأيقونات داخل اللعبة.`,
      severity: "high", type: "missing_char", rule: "missing_tags",
    });
  }

  // 3. Damaged PUA
  const pua = ruleDamagedPUA(orig, t);
  if (pua.origCount > pua.transCount) {
    issues.push({
      key, original: orig, translation: t, suggestion: t,
      issue: "رموز تحكّم تالفة أو ناقصة",
      reason: `النص الأصلي يحتوي ${pua.origCount} رمز تحكّم خاص (PUA/control)، لكنّ الترجمة تحتوي ${pua.transCount} فقط. هذه الرموز تتحكّم في الألوان والمتغيّرات والمحارف الخاصة، وفقدها يُلحق ضرراً بصرياً ووظيفياً.`,
      severity: "high", type: "missing_char", rule: "damaged_pua",
    });
  }

  // 4. Placeholder mismatch
  const ph = rulePlaceholderMismatch(orig, t);
  if (ph.origN !== ph.transN) {
    issues.push({
      key, original: orig, translation: t, suggestion: t,
      issue: `عدم تطابق المُحدِّدات (${ph.transN}/${ph.origN})`,
      reason: `النص الأصلي يحتوي ${ph.origN} محدِّد متغيّر (U+FFFC) لكنّ الترجمة فيها ${ph.transN}. أيّ اختلاف يكسر إدراج القيم أثناء اللعب.`,
      severity: "high", type: "missing_char", rule: "ph_mismatch",
    });
  }

  // 5. Unclosed brackets
  if (ruleUnclosedBrackets(t)) {
    issues.push({
      key, original: orig, translation: t, suggestion: t,
      issue: "أقواس غير متوازنة",
      reason: "عدد الأقواس المفتوحة [ لا يساوي عدد المغلقة ]، وهذا يكسر الوسوم التقنية في معظم محرّكات الألعاب.",
      severity: "high", type: "missing_char", rule: "unclosed_brackets",
    });
  }

  // 6. Untranslated (no Arabic at all)
  if (ruleUntranslated(orig, t)) {
    issues.push({
      key, original: orig, translation: t, suggestion: t,
      issue: "النص لم يُترجم",
      reason: "الترجمة لا تحتوي على أيّ حرف عربي مع أنّ النص الأصلي يحتوي حروفاً لاتينية. على الأرجح أنّ الإدخال نُسي أو نُسخ كما هو.",
      severity: "high", type: "accuracy", rule: "untranslated",
    });
  }

  // 7. Original in translation (verbatim copy)
  const verb = ruleOriginalInTranslation(orig, t);
  if (verb) {
    issues.push({
      key, original: orig, translation: t, suggestion: t,
      issue: "النص الأصلي مدمج حرفياً في الترجمة",
      reason: `يبدو أنّ النص الإنجليزي «${verb.slice(0, 40)}${verb.length > 40 ? "…" : ""}» منسوخ كما هو داخل الترجمة. أعد كتابتها بالعربية فقط.`,
      severity: "high", type: "accuracy", rule: "verbatim_copy",
    });
  }

  // 8. Common untranslated English words
  const stranded = ruleCommonUntranslated(t);
  if (stranded.length > 0) {
    issues.push({
      key, original: orig, translation: t, suggestion: t,
      issue: `كلمات إنجليزية شائعة غير مترجمة: ${stranded.slice(0, 4).join(", ")}${stranded.length > 4 ? "…" : ""}`,
      reason: "هذه كلمات شائعة جداً في واجهات الألعاب وعادةً تُترجَم إلى العربية. وجودها بالإنجليزية يكسر تجربة المستخدم.",
      severity: "medium", type: "terminology", rule: "common_untranslated",
    });
  }

  // 9. Whitespace
  const ws1 = ruleDoubleSpaces(t);
  if (ws1.matched) {
    issues.push({
      key, original: orig, translation: t, suggestion: ws1.fix,
      issue: "مسافات مزدوجة",
      reason: "وجود مسافتين أو أكثر متتاليتين بين الكلمات. توحيدها إلى مسافة واحدة يُحسّن المظهر ويوفّر بايتات.",
      severity: "low", type: "punctuation", rule: "double_space",
    });
  }
  const ws2 = ruleSpaceBeforePunct(t);
  if (ws2.matched) {
    issues.push({
      key, original: orig, translation: t, suggestion: ws2.fix,
      issue: "مسافة قبل علامة ترقيم",
      reason: "في العربية لا تُترك مسافة قبل علامة الترقيم (،.؛:!؟). يجب أن تلتصق بالكلمة السابقة لها.",
      severity: "low", type: "punctuation", rule: "space_before_punct",
    });
  }
  const ws3 = ruleNoSpaceAfterPunct(t);
  if (ws3.matched) {
    issues.push({
      key, original: orig, translation: t, suggestion: ws3.fix,
      issue: "مسافة ناقصة بعد علامة ترقيم",
      reason: "علامتا الفاصلة (،) والفاصلة المنقوطة (؛) يجب أن تتبعهما مسافة قبل الكلمة التالية.",
      severity: "low", type: "punctuation", rule: "missing_space_after_punct",
    });
  }
  const ws4 = ruleTabs(t);
  if (ws4.matched) {
    issues.push({
      key, original: orig, translation: t, suggestion: ws4.fix,
      issue: "محارف Tab داخل النص",
      reason: "وجود رمز Tab (\\t) داخل الترجمة. عادة لا تدعمه محرّكات النصوص في الألعاب وقد يُعرض كمربع غريب.",
      severity: "low", type: "punctuation", rule: "tab_chars",
    });
  }
  const ws5 = ruleLeadingTrailingSpaces(t);
  if (ws5.matched) {
    issues.push({
      key, original: orig, translation: t, suggestion: ws5.fix,
      issue: "مسافات في بداية أو نهاية النص",
      reason: "مسافات على الأطراف لا تظهر بصرياً لكنّها تستهلك بايتات وقد تُربك المقارنات والاتساق.",
      severity: "low", type: "punctuation", rule: "edge_spaces",
    });
  }

  // 10. Repetition
  const rep = ruleRepeatedWord(t, orig);
  if (rep.matched) {
    issues.push({
      key, original: orig, translation: t, suggestion: rep.fix,
      issue: "كلمة مكرّرة مرّتين متتاليتين",
      reason: "وجود نفس الكلمة مرّتين متتاليتين بدون فاصل غالباً خطأ نسخ/لصق أو خطأ مطبعي.",
      severity: "medium", type: "missing_char", rule: "repeated_word",
    });
  }
  const rch = ruleRepeatedChar(t);
  if (rch.match) {
    issues.push({
      key, original: orig, translation: t, suggestion: rch.fix,
      issue: `حرف مكرّر ${rch.match[0].length} مرّات («${rch.match[1]}»)`,
      reason: "تكرار نفس الحرف 4 مرّات أو أكثر يدلّ غالباً على خطأ كتابة. الإبقاء على حرفين فقط يحافظ على التأكيد بدون مبالغة.",
      severity: "medium", type: "style", rule: "repeated_char",
    });
  }

  // 11. Glued scripts
  const gl = ruleGluedScripts(t);
  if (gl.matched) {
    issues.push({
      key, original: orig, translation: t, suggestion: gl.fix,
      issue: "كلمات ملتصقة (عربي + لاتيني)",
      reason: "حرف عربي وحرف إنجليزي ملتصقان بدون مسافة بينهما. الفصل بمسافة يحافظ على وضوح القراءة في كلا الاتجاهين.",
      severity: "medium", type: "style", rule: "glued_scripts",
    });
  }

  // 12. Punctuation parity
  const pp = rulePunctParity(orig, t);
  if (pp.type === "question") {
    issues.push({
      key, original: orig, translation: t, suggestion: pp.fix,
      issue: "علامة استفهام مفقودة",
      reason: "النص الأصلي ينتهي بعلامة استفهام (?) لكنّ الترجمة لا تنتهي بعلامة استفهام عربية (؟).",
      severity: "medium", type: "punctuation", rule: "missing_question_mark",
    });
  } else if (pp.type === "exclaim") {
    issues.push({
      key, original: orig, translation: t, suggestion: pp.fix,
      issue: "علامة تعجّب مفقودة",
      reason: "النص الأصلي ينتهي بعلامة تعجّب (!) لكنّ الترجمة لا تنتهي بمثلها. الحفاظ على لهجة العبارة مهم.",
      severity: "medium", type: "punctuation", rule: "missing_exclaim",
    });
  }

  if (ruleMissingTerminalPunct(orig, t)) {
    issues.push({
      key, original: orig, translation: t, suggestion: t.trimEnd() + ".",
      issue: "نقطة نهاية الجملة مفقودة",
      reason: "النص الأصلي جملة كاملة تنتهي بنقطة لكنّ الترجمة لا تنتهي بأيّ علامة نهاية. هذا يُربك القارئ في الجمل الطويلة.",
      severity: "low", type: "punctuation", rule: "missing_terminal",
    });
  }

  // 13. Line count mismatch
  const lc = ruleLineCountMismatch(orig, t);
  if (lc) {
    issues.push({
      key, original: orig, translation: t, suggestion: t,
      issue: `عدد الأسطر مختلف عن الأصل (${lc.transLines} مقابل ${lc.origLines})`,
      reason: "الأصل مقسّم على عدّة أسطر ولكلّ سطر دور بصريّ في صناديق الحوار. اختلاف عدد الأسطر قد يُخرج النص من الإطار.",
      severity: "medium", type: "style", rule: "line_count_mismatch",
    });
  }

  // 14. Consistency (single capitalised word)
  if (consistencyMap) {
    const origStripped = STRIP_FILLER(orig).trim();
    const tStripped = STRIP_FILLER(t).trim();
    if (/^[A-Z][A-Za-z]{2,}$/.test(origStripped)) {
      const dominant = consistencyMap.get(origStripped);
      if (dominant && tStripped && tStripped !== dominant) {
        issues.push({
          key, original: orig, translation: t,
          suggestion: t.replace(tStripped, dominant),
          issue: `«${dominant}» هي الترجمة الشائعة لكلمة «${origStripped}»`,
          reason: `راجعنا كل الإدخالات التي يظهر فيها «${origStripped}» مفرداً، وكانت الترجمة الأكثر تكراراً «${dominant}». الالتزام بترجمة موحّدة ضروري لاتساق المعجم داخل اللعبة.`,
          severity: "medium", type: "consistency", rule: "term_consistency",
        });
      }
    }
  }

  // 15. Duplicate translation
  if (duplicateKeys && duplicateKeys.length > 1) {
    const others = duplicateKeys.filter(k => k !== key);
    if (others.length > 0) {
      issues.push({
        key, original: orig, translation: t, suggestion: t,
        issue: `ترجمة متطابقة مع ${others.length} إدخال آخر`,
        reason: `هذه الترجمة الحرفية تظهر مكرّرة في إدخالات أخرى (${others.slice(0, 3).join(", ")}${others.length > 3 ? "…" : ""}). إن كانت سياقات هذه الإدخالات مختلفة فقد يكون التكرار خاطئاً.`,
        severity: "low", type: "consistency", rule: "duplicate_translation",
      });
    }
  }

  return issues;
}

export interface LocalScanInput {
  key: string;
  original: string;
  translation: string;
  maxBytes?: number;
}

export function scanAllLocally(entries: LocalScanInput[]): LocalIssue[] {
  const consistency = buildConsistencyMap(entries);
  const dupMap = buildDuplicateMap(entries);
  const all: LocalIssue[] = [];
  for (const e of entries) {
    const norm = STRIP_FILLER(e.translation).trim().toLowerCase();
    const dupKeys = norm.length >= 5 ? dupMap.get(norm) : undefined;
    all.push(
      ...scanEntryLocally(e.key, e.original, e.translation, consistency, { maxBytes: e.maxBytes }, dupKeys),
    );
  }
  return all;
}

const LOCAL_SCAN_BATCH = 50;

/**
 * Async version of scanAllLocally that yields to the event loop between
 * batches, preventing UI freezes on large entry sets.
 */
export async function scanAllLocallyAsync(
  entries: LocalScanInput[],
  onProgress?: (done: number, total: number) => void,
  shouldAbort?: () => boolean,
  onBatchDone?: (issues: LocalIssue[]) => void,
): Promise<LocalIssue[]> {
  const consistency = buildConsistencyMap(entries);
  const dupMap = buildDuplicateMap(entries);
  const all: LocalIssue[] = [];

  for (let i = 0; i < entries.length; i += LOCAL_SCAN_BATCH) {
    if (shouldAbort?.()) break;
    const batch = entries.slice(i, i + LOCAL_SCAN_BATCH);
    const batchIssues: LocalIssue[] = [];
    for (const e of batch) {
      const norm = STRIP_FILLER(e.translation).trim().toLowerCase();
      const dupKeys = norm.length >= 5 ? dupMap.get(norm) : undefined;
      batchIssues.push(
        ...scanEntryLocally(e.key, e.original, e.translation, consistency, { maxBytes: e.maxBytes }, dupKeys),
      );
    }
    all.push(...batchIssues);
    onProgress?.(Math.min(i + LOCAL_SCAN_BATCH, entries.length), entries.length);
    onBatchDone?.(batchIssues);
    // Yield to the event loop so the browser can repaint
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  return all;
}

/** Map a LocalIssue's type to whether it's a "grammar" error or a "style" enhancement. */
export function isGrammarIssue(type: IssueType): boolean {
  return type === "missing_char" || type === "punctuation" || type === "grammar" || type === "accuracy";
}
