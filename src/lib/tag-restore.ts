// إصلاح الرموز التقنية وفواصل السطور.
// 1) يعيد ترميز PUA (U+E000..U+E0FF) و FFF9..FFFC التي يحذفها/يشوّهها مترجِم AI.
// 2) يعيد فواصل الأسطر (\n) عندما يدمج المترجِم الأسطر في سطر واحد، أو
//    يحوّل \\n الحرفية و <br> إلى أسطر حقيقية.
// 3) يرصد إزاحة الرموز حتى لو كان العدد والتسلسل صحيحين، ثم يعيدها تلقائياً
//    إلى مواقعها النسبية حسب الأصل.
//
// كلّ مسار ترجمة / بناء يجب أن يمرّ عبر `restoreTagsAndLineBreaks` كحارس أخير.

import { countEffectiveLines, tokenize } from "./text-tokens";
import { restoreTagsLocally } from "./xc3-tag-restoration";

const TAG_REGEX_G = /[\uFFF9-\uFFFC\uE000-\uE0FF]/g;
const TAG_REGEX_SINGLE = /[\uFFF9-\uFFFC\uE000-\uE0FF]/;

/** علامات الترقيم العربية والإنجليزية التي يُفضَّل القطع عندها لإعادة بناء سطر مدموج. */
const NATURAL_BREAKS = new Set([
  "،", ",", ".", "؟", "?", "!", "؛", ";", ":", "…",
]);

interface OriginalTagGroup {
  chars: string;
  lineIndex: number;
  lineRelativePosition: number;
}

function stripTags(text: string): string {
  return text.replace(TAG_REGEX_G, "");
}

function extractOriginalTagGroups(original: string): OriginalTagGroup[] {
  const lineLengths = original.split("\n").map(line => stripTags(line).length);
  const groups: OriginalTagGroup[] = [];
  let lineIndex = 0;
  let lineCleanIndex = 0;
  let i = 0;

  while (i < original.length) {
    const ch = original[i];
    if (TAG_REGEX_SINGLE.test(ch)) {
      let chars = "";
      while (i < original.length && TAG_REGEX_SINGLE.test(original[i])) {
        chars += original[i];
        i++;
      }
      const lineLength = lineLengths[lineIndex] || 0;
      groups.push({
        chars,
        lineIndex,
        lineRelativePosition: lineLength === 0 ? 0 : lineCleanIndex / lineLength,
      });
      continue;
    }

    if (ch === "\n") {
      lineIndex++;
      lineCleanIndex = 0;
    } else {
      lineCleanIndex++;
    }
    i++;
  }

  return groups;
}

function splitTextToWeightedSegments(text: string, weights: number[]): string[] {
  if (weights.length === 0) return [];
  if (weights.length === 1) return [text.trim()];

  const totalWeight = weights.reduce((sum, w) => sum + Math.max(1, w), 0) || 1;
  const segments: string[] = [];
  let consumedWeight = 0;
  let pos = 0;
  const SEARCH_WINDOW = 18;

  for (let i = 0; i < weights.length - 1; i++) {
    consumedWeight += Math.max(1, weights[i]);
    const idealEnd = Math.max(pos + 1, Math.round(text.length * (consumedWeight / totalWeight)));
    let best = -1;

    for (let d = 0; d <= SEARCH_WINDOW; d++) {
      const left = idealEnd - d;
      const right = idealEnd + d;
      if (left > pos && left < text.length && NATURAL_BREAKS.has(text[left])) { best = left + 1; break; }
      if (right > pos && right < text.length && NATURAL_BREAKS.has(text[right])) { best = right + 1; break; }
    }
    if (best === -1) {
      for (let d = 0; d <= SEARCH_WINDOW; d++) {
        const left = idealEnd - d;
        const right = idealEnd + d;
        if (left > pos && left < text.length && /\s/.test(text[left])) { best = left; break; }
        if (right > pos && right < text.length && /\s/.test(text[right])) { best = right; break; }
      }
    }
    if (best === -1 || best <= pos) best = Math.min(Math.max(idealEnd, pos + 1), text.length);

    segments.push(text.slice(pos, best).trim());
    pos = best;
    while (pos < text.length && /\s/.test(text[pos])) pos++;
  }

  segments.push(text.slice(pos).trim());
  return segments;
}

