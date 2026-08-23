/**
 * LumenTale's runtime syntax is immutable translation data. This module has no
 * UnityFS dependency so it can be tested in isolation in browser and Node test
 * environments alike.
 */
const TECHNICAL_TOKEN = /\{\d+(?:\.[A-Za-z_][\w.-]*)?\}|\{[A-Za-z_][\w.-]*\}|<\/?[A-Za-z][^>]*>|<\/\>|\\[nrt]|\[(?:[A-Za-z_][A-Za-z0-9_]*(?::[^\]]+)?|[A-Za-z][\w.-]*=[^\]]+)\]|%(?:\d+\$)?[\d.$-]*[sdif]/g;

export function lumentaleTechnicalTokens(text: string): string[] {
  return text.match(TECHNICAL_TOKEN) ?? [];
}

export function validateLumenTaleTranslation(original: string, translation: string): string | null {
  const source = lumentaleTechnicalTokens(original);
  const target = lumentaleTechnicalTokens(translation);
  if (source.length !== target.length || source.some((token, index) => token !== target[index])) {
    return "الترجمة غيّرت رمزاً تقنياً أو وسم Unity. أعده بالترتيب نفسه كما في النص الأصلي.";
  }
  return null;
}
