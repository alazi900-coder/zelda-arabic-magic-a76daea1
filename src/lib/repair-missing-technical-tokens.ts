/**
 * Non-destructive repair for a translation with missing technical tokens.
 *
 * Token identities AND their ordered positions come from the original English
 * string. Existing tokens are kept exactly where the translator put them.
 * Missing tokens are inserted at the source-relative word boundary between
 * the nearest surviving anchors. Arabic prose, spacing and punctuation are
 * never rewritten or replaced with English.
 *
 * Source and translated grammar can differ, so an inferred interior position
 * is a best-effort estimate. Callers must show the before/after preview.
 * Ambiguous alignment, foreign tags and broken tags require manual review.
 */
import { diffTechnicalTags, getBuildTechnicalTagMatches } from "@/lib/xc3-build-tag-guard";

interface TokenMatch {
  token: string;
  start: number;
  end: number;
}
export interface PreserveArabicRepair {
  text: string;
  changed: boolean;
  safe: boolean;
  needsReview: boolean;
  reason: string;
  inserted: string[];
}

function withoutTags(text: string): string {
  let out = "";
  let cursor = 0;
  for (const t of getBuildTechnicalTagMatches(text)) {
    out += text.slice(cursor, t.start);
    cursor = t.end;
  }
  return out + text.slice(cursor);
}

function insertionBoundary(text: string, start: number, end: number, ratio: number): number {
  if (start >= end || ratio <= 0) return start;
  if (ratio >= 1) return end;
  const boundaries = [start];
  const piece = text.slice(start, end);
  for (const m of piece.matchAll(/\s+/g)) {
    boundaries.push(start + m.index! + m[0].length);
  }
  boundaries.push(end);
  const ideal = start + ratio * (end - start);
  return boundaries.reduce((best, at) =>
    Math.abs(at - ideal) < Math.abs(best - ideal) ? at : best, boundaries[0]);
}

/** Reinsert absent original tokens without ever replacing translated prose. */
export function repairMissingTechnicalTokens(original: string, translation: string): PreserveArabicRepair {
  const unchanged = (reason: string): PreserveArabicRepair => ({
    text: translation, changed: false, safe: false, needsReview: true, reason, inserted: [],
  });
  if (!original || !translation.trim()) return unchanged("النص الأصلي أو الترجمة فارغ");
  const source = getBuildTechnicalTagMatches(original);
  const target = getBuildTechnicalTagMatches(translation);
  if (source.length === 0) return unchanged("لا توجد وسوم تقنية في الأصل");

  // Never silently remove or reinterpret a foreign/malformed translated token.
  const diff = diffTechnicalTags(original, translation);
  if (diff.extraTags.length > 0) {
    return unchanged("توجد وسوم زائدة أو مختلفة؛ تحتاج مراجعة يدوية بدل التخمين");
  }
  if (diff.missingTags.length === 0) {
    return unchanged(diff.sequenceMatch ? "الوسوم الأصلية موجودة بالفعل" : "ترتيب الوسوم مختلف؛ لا يُعاد توزيع الكلمات آليًا");
  }

  // Find an order-preserving alignment for the surviving source tokens.
  const left: number[] = [];
  let index = 0;
  for (const token of target) {
    while (index < source.length && source[index].token !== token.token) index++;
    if (index === source.length) return unchanged("ترتيب الوسوم الموجودة لا يطابق الأصل");
    left.push(index++);
  }
  const right = new Array<number>(target.length);
  index = source.length - 1;
  for (let i = target.length - 1; i >= 0; i--) {
    while (index >= 0 && source[index].token !== target[i].token) index--;
    if (index < 0) return unchanged("لم يتطابق تسلسل الوسوم");
    right[i] = index--;
  }
  if (left.some((item, i) => item !== right[i])) {
    return unchanged("وسوم متكررة تجعل موقع الرمز الناقص ملتبسًا");
  }

  const sourceToTarget = new Map<number, number>();
  for (let i = 0; i < left.length; i++) sourceToTarget.set(left[i], i);
  const insertions: { at: number; token: string; order: number }[] = [];

  for (let i = 0; i < source.length; i++) {
    if (sourceToTarget.has(i)) continue;
    let prev = i - 1;
    while (prev >= 0 && !sourceToTarget.has(prev)) prev--;
    let next = i + 1;
    while (next < source.length && !sourceToTarget.has(next)) next++;

    const sourceStart = prev >= 0 ? source[prev].end : 0;
    const sourceEnd = next < source.length ? source[next].start : original.length;
    const transStart = prev >= 0 ? target[sourceToTarget.get(prev)!].end : 0;
    const transEnd = next < source.length ? target[sourceToTarget.get(next)!].start : translation.length;
    if (transStart > transEnd) return unchanged("المراسي التقنية لا تحافظ على ترتيب الأصل");

    // Strip missing source tags when estimating the corresponding plain-text
    // position; otherwise long tag names dominate where the break is placed.
    const sourcePlain = withoutTags(original.slice(sourceStart, sourceEnd));
    const beforePlain = withoutTags(original.slice(sourceStart, source[i].start));
    const ratio = sourcePlain.length > 0
      ? beforePlain.length / sourcePlain.length
      : (i - prev) / (next - prev);
    const at = insertionBoundary(translation, transStart, transEnd, ratio);
    insertions.push({ at, token: source[i].token, order: i });
  }

  // Descending insert positions; reverse original index for equal positions so
  // source order is maintained when several tags are missing together.
  insertions.sort((a, b) => b.at - a.at || b.order - a.order);
  let output = translation;
  for (const item of insertions) {
    output = output.slice(0, item.at) + item.token + output.slice(item.at);
  }

  const finalDiff = diffTechnicalTags(original, output);
  if (!finalDiff.exactTagMatch || !finalDiff.sequenceMatch ||
      withoutTags(output) !== withoutTags(translation)) {
    return unchanged("لم يجتز الإصلاح فحص ترتيب الرموز وحفظ النص العربي");
  }
  return {
    text: output, changed: output !== translation, safe: true, needsReview: true,
    reason: "أُعيدت الرموز الناقصة وفق مواضعها النسبية في الأصل؛ راجع موقعها داخل الجملة العربية",
    inserted: insertions.sort((a, b) => a.order - b.order).map((i) => i.token),
  };
}
