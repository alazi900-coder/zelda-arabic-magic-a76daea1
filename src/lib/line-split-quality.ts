// =============================================================================
// فحص جودة تقسيم الأسطر للترجمة العربية مقارنةً بالنصّ الإنجليزي الأصلي.
// محلّي بالكامل، بدون شبكة. يُعطي «درجة سوء» 0..100 + أسباب + اقتراح تقسيم أفضل.
// =============================================================================

const TAG_REGEX = /[\uFFF9-\uFFFC\uE000-\uE0FF]|\[\s*(?:XENO|System|ML)\s*:[^\]]*\]/gi;

/** كلمات/حروف لا يصحّ أن يبدأ بها سطر جديد في العربية. */
const NO_START_TOKENS = new Set([
  "و", "ف", "ل", "ب", "ك",
  "في", "من", "إلى", "الى", "على", "عن", "مع", "حتى", "لكن", "لكنّ", "أو", "أم",
  "ثم", "ثمّ", "إذ", "إذا", "إذن", "كي", "بل", "لا", "ما", "لم", "لن", "قد", "لو",
  "هذا", "هذه", "هؤلاء", "ذلك", "تلك",
  "إنّ", "إنّما", "إن", "ربّما", "ربما", "لعلّ", "لعل", "كأنّ", "كأن", "سوف",
  "إلّا", "إلا", "أيضاً", "أيضًا", "حيث", "عند", "عندما", "بينما", "رغم", "بَيْد", "بيد",
]);

/** علامات ترقيم تنتهي بها الجمل عادةً. */
const SENTENCE_END = /[.!?؟،,;:؛…]/;

const stripTags = (s: string): string => (s || "").replace(TAG_REGEX, "");
const splitLines = (s: string): string[] => (s || "").split(/\r?\n/);

const wordCount = (s: string): number => {
  const t = stripTags(s).trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
};

/** نسبة موقع كل `\n` داخل النصّ (تجاهل الرموز التقنية لتقدير الموقع المعنوي). */
function lineBreakRatios(s: string): number[] {
  const stripped = stripTags(s);
  const total = stripped.length;
  if (!total) return [];
  const out: number[] = [];
  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] === "\n") out.push(i / total);
  }
  return out;
}

export type LineSplitCause =
  | "line-count-mismatch"
  | "very-short-line"
  | "very-unbalanced"
  | "broken-phrase"
  | "drift-from-original-positions";

export interface LineSplitDiagnosis {
  score: number;
  causes: LineSplitCause[];
  reasons: string[];
  origLineCount: number;
  trLineCount: number;
}

export const CAUSE_LABEL_AR: Record<LineSplitCause, string> = {
  "line-count-mismatch": "عدد الأسطر مختلف",
  "very-short-line": "أسطر قصيرة جداً",
  "very-unbalanced": "أطوال غير متوازنة",
  "broken-phrase": "قطع في منتصف عبارة",
  "drift-from-original-positions": "مواقع بعيدة عن الأصل",
};

