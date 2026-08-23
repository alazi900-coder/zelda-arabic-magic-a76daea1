/**
 * Mirrors src/lib/lumentale/lumentale-token-guard.ts for the Deno edge runtime.
 * The source and suggested translation must preserve this ordered sequence exactly.
 */
const TECHNICAL_TOKEN = /\{\d+(?:\.[A-Za-z_][\w.-]*)?\}|\{[A-Za-z_][\w.-]*\}|<\/?[A-Za-z][^>]*>|<\/>|\\[nrt]|\[(?:[A-Za-z_][A-Za-z0-9_]*(?::[^\]]+)?|[A-Za-z][\w.-]*=[^\]]+)\]|%(?:\d+\$)?[\d.$-]*[sdif]/g;

export function lumentaleTechnicalTokens(text: string): string[] {
  return text.match(TECHNICAL_TOKEN) ?? [];
}

export function preservesLumenTaleTechnicalTokenSequence(original: string, suggestion: string): boolean {
  const source = lumentaleTechnicalTokens(original);
  const target = lumentaleTechnicalTokens(suggestion);
  return source.length === target.length && source.every((token, index) => token === target[index]);
}