function nearestTextBoundary(line: string, rawPosition: number): number {
  const boundaries = new Set<number>([0, line.length]);
  for (let i = 0; i < line.length; i++) {
    if (/\s/.test(line[i]) || NATURAL_BREAKS.has(line[i])) {
      boundaries.add(i);
      boundaries.add(Math.min(line.length, i + 1));
    }
  }
  let best = Math.max(0, Math.min(line.length, rawPosition));
  let bestDistance = Infinity;
  for (const boundary of boundaries) {
    const distance = Math.abs(boundary - rawPosition);
    if (distance < bestDistance) {
      best = boundary;
      bestDistance = distance;
    }
  }
  return best;
}

function insertOriginalTagsAtRelativePositions(original: string, translation: string): string {
  const originalGroups = extractOriginalTagGroups(original);
  const cleanTranslation = stripTags(translation);
  if (originalGroups.length === 0) return cleanTranslation;

  const lines = cleanTranslation.split("\n");
  const groupedByLine = new Map<number, OriginalTagGroup[]>();
  for (const group of originalGroups) {
    const lineIndex = Math.min(group.lineIndex, Math.max(0, lines.length - 1));
    const lineGroups = groupedByLine.get(lineIndex) || [];
    lineGroups.push(group);
    groupedByLine.set(lineIndex, lineGroups);
  }

  return lines.map((line, lineIndex) => {
    const lineGroups = groupedByLine.get(lineIndex);
    if (!lineGroups?.length) return line;
    const insertions = new Map<number, string[]>();
    for (const group of lineGroups) {
      const rawPos = Math.max(0, Math.min(line.length, Math.round(group.lineRelativePosition * line.length)));
      const pos = nearestTextBoundary(line, rawPos);
      const atPos = insertions.get(pos) || [];
      atPos.push(group.chars);
      insertions.set(pos, atPos);
    }

    let out = "";
    for (let pos = 0; pos <= line.length; pos++) {
      const tags = insertions.get(pos);
      if (tags) out += tags.join("");
      if (pos < line.length) out += line[pos];
    }
    return out;
  }).join("\n");
}

/** كلمات قائمة الجرد/الفرز التي يجب أن يلتصق بها كود `0x0E` بدون مسافة. */
const MENU_GLUE_WORDS = ["جديد", "فرز", "سقاط", "إسقاط", "جوع", "كمّ", "كم", "عدد"];

/**
 * يضمن التصاق رموز الـ PUA بالكلمة المتوقّعة في إدخالات القوائم.
 * إذا كان الأصل بنمط «كلمة + رمز» (مثل `جديد\uE0XX`) ووجد الرمز في الترجمة
 * منفصلاً عن الكلمة بمسافة أو علامة، يُلصَق به مباشرة بدون مسافة.
 */
function gluePuaToMenuWords(original: string, translation: string): string {
  if (!translation || !TAG_REGEX_SINGLE.test(translation)) return translation;
  let out = translation;
  for (const word of MENU_GLUE_WORDS) {
    if (!original.includes(word)) continue;
    // كلمة + (مسافة/علامات) + رمز  →  كلمة + رمز
    const re = new RegExp(`(${word})[\\s\\u00A0\\.\\,\\:\\;،؛]*([\\uE000-\\uE0FF\\uFFF9-\\uFFFC]+)`, "g");
    out = out.replace(re, "$1$2");
    // رمز + (مسافة/علامات) + كلمة  →  رمز + كلمة (لو الأصل بنمط رمز-قبل)
    const reBefore = new RegExp(`([\\uE000-\\uE0FF\\uFFF9-\\uFFFC]+)[\\s\\u00A0\\.\\,\\:\\;،؛]*(${word})`, "g");
    out = out.replace(reBefore, "$1$2");
  }
  return out;
}