export function diagnoseLineSplit(originalEn: string, translation: string): LineSplitDiagnosis {
  const oLines = splitLines(originalEn).filter(l => l.trim().length > 0);
  const tLines = splitLines(translation).filter(l => l.trim().length > 0);
  const causes: LineSplitCause[] = [];
  const reasons: string[] = [];
  let score = 0;

  if (oLines.length > 1 && tLines.length !== oLines.length) {
    causes.push("line-count-mismatch");
    const diff = Math.abs(tLines.length - oLines.length);
    score += Math.min(50, 22 + diff * 14);
    reasons.push(`عدد الأسطر مختلف عن الأصل (${tLines.length} مقابل ${oLines.length})`);
  }

  if (tLines.length > 1) {
    let veryShort = 0;
    for (let i = 0; i < tLines.length; i++) {
      const tw = wordCount(tLines[i]);
      const ow = wordCount(oLines[i] ?? "");
      if (tw > 0 && tw <= 2 && ow >= 4) veryShort++;
      else if (tw === 1 && tLines.length > 2) veryShort++;
    }
    if (veryShort > 0) {
      causes.push("very-short-line");
      score += Math.min(30, veryShort * 14);
      reasons.push(`${veryShort} سطر قصير جداً (كلمة أو اثنتان)`);
    }
  }

  if (tLines.length > 1 && oLines.length > 0) {
    const oLens = oLines.map(l => stripTags(l).trim().length);
    const oAvg = (oLens.reduce((a, b) => a + b, 0) / oLens.length) || 1;
    let imbalanced = 0;
    for (const tl of tLines) {
      const tlen = stripTags(tl).trim().length;
      const ratio = tlen / oAvg;
      if (ratio < 0.35 || ratio > 2.2) imbalanced++;
    }
    if (imbalanced > 0) {
      causes.push("very-unbalanced");
      score += Math.min(25, imbalanced * 10);
      reasons.push(`أطوال الأسطر غير متوازنة (${imbalanced} سطر)`);
    }
  }

  if (tLines.length > 1) {
    let broken = 0;
    for (let i = 1; i < tLines.length; i++) {
      const prev = tLines[i - 1].trim();
      const cur = tLines[i].trim();
      if (!cur) continue;
      const firstWord = cur.split(/\s+/)[0]?.replace(/^[«»"'(]+/, "") || "";
      const startsBad = NO_START_TOKENS.has(firstWord);
      const lastChar = stripTags(prev).trim().slice(-1);
      const prevEndsCleanly = SENTENCE_END.test(lastChar);
      if (startsBad && !prevEndsCleanly) broken++;
      else if (!prevEndsCleanly && wordCount(prev) >= 6 && wordCount(cur) <= 3) broken++;
    }
    if (broken > 0) {
      causes.push("broken-phrase");
      score += Math.min(35, broken * 18);
      reasons.push(`قطع في منتصف عبارة مترابطة (${broken} موضع)`);
    }
  }

  if (oLines.length > 1 && tLines.length === oLines.length) {
    const oRatios = lineBreakRatios(originalEn);
    const tRatios = lineBreakRatios(translation);
    if (oRatios.length === tRatios.length && oRatios.length > 0) {
      let drift = 0;
      for (let i = 0; i < oRatios.length; i++) {
        if (Math.abs(oRatios[i] - tRatios[i]) > 0.18) drift++;
      }
      if (drift > 0) {
        causes.push("drift-from-original-positions");
        score += Math.min(20, drift * 10);
        reasons.push(`مواقع الفواصل بعيدة عن مواقع الأصل (${drift})`);
      }
    }
  }

  return {
    score: Math.min(100, Math.round(score)),
    causes,
    reasons,
    origLineCount: oLines.length,
    trLineCount: tLines.length,
  };
}

// -----------------------------------------------------------------------------
// اقتراح تقسيم محلّي
// -----------------------------------------------------------------------------

interface BreakCandidate {
  index: number;     // موقع الفاصل في النصّ الموحَّد (قبل الحرف)
  score: number;     // جودة الموضع: أعلى = أفضل
}

/** يجمع كل المسافات/علامات الترقيم الصالحة كمواضع كسر مرشَّحة. */
function findBreakCandidates(joined: string): BreakCandidate[] {
  const out: BreakCandidate[] = [];
  for (let i = 1; i < joined.length - 1; i++) {
    const ch = joined[i];
    const prev = joined[i - 1];
    const next = joined[i + 1];
    if (ch !== " ") continue;
    // لا نكسر إذا كانت الكلمة التالية ضمن «ممنوع البدء بها».
    const after = joined.slice(i + 1).trimStart();
    const nextWord = after.split(/\s+/)[0]?.replace(/^[«»"'(]+/, "") || "";
    if (NO_START_TOKENS.has(nextWord)) continue;

    let score = 1;
    if (SENTENCE_END.test(prev)) score += 25;            // بعد علامة ترقيم نهائية (مكافأة قوية)
    if (prev === "،" || prev === ",") score += 6;        // بعد فاصلة
    if (prev === "؛" || prev === ";") score += 10;       // بعد فاصلة منقوطة
    if (next === "«" || next === '"' || next === "(") score += 2;
    // كلمة محتوى قبل الكسر (4+ حروف غير مسافة) → كسر طبيعي بعد كلمة كاملة
    const wordBefore = joined.slice(0, i).split(" ").pop() || "";
    if (wordBefore.length >= 4) score += 2;
    // كلمة محتوى بعد الكسر → السطر التالي يبدأ بمضمون
    const wordAfterRaw = joined.slice(i + 1).split(" ")[0] || "";
    if (wordAfterRaw.length >= 4) score += 1;

    out.push({ index: i, score });
  }
  return out;
}

/** يختار أفضل مرشّح قريب من الموقع المستهدَف (نسبة من الطول). */
function pickBest(cands: BreakCandidate[], targetIdx: number, used: Set<number>, len: number): number | null {
  let best: BreakCandidate | null = null;
  let bestCost = Infinity;
  const window = Math.max(20, Math.round(len * 0.25));
  for (const c of cands) {
    if (used.has(c.index)) continue;
    const dist = Math.abs(c.index - targetIdx);
    if (dist > window) continue;
    // التكلفة = مسافة − علاوة الجودة. أصغر = أفضل.
    const cost = dist - c.score * 4;
    if (cost < bestCost) { bestCost = cost; best = c; }
  }
  return best ? best.index : null;
}

export function proposeBetterSplit(originalEn: string, translation: string): string {
  if (!translation?.trim()) return translation;
  const oLines = splitLines(originalEn).filter(l => l.trim().length > 0);

  // حافظ على الرموز كما هي. ابدأ بنصّ موحَّد بسطر واحد.
  const joined = translation.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!joined) return translation;

  if (oLines.length <= 1) {
    // الأصل سطر واحد → بدون فواصل.
    return joined;
  }

  const targetCount = oLines.length - 1; // عدد الفواصل المطلوبة
  const oLens = oLines.map(l => stripTags(l).trim().length);
  const oTotal = oLens.reduce((a, b) => a + b, 0) || 1;
  // مواقع الفواصل المستهدَفة كنسب تراكمية من طول الأصل.
  const ratios: number[] = [];
  let acc = 0;
  for (let i = 0; i < targetCount; i++) {
    acc += oLens[i];
    ratios.push(acc / oTotal);
  }

  const len = joined.length;
  const cands = findBreakCandidates(joined);
  const picked: number[] = [];
  const used = new Set<number>();
  for (const r of ratios) {
    const target = Math.round(r * len);
    const idx = pickBest(cands, target, used, len);
    if (idx != null) {
      picked.push(idx);
      used.add(idx);
    }
  }
  if (picked.length === 0) return translation;
  picked.sort((a, b) => a - b);

  // ابن النصّ مع \n بدل المسافة في المواضع المختارة.
  let out = "";
  let prev = 0;
  for (const i of picked) {
    out += joined.slice(prev, i) + "\n";
    prev = i + 1; // تجاوز المسافة
  }
  out += joined.slice(prev);
  return out.trim();
}

// -----------------------------------------------------------------------------
// مسح دفعيّ
// -----------------------------------------------------------------------------

export interface LineSplitEntryRef {
  msbtFile: string;
  index: number;
  label?: string;
  original: string;
}

export interface LineSplitIssue {
  key: string;
  msbtFile: string;
  index: number;
  label: string;
  original: string;
  current: string;
  proposed: string;
  diagnosis: LineSplitDiagnosis;
  difficulty: "easy" | "hard";
}

export interface LineSplitScanResult {
  scanned: number;
  flagged: number;
  issues: LineSplitIssue[];
}

/** الحدّ الأدنى لاعتبار التقسيم سيّئاً يستحق العرض في القائمة. */
export const SCORE_THRESHOLD = 25;

export function scanLineSplitQuality(
  entries: LineSplitEntryRef[],
  translations: Record<string, string>,
): LineSplitScanResult {
  const issues: LineSplitIssue[] = [];
  let scanned = 0;
  for (const e of entries) {
    const key = `${e.msbtFile}:${e.index}`;
    const tr = translations[key];
    if (!tr || !tr.trim()) continue;
    scanned++;
    const diag = diagnoseLineSplit(e.original, tr);
    if (diag.score < SCORE_THRESHOLD) continue;
    const proposed = proposeBetterSplit(e.original, tr);
    if (proposed === tr) {
      // لا نملك اقتراحاً مختلفاً → لا نعرضه إلا إذا الدرجة عالية جداً.
      if (diag.score < 50) continue;
    }
    // هل الاقتراح المحلي جيد بما يكفي؟
    const proposedDiag = proposed !== tr ? diagnoseLineSplit(e.original, proposed) : diag;
    const difficulty: "easy" | "hard" = (proposed !== tr && proposedDiag.score <= 22) ? "easy" : "hard";
    issues.push({
      key,
      msbtFile: e.msbtFile,
      index: e.index,
      label: e.label || "",
      original: e.original,
      current: tr,
      proposed,
      diagnosis: diag,
      difficulty,
    });
  }
  // الأسوأ أوّلاً
  issues.sort((a, b) => b.diagnosis.score - a.diagnosis.score);
  return { scanned, flagged: issues.length, issues };
}
