/**
 * LumenTale's runtime syntax is immutable translation data. This module has no
 * UnityFS dependency so it can be tested in isolation in browser and Node test
 * environments alike.
 */
const TECHNICAL_TOKEN = /\{\d+(?:\.[A-Za-z_][\w.-]*)?\}|\{[A-Za-z_][\w.-]*\}|<\/?[A-Za-z][^>]*>|<\/>|\\[nrt]|\[(?:[A-Za-z_][A-Za-z0-9_]*(?::[^\]]+)?|[A-Za-z][\w.-]*=[^\]]+)\]|%(?:\d+\$)?[\d.$-]*[sdif]/g;

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

export function validateLumenTaleTranslation(original: string, translation: string): string | null {
  const source = lumentaleTechnicalTokens(original);
  const target = lumentaleTechnicalTokens(translation);
  if (source.length !== target.length || source.some((token, index) => token !== target[index])) {
    return "الترجمة غيّرت رمزاً تقنياً أو وسم Unity. أعده بالترتيب نفسه كما في النص الأصلي.";
  }
  return null;
}