export function restoreTechnicalTags(original: string, translation: string): string {
  if (!translation) return translation;
  const restored = insertOriginalTagsAtRelativePositions(original, translation);
  return gluePuaToMenuWords(original, restored);
}

/** يحوّل تمثيلات الـ AI الشائعة للأسطر إلى \n حقيقي قبل أيّ معالجة. */
export function normalizeLineBreakRepresentations(text: string): string {
  if (!text) return text;
  let out = text;
  // <br>, <br/>, <br /> → \n
  out = out.replace(/<br\s*\/?>/gi, "\n");
  // \r\n / \r → \n
  out = out.replace(/\r\n?/g, "\n");
  // backslash-n الحرفي (مثل النصّ "\n") → \n
  out = out.replace(/\\n/g, "\n");
  return out;
}

/**
 * يعيد فواصل الأسطر (\n) المفقودة من الترجمة بناءً على الأصل.
 * - يحافظ على الترجمة كما هي لو عدد الأسطر متطابق.
 * - يحوّل التمثيلات الحرفية (\\n, <br>, CR) إلى \n حقيقي.
 * - إن كان الأصل بأكثر من سطر والترجمة سطر واحد، يقسّم الترجمة عند أقرب
 *   نقطة طبيعية (علامة ترقيم) لمواقع متناسبة مع طول كلّ سطر في الأصل.
 * - لا يلمس الترجمة لو كانت مقسّمة جزئياً (لتجنّب تخمين خاطئ — تُعرَض للمراجعة).
 */
export function restoreLineBreaks(original: string, translation: string): string {
  if (!original || !translation) return translation;

  const work = normalizeLineBreakRepresentations(translation);

  const origLines = original.split("\n");
  if (origLines.length <= 1) return work;

  const workLines = work.split("\n");
  if (workLines.length === origLines.length) return work;

  const mergedTranslation = workLines.map(line => line.trim()).filter(Boolean).join(" ");
  const weights = origLines.map(line => stripTags(line).trim().length);
  return splitTextToWeightedSegments(mergedTranslation, weights).join("\n");
}

/**
 * يحذف الأقواس المربّعة التي يُضيفها الـ AI من تلقاء نفسه لوصف وسوم اللعبة.
 * مثلاً عند رؤية PUA marker يقوم النموذج أحياناً بإضافة `[Color:Red][Icon:Heart]`
 * كنصّ مرئيّ بجوار (أو بدلاً من) العلامة الأصليّة — وهذا يُفسِد البناء لأنّه
 * يبقى كنصّ عاديّ داخل MSBT بدلاً من كونه bytes تقنيّة.
 *
 * الاستراتيجية: أيّ شيء داخل أقواس مربّعة محتواه ASCII بنمط وسم لعبة
 *  (`[Word]` أو `[Word:Value]` أو `[Word.Value]` ...) ولا يحتوي حروفاً عربيّة
 * يُحذَف. هذا يحافظ على المحتوى العربي بين الأقواس (مثل `[ملاحظة]`)
 * ولا يلمس وسوم الـ PUA الحقيقيّة لأنّها ليست داخل أقواس.
 */
/**
 * Xenoblade Chronicles legitimate tag patterns. MUST be preserved verbatim.
 * Examples: [XENO:n ], [XENO:wait wait=key ], [XENO:del del=this ],
 *           [System:PageBreak ], [System:Ruby rt=... ], [/System:Ruby ],
 *           [ML:icon icon=btn_a ], [ML:Dash ]
 */
const XC3_TAG_PREFIX_RE = /^\/?\s*(XENO|System|ML)\b/i;

export function isXc3Tag(inside: string): boolean {
  return XC3_TAG_PREFIX_RE.test(inside.trim());
}

