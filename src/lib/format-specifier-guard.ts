/**
 * Printf-style format specifier protection (%s, %d, %i, %f, %1$s, %.2f) —
 * shared by both Xenoblade and Risen, unlike the game-specific tag guards.
 * Same pattern the local (no-AI) tag-extractor report recognizes as
 * "percent_vars", and the one added to every AI-protection regex
 * (risen-tag-guard.ts, risen-tag-mask.ts, translate-entries's protectTags).
 *
 * Order matters for these in a way most bracket/curly tags don't: each
 * specifier marks a slot the game engine fills with a specific value at
 * runtime, so "%s has %i gold" -> "%i has %s gold" swaps which value lands
 * in which slot even though both strings contain the exact same specifiers
 * (a plain multiset/count diff would miss this entirely).
 */
const PERCENT_SPEC_REGEX = /%[\d.$-]*[sdif]/g;

/** Extracts printf-style specifiers from a string, in order of appearance. */
export function extractFormatSpecifiers(text: string): string[] {
  return [...(text || "").matchAll(new RegExp(PERCENT_SPEC_REGEX.source, PERCENT_SPEC_REGEX.flags))].map((m) => m[0]);
}

export interface FormatSpecifierDiffResult {
  /** Same specifiers, same count, but in a different sequence. */
  reordered: boolean;
  /** Present in the original but missing from the translation. */
  missing: string[];
  /** Present in the translation but not in the original. */
  extra: string[];
}

/** Compares format specifiers between an original and its translation:
 * count (missing/extra, like any other tag) AND sequence (reordered). */
export function diffFormatSpecifiers(original: string, translation: string): FormatSpecifierDiffResult {
  const origSpecs = extractFormatSpecifiers(original);
  const transSpecs = extractFormatSpecifiers(translation);

  const countMap = (list: string[]) => {
    const m = new Map<string, number>();
    for (const s of list) m.set(s, (m.get(s) || 0) + 1);
    return m;
  };
  const origCounts = countMap(origSpecs);
  const transCounts = countMap(transSpecs);
  const missing: string[] = [];
  for (const [spec, count] of origCounts) {
    const remaining = count - (transCounts.get(spec) || 0);
    for (let i = 0; i < remaining; i++) missing.push(spec);
  }
  const extra: string[] = [];
  for (const [spec, count] of transCounts) {
    const remaining = count - (origCounts.get(spec) || 0);
    for (let i = 0; i < remaining; i++) extra.push(spec);
  }

  // Reorder only makes sense to flag when the two lists are otherwise the
  // same multiset (no missing/extra) but the sequence still differs.
  const reordered = missing.length === 0 && extra.length === 0 && origSpecs.length > 0 && origSpecs.join('') !== transSpecs.join('');

  return { reordered, missing, extra };
}
