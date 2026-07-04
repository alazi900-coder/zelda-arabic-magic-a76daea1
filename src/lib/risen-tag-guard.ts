// Risen 1 technical-tag protection — separate from the xc3-* build-tag-guard
// modules on purpose: those are tuned for Xenoblade Chronicles engine quirks
// (RLM/LRI BiDi isolation, [XENO:n] hard-line-break semantics, $N dollar-var
// repair) that don't apply to Risen's Genome engine. This module only covers
// Risen's own confirmed tag formats and stays deliberately simple.
//
// Confirmed real formats (from actual extracted Risen 1 strings):
//   - Button/UI tags:      <Exit>, <MeleeWeapon>, ... (17 confirmed)
//   - Parenthesized vars:  $(name), $(value), $(day), $(hour), $(minute)
//   - Bare engine tokens:  XXX, SGN, SGT, SGPT, SGL — no brackets at all,
//     found in hud2.tab (save-screen text). Matched as whole words only.
//   - Duration template:   "MM minutes, HH hours, DD days" — MM/HH/DD are
//     only tags in that exact context; matched via lookahead on the unit
//     word so ordinary dialogue never false-positives.
const RISEN_TAG_REGEX =
  /<[A-Za-z][A-Za-z0-9_]{0,30}>|\$\([A-Za-z0-9_]{1,30}\)|\b(?:XXX|SGN|SGT|SGPT|SGL)\b|\bMM\b(?=\s*minutes)|\bHH\b(?=\s*hours)|\bDD\b(?=\s*days)/g;

export function extractRisenTags(text: string): string[] {
  return [...(text || "").matchAll(new RegExp(RISEN_TAG_REGEX.source, RISEN_TAG_REGEX.flags))].map((m) => m[0]);
}

export function hasRisenTags(text: string): boolean {
  return extractRisenTags(text).length > 0;
}

function buildCountMap(tags: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tags) counts.set(t, (counts.get(t) || 0) + 1);
  return counts;
}

function diffCounts(source: Map<string, number>, target: Map<string, number>): string[] {
  const diff: string[] = [];
  for (const [tag, count] of source) {
    const remaining = count - (target.get(tag) || 0);
    for (let i = 0; i < remaining; i++) diff.push(tag);
  }
  return diff;
}

export interface RisenTagDiffResult {
  exactTagMatch: boolean;
  missingTags: string[];
  extraTags: string[];
}

export function diffRisenTags(original: string, translation: string): RisenTagDiffResult {
  const origTags = extractRisenTags(original);
  const transTags = extractRisenTags(translation);
  const originalCounts = buildCountMap(origTags);
  const translatedCounts = buildCountMap(transTags);
  const missingTags = diffCounts(originalCounts, translatedCounts);
  const extraTags = diffCounts(translatedCounts, originalCounts);
  return { exactTagMatch: missingTags.length === 0 && extraTags.length === 0, missingTags, extraTags };
}

export interface RisenTagRepairResult {
  text: string;
  changed: boolean;
  /** True whenever a tag had to be appended — the translator likely rendered
   * the tag as a translated word (e.g. <Exit> → "خروج") instead of preserving
   * it. We never try to locate/delete that word (too risky a guess), so the
   * entry should be flagged for a human to review and clean up if needed. */
  needsReview: boolean;
}

/**
 * Safe repair: append any missing tag(s) to the end of the translation.
 * Never attempts to locate or delete a word that may stand in for a lost tag.
 */
export function restoreRisenTags(original: string, translation: string): RisenTagRepairResult {
  const { missingTags } = diffRisenTags(original, translation);
  if (missingTags.length === 0) {
    return { text: translation, changed: false, needsReview: false };
  }
  const text = `${translation.trimEnd()} ${missingTags.join(" ")}`.trim();
  return { text, changed: true, needsReview: true };
}
