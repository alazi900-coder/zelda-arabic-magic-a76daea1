/**
 * LumenTale's runtime syntax is immutable translation data. This module has no
 * UnityFS dependency so it can be tested in isolation in browser and Node test
 * environments alike.
 */
const TECHNICAL_TOKEN = /\{\d+(?:\.[A-Za-z_][\w.-]*)?\}|\{[A-Za-z_][\w.-]*\}|<\/?[A-Za-z][^>]*>|<\/?>|\\[nrt]|\[(?:[A-Za-z_][A-Za-z0-9_]*(?::[^\]]+)?|[A-Za-z][\w.-]*=[^\]]+)\]|%(?:\d+\$)?[\d.$-]*[sdif]/g;

export interface LumenTaleTokenComparison {
  source: string[];
  translation: string[];
  missing: string[];
  unexpected: string[];
  reordered: boolean;
  valid: boolean;
}

export function lumentaleTechnicalTokens(text: string): string[] {
  return text.match(TECHNICAL_TOKEN) ?? [];
}

/**
 * Replaces exactly the technical-token sequence governed by this module.
 * Build-time Arabic shaping uses it to move immutable runtime syntax out of
 * the BiDi transformation, then restores the source-order sequence verbatim.
 */
export function replaceLumenTaleTechnicalTokens(
  text: string,
  replacer: (token: string) => string,
): string {
  return text.replace(new RegExp(TECHNICAL_TOKEN.source, "g"), replacer);
}

function tokenCountDifference(expected: string[], actual: string[]): string[] {
  const remaining = new Map<string, number>();
  actual.forEach((token) => remaining.set(token, (remaining.get(token) ?? 0) + 1));

  return expected.filter((token) => {
    const count = remaining.get(token) ?? 0;
    if (count < 1) return true;
    remaining.set(token, count - 1);
    return false;
  });
}

/**
 * Compares the immutable runtime token contract without modifying either text.
 * Equal token counts are insufficient: their original order is also part of
 * LumenTale's serialized string contract.
 */
export function compareLumenTaleTechnicalTokens(
  original: string,
  translation: string,
): LumenTaleTokenComparison {
  const source = lumentaleTechnicalTokens(original);
  const target = lumentaleTechnicalTokens(translation);
  const missing = tokenCountDifference(source, target);
  const unexpected = tokenCountDifference(target, source);
  const reordered = missing.length === 0
    && unexpected.length === 0
    && source.some((token, index) => token !== target[index]);

  return {
    source,
    translation: target,
    missing,
    unexpected,
    reordered,
    valid: missing.length === 0 && unexpected.length === 0 && !reordered,
  };
}

export function describeLumenTaleTokenDifference(comparison: LumenTaleTokenComparison): string {
  if (comparison.valid) return "الوسوم التقنية مطابقة للأصل.";

  const details: string[] = [];
  if (comparison.missing.length) details.push(`وسوم مفقودة: ${comparison.missing.join("، ")}`);
  if (comparison.unexpected.length) details.push(`وسوم زائدة أو متغيرة: ${comparison.unexpected.join("، ")}`);
  if (comparison.reordered) details.push("ترتيب الوسوم تغيّر");
  return details.join(". ");
}

export function validateLumenTaleTranslation(original: string, translation: string): string | null {
  const comparison = compareLumenTaleTechnicalTokens(original, translation);
  if (!comparison.valid) {
    return `الترجمة غيّرت رمزاً تقنياً أو وسم Unity. ${describeLumenTaleTokenDifference(comparison)}. أعده بالترتيب نفسه كما في النص الأصلي.`;
  }
  return null;
}
