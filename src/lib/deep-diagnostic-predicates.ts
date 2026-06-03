/**
 * Single source of truth for the 5 "deep diagnostic" filter predicates.
 * Both the counter (deepDiagnosticCounts) and the filter (filteredEntries)
 * MUST use these helpers so the dropdown badge count always matches the
 * filtered list length.
 *
 * Each predicate takes the raw original + raw translation strings and
 * returns true when the entry exhibits that issue.
 *
 * Convention: callers must verify `isTranslated` (translation.trim() !== '')
 * BEFORE calling these — except identicalOriginal which handles it itself.
 */

const RE_XENO_N_NO_NEWLINE = /\[XENO:n\s*\](?!\n)/;
const enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

function utf8Len(s: string): number {
  return enc ? enc.encode(s).length : s.length;
}

function countNewlines(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

export const deepDiagPredicates = {
  /** [XENO:n ] tag not followed by an actual \n linebreak */
  xenoNMissing(_original: string, translation: string): boolean {
    return RE_XENO_N_NO_NEWLINE.test(translation);
  },

  /** Translation has 3+ more linebreaks than the original */
  excessiveLines(original: string, translation: string): boolean {
    return countNewlines(translation) >= countNewlines(original) + 3;
  },

  /** Translation byte size > 2x original (only when original > 10 bytes) */
  byteBudget(original: string, translation: string): boolean {
    const ob = utf8Len(original);
    return ob > 10 && utf8Len(translation) > ob * 2;
  },

  /** Linebreak count differs by ≥ 2 between original and translation */
  newlineDiff(original: string, translation: string): boolean {
    const o = countNewlines(original);
    if (o === 0) return false;
    const t = countNewlines(translation);
    return Math.abs(t - o) >= 2;
  },

  /** Translation is identical to original (untranslated, length > 6) */
  identicalOriginal(original: string, translation: string): boolean {
    const t = translation.trim();
    if (t.length <= 6) return false;
    return t === original.trim();
  },
};

export type DeepDiagFilterId =
  | "xeno-n-missing"
  | "excessive-lines"
  | "byte-budget"
  | "newline-diff"
  | "identical-original";

/** Test whether an entry matches a deep-diag filter id (handles isTranslated guard). */
export function matchesDeepDiagFilter(
  filterId: DeepDiagFilterId,
  original: string,
  translation: string,
): boolean {
  const isTranslated = translation.trim() !== "";
  if (!isTranslated) return false;
  switch (filterId) {
    case "xeno-n-missing": return deepDiagPredicates.xenoNMissing(original, translation);
    case "excessive-lines": return deepDiagPredicates.excessiveLines(original, translation);
    case "byte-budget": return deepDiagPredicates.byteBudget(original, translation);
    case "newline-diff": return deepDiagPredicates.newlineDiff(original, translation);
    case "identical-original": return deepDiagPredicates.identicalOriginal(original, translation);
  }
}