export function stripHallucinatedTagBrackets(text: string): string {
  if (!text) return text;
  // Allow `=`, `'`, internal `/` inside the bracket so real XC3 tags match the regex.
  return text.replace(/\[([A-Za-z_/][A-Za-z0-9_:./\-=\s']*)\]/g, (match, inside: string) => {
    if (/[\u0600-\u06FF]/.test(inside)) return match;
    if (/^TAG_\d+$/.test(inside.trim())) return match;
    if (isXc3Tag(inside)) return match;
    return "";
  });
}

/**
 * إصلاح موحَّد: يطبّق إعادة فواصل الأسطر ثم إعادة الرموز بهذا الترتيب.
 * - حذف الأقواس الوهميّة أوّلاً قبل أيّ عدّ للسطور أو مواقع الرموز.
 * - فواصل الأسطر بعدها لأنّ الرموز قد تتحرّك بعد التقسيم.
 * - يضمن أنّ كلّ ما يخرج من أيّ مترجِم يمرّ عبر هذا قبل الحفظ والبناء.
 */
export function restoreTagsAndLineBreaks(original: string, translation: string): string {
  if (!translation) return translation;
  const stripped = stripHallucinatedTagBrackets(translation);
  const afterLineBreaks = restoreLineBreaks(original, stripped);
  const afterPua = restoreTechnicalTags(original, afterLineBreaks);
  // استرجاع الوسوم بالأقواس [XENO:...], [System:PageBreak ], [XENO:n ], [ML:...]
  // المفقودة أو في غير مكانها — الـ PUA كان فقط للرموز غير المرئية.
  return restoreTagsLocally(original, afterPua);
}

/** أسباب اعتبار الترجمة مكسورة. */
export interface RestoreIssueReasons {
  /** عدد الرموز الناقصة (الأصل أكثر). يُصلَح آلياً. */
  missingTags: number;
  /** عدد الرموز الزائدة في الترجمة (لا يوجد ما يقابلها بالأصل). يُصلَح آلياً بحذفها. */
  extraTags: number;
  /** عدد المواقع التي قيمة/ترتيب الرمز فيها تختلف بين الأصل والترجمة (نفس العدد). يُصلَح آلياً بإعادة الأصل. */
  changedTagPositions: number;
  /** نفس الرموز والتسلسل موجودة، لكن مواقعها النسبية داخل السطر تختلف عن الأصل. يُصلَح آلياً. */
  misplacedTags: number;
  /** فاصل سطر ناقص يمكن إصلاحه آلياً (الأصل > 1 والترجمة = 1). */
  missingLineBreaksAuto: number;
  /** فاصل سطر ناقص لا نضمن تقسيمه (الأصل > 1 والترجمة > 1 ولكن أقلّ من الأصل). للمراجعة. */
  missingLineBreaksPartial: number;
  /** الترجمة فيها <br>/CR/\\n الحرفي يلزم تحويلها لأسطر حقيقيّة. يُصلَح آلياً. */
  needsNormalize: boolean;
}

export interface RestoreIssueTotals extends RestoreIssueReasons {
  affectedTranslations: number;
}

export interface RestoreIssue {
  key: string;
  msbtFile: string;
  label: string;
  original: string;
  before: string;
  after: string;
  /** auto = يصلَح آلياً عند الضغط على «إصلاح». review = يحتاج مراجعتك (لا نخمّن). */
  kind: "auto" | "review";
  reasons: RestoreIssueReasons;
}

export interface RestoreReport {
  scanned: number;
  /** عدد الترجمات التي تُصلَح آلياً. */
  autoFixable: number;
  /** عدد الترجمات التي تحتاج مراجعة يدويّة. */
  needsReview: number;
  /** تفصيل عددي لكل أنواع المشاكل المكتشفة، وليس فقط عدد الترجمات. */
  issueTotals: RestoreIssueTotals;
  /**
   * عدد الترجمات (داخل needsReview) التي رموزها بنفس العدد كالأصل
   * لكنّ ترتيبها/قِيَمها مختلفة، وبالتالي يمكن إعادة ترتيبها تلقائياً.
   */
  smartReorderable: number;
  /** اسم الملفّ → عدد الترجمات المتأثّرة فيه (auto + review). */
  byFile: Record<string, number>;
  /** أمثلة من الفئة «الإصلاح الآلي». */
  autoExamples: RestoreIssue[];
  /** أمثلة من الفئة «للمراجعة». */
  reviewExamples: RestoreIssue[];
  /** اسم احتياطي للتوافق مع الكود القديم: نفس `autoFixable`. */
  fixable: number;
}

function countTags(text: string): number {
  return (text.match(TAG_REGEX_G) || []).length;
}

function countLineBreaks(text: string): number {
  if (!text) return 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") n++;
  return n;
}

/**
 * Extract the ordered sequence of "tags" in a text — includes both PUA glyphs
 * AND XC3 bracket tags ([XENO:...], [System:...], [ML:...], [/System:...]).
 * Hard-break tags (XENO:n / System:PageBreak) are intentionally excluded here
 * because they are tracked as line-breaks, not as tag presence/absence.
 */
function extractTagSequence(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const t of tokenize(text)) {
    if (t.kind === "pua" || t.kind === "control") out.push(t.raw);
    else if (t.kind === "tag") out.push(t.raw);
  }
  return out;
}

/**
 * يكتشف رموز PUA المحشورة داخل كلمة (بين حرفين/رقمين) في الترجمة بينما هي في الأصل
 * على حدّ كلمة. يسبّب ظهور `??` لأنّ المحرّك يقرأ بايتات وسطية كأنّها بداية كود.
 * يُرجِع عدد المواضع المعطوبة.
 */
function countPuaInsideWord(original: string, translation: string): number {
  if (!translation || !TAG_REGEX_SINGLE.test(translation)) return 0;
  const isWordChar = (ch: string) => /[\p{L}\p{N}]/u.test(ch);
  let count = 0;
  for (let i = 0; i < translation.length; i++) {
    if (!TAG_REGEX_SINGLE.test(translation[i])) continue;
    // تخطّي مجموعة الرمز كاملةً
    let j = i;
    while (j < translation.length && TAG_REGEX_SINGLE.test(translation[j])) j++;
    const before = i > 0 ? translation[i - 1] : "";
    const after = j < translation.length ? translation[j] : "";
    if (before && after && isWordChar(before) && isWordChar(after)) {
      // تحقّق أنّ الأصل لم يكن كذلك (لتجنّب اعتبار المتعمّد خطأً)
      const stripIdx = stripTags(translation.slice(0, i)).length;
      const origStripped = stripTags(original);
      const ob = origStripped[stripIdx - 1] || "";
      const oa = origStripped[stripIdx] || "";
      if (!(ob && oa && isWordChar(ob) && isWordChar(oa))) count++;
    }
    i = j - 1;
  }
  return count;
}

function countMisplacedTagGroups(original: string, translation: string): number {
  const origSeq = extractTagSequence(original);
  const transSeq = extractTagSequence(translation);
  if (origSeq.length === 0 || origSeq.length !== transSeq.length) return 0;
  for (let i = 0; i < origSeq.length; i++) if (origSeq[i] !== transSeq[i]) return 0;
  const normalized = normalizeLineBreakRepresentations(translation);
  const restored = restoreTechnicalTags(original, normalized);
  if (restored === normalized) return 0;
  return Math.max(1, extractOriginalTagGroups(original).length);
}

/** يحسب الأسباب لإدخالة واحدة دون الحاجة لاستدعاء التطبيق الفعلي. */
function analyzeReasons(original: string, translation: string): RestoreIssueReasons {
  const normalized = normalizeLineBreakRepresentations(translation);
  const origTagSeq = extractTagSequence(original);
  const transTagSeq = extractTagSequence(translation);
  // Hard-break aware line counting: [XENO:n ] and [System:PageBreak ] count
  // as line terminators in the XC3 engine, so we count effective lines, not \n.
  const origLines = countEffectiveLines(original);
  const transLines = countEffectiveLines(normalized);
  const origBreaks = Math.max(0, origLines - 1);
  const transBreaks = Math.max(0, transLines - 1);

  const missingTags = Math.max(0, origTagSeq.length - transTagSeq.length);
  const extraTags = Math.max(0, transTagSeq.length - origTagSeq.length);

  // مقارنة الترتيب/القيم لو العدد متطابق
  let changedTagPositions = 0;
  if (origTagSeq.length === transTagSeq.length && origTagSeq.length > 0) {
    for (let i = 0; i < origTagSeq.length; i++) {
      if (origTagSeq[i] !== transTagSeq[i]) changedTagPositions++;
    }
  }
  const misplacedTags = changedTagPositions === 0 ? countMisplacedTagGroups(original, translation) : 0;

  // فواصل الأسطر: نُفرّق بين القابل للإصلاح الآلي والقابل للمراجعة فقط
  let missingLineBreaksAuto = 0;
  let missingLineBreaksPartial = 0;
  if (origLines > 1 && origBreaks > transBreaks) {
    if (transLines === 1) {
      missingLineBreaksAuto = origBreaks - transBreaks;
    } else {
      missingLineBreaksPartial = origBreaks - transBreaks;
    }
  }

  const needsNormalize = translation !== normalized;

  return {
    missingTags,
    extraTags,
    changedTagPositions,
    misplacedTags,
    missingLineBreaksAuto,
    missingLineBreaksPartial,
    needsNormalize,
  };
}

function isAutoFix(r: RestoreIssueReasons): boolean {
  return r.missingTags > 0 || r.extraTags > 0 || r.changedTagPositions > 0 || r.misplacedTags > 0 || r.missingLineBreaksAuto > 0 || r.missingLineBreaksPartial > 0 || r.needsNormalize;
}

function isReview(r: RestoreIssueReasons): boolean {
  return false;
}

/**
 * إصلاح ذكيّ للرموز فقط: يعيد بناء الرموز حسب الأصل ومواقعها النسبية.
 * لا يلمس فواصل الأسطر، ولا يلمس الترجمات التي ليس في أصلها رموز.
 */
export function smartReorderTags(original: string, translation: string): string {
  if (!original || !translation) return translation;
  const origSeq = extractTagSequence(original);
  if (origSeq.length === 0) return translation;
  return restoreTechnicalTags(original, translation);
}

/**
 * يحسب التحديثات لإعادة ترتيب الرموز فقط (لا يلمس فواصل الأسطر ولا الرموز الناقصة).
 * يُستخدم من زرّ «إصلاح ذكيّ للرموز» في نافذة الإصلاح.
 */
export function buildSmartReorderUpdates(
  entries: { msbtFile: string; index: number; original: string }[],
  translations: Record<string, string>,
): { updates: Record<string, string>; previous: Record<string, string> } {
  const updates: Record<string, string> = {};
  const previous: Record<string, string> = {};
  for (const entry of entries) {
    const key = `${entry.msbtFile}:${entry.index}`;
    const trans = translations[key];
    if (!trans || !trans.trim()) continue;
    const after = smartReorderTags(entry.original, trans);
    if (after !== trans) {
      updates[key] = after;
      previous[key] = trans;
    }
  }
  return { updates, previous };
}

/** فئة سبب لظهور `??` في اللعبة، مع توضيح إن كانت قابلة للإصلاح آلياً. */
export type TagIssueCause =
  | "pua-inside-word"     // رمز محشور بين حرفين → كسر بايتات
  | "missing-tag"         // رمز ناقص في الترجمة
  | "extra-tag"           // رمز زائد لا أصل له
  | "wrong-order"         // نفس العدد لكن التسلسل/القيم تغيّرت
  | "misplaced"           // الموقع النسبي اختلف
  | "needs-line-break"    // فاصل سطر ناقص
  | "literal-line-break"; // <br>/\n حرفي بدل سطر حقيقي

export interface DetailedIssue {
  key: string;
  msbtFile: string;
  index: number;
  label: string;
  original: string;
  translation: string;
  causes: TagIssueCause[];
  /** نسخة مُصلَحة مقترحة. */
  proposed: string;
  autoFixable: boolean;
}

/**
 * يُرجع قائمة مفصّلة بكلّ الترجمات المعطوبة (بدون سقف أمثلة).
 * يصنّف السبب لكلّ ترجمة بحيث يمكن عرضها في تقرير «أين تظهر `??`».
 */
export function getDetailedRestoreIssues(
  entries: { msbtFile: string; index: number; label: string; original: string }[],
  translations: Record<string, string>,
): DetailedIssue[] {
  const out: DetailedIssue[] = [];
  for (const entry of entries) {
    const key = `${entry.msbtFile}:${entry.index}`;
    const trans = translations[key];
    if (!trans || !trans.trim()) continue;
    const reasons = analyzeReasons(entry.original, trans);
    const insideWord = countPuaInsideWord(entry.original, trans);
    const causes: TagIssueCause[] = [];
    if (insideWord > 0) causes.push("pua-inside-word");
    if (reasons.missingTags > 0) causes.push("missing-tag");
    if (reasons.extraTags > 0) causes.push("extra-tag");
    if (reasons.changedTagPositions > 0) causes.push("wrong-order");
    if (reasons.misplacedTags > 0) causes.push("misplaced");
    if (reasons.missingLineBreaksAuto > 0 || reasons.missingLineBreaksPartial > 0) causes.push("needs-line-break");
    if (reasons.needsNormalize) causes.push("literal-line-break");
    if (causes.length === 0) continue;
    const proposed = restoreTagsAndLineBreaks(entry.original, trans);
    out.push({
      key, msbtFile: entry.msbtFile, index: entry.index, label: entry.label,
      original: entry.original, translation: trans,
      causes, proposed, autoFixable: proposed !== trans,
    });
  }
  return out;
}

/**
 * يجمع كلّ مفاتيح الترجمات التي بها مشكلة رموز/فواصل أسطر — للاستخدام في فلتر العرض.
 * أخفّ من `scanTranslationsForRestore` لأنّه لا يبني تقريراً ولا يحفظ أمثلة.
 */
export function collectRestoreIssueKeys(
  entries: { msbtFile: string; index: number; original: string }[],
  translations: Record<string, string>,
): Set<string> {
  const keys = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.msbtFile}:${entry.index}`;
    const trans = translations[key];
    if (!trans || !trans.trim()) continue;
    const reasons = analyzeReasons(entry.original, trans);
    if (isAutoFix(reasons) || isReview(reasons)) keys.add(key);
  }
  return keys;
}

/**
 * يفحص كلّ الترجمات ويُرجع تقريراً مصنّفاً (auto / review).
 *
 * - **auto**: الإصلاح آمن — رموز ناقصة، أو سطر واحد يجب تقسيمه، أو تمثيلات `<br>`/`\\n`.
 * - **review**: لا نضمن الإصلاح — الترجمة مقسّمة جزئياً، أو الرموز نفس عددها ولكن
 *   قِيَمها/ترتيبها تغيّر، أو فيها رموز زائدة. تُعرَض لك لتُقرّر.
 */
export function scanTranslationsForRestore(
  entries: { msbtFile: string; index: number; label: string; original: string }[],
  translations: Record<string, string>,
  maxExamples = 20,
): RestoreReport {
  const byFile: Record<string, number> = {};
  const autoExamples: RestoreIssue[] = [];
  const reviewExamples: RestoreIssue[] = [];
  let scanned = 0;
  let autoFixable = 0;
  let needsReview = 0;
  let smartReorderable = 0;
  const issueTotals: RestoreIssueTotals = {
    affectedTranslations: 0,
    missingTags: 0,
    extraTags: 0,
    changedTagPositions: 0,
    misplacedTags: 0,
    missingLineBreaksAuto: 0,
    missingLineBreaksPartial: 0,
    needsNormalize: false,
  };

  for (const entry of entries) {
    const key = `${entry.msbtFile}:${entry.index}`;
    const trans = translations[key];
    if (!trans || !trans.trim()) continue;
    scanned++;

    const reasons = analyzeReasons(entry.original, trans);
    const auto = isAutoFix(reasons);
    const review = isReview(reasons);
    if (!auto && !review) continue;
    issueTotals.affectedTranslations++;
    issueTotals.missingTags += reasons.missingTags;
    issueTotals.extraTags += reasons.extraTags;
    issueTotals.changedTagPositions += reasons.changedTagPositions;
    issueTotals.misplacedTags += reasons.misplacedTags;
    issueTotals.missingLineBreaksAuto += reasons.missingLineBreaksAuto;
    issueTotals.missingLineBreaksPartial += reasons.missingLineBreaksPartial;
    issueTotals.needsNormalize ||= reasons.needsNormalize;
    if (reasons.changedTagPositions > 0) smartReorderable++;

    if (auto) {
      const after = restoreTagsAndLineBreaks(entry.original, trans);
      if (after === trans && reasons.missingLineBreaksAuto === 0 && reasons.missingLineBreaksPartial === 0 && reasons.misplacedTags === 0 && !reasons.needsNormalize) {
        // الإصلاح الآلي لم يُحدِث تغييراً (مثلاً: رموز ناقصة في مجموعة كاملة) → ننقلها للمراجعة.
        needsReview++;
        byFile[entry.msbtFile] = (byFile[entry.msbtFile] || 0) + 1;
        if (reviewExamples.length < maxExamples) {
          reviewExamples.push({
            key, msbtFile: entry.msbtFile, label: entry.label,
            original: entry.original, before: trans, after: trans,
            kind: "review", reasons,
          });
        }
        continue;
      }
      autoFixable++;
      byFile[entry.msbtFile] = (byFile[entry.msbtFile] || 0) + 1;
      if (autoExamples.length < maxExamples) {
        autoExamples.push({
          key, msbtFile: entry.msbtFile, label: entry.label,
          original: entry.original, before: trans, after,
          kind: "auto", reasons,
        });
      }
    } else {
      needsReview++;
      byFile[entry.msbtFile] = (byFile[entry.msbtFile] || 0) + 1;
      if (reviewExamples.length < maxExamples) {
        reviewExamples.push({
          key, msbtFile: entry.msbtFile, label: entry.label,
          original: entry.original, before: trans, after: trans,
          kind: "review", reasons,
        });
      }
    }
  }

  return {
    scanned,
    autoFixable,
    needsReview,
    issueTotals,
    smartReorderable,
    byFile,
    autoExamples,
    reviewExamples,
    fixable: autoFixable,
  };
}

/**
 * يحسب التحديثات الفعليّة لتطبيق الإصلاح الآلي للرموز وفواصل الأسطر.
 * يُرجع `updates` (المفاتيح والقيم الجديدة) و`previous` (لاسترجاع التراجع).
 */
export function buildRestoreUpdates(
  entries: { msbtFile: string; index: number; original: string }[],
  translations: Record<string, string>,
): { updates: Record<string, string>; previous: Record<string, string> } {
  const updates: Record<string, string> = {};
  const previous: Record<string, string> = {};
  for (const entry of entries) {
    const key = `${entry.msbtFile}:${entry.index}`;
    const trans = translations[key];
    if (!trans || !trans.trim()) continue;
    const after = restoreTagsAndLineBreaks(entry.original, trans);
    if (after !== trans) {
      updates[key] = after;
      previous[key] = trans;
    }
  }
  return { updates, previous };
}
