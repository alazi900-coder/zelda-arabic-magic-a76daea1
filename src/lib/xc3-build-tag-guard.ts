import { restoreTagsLocally } from "@/lib/xc3-tag-restoration";

const BUILD_TECH_TAG_REGEX = /[\uFFF9-\uFFFC]|[\uE000-\uE0FF]+|\d+\s*\\?\[\s*\w+\s*:[^\]]*?\\?\]|\\?\[\s*\w+\s*:[^\]]*?\\?\]\s*\d+|\d+\s*\\?\[[A-Z]{2,10}\\?\]|\\?\[[A-Z]{2,10}\\?\]\s*\d+|\\?\[\s*\/?\s*\w+\s*:[^\]]*?\\?\]|\\?\[\s*[A-Za-z][A-Za-z0-9]*(?:[ '\/-]+[A-Za-z0-9]+)*\s*\\?\]|\[\s*\w+\s*=\s*\w[^\]]*\]|\{\s*\w+\s*:\s*\w[^}]*\}|\{[\w]+\}/g;

/**
 * Patterns for corrupted $N variable placeholders.
 * Matches: دولار1, دولار 1, 1.$, $.1, $. 1, 1 دولار, etc.
 */
const CORRUPTED_DOLLAR_PATTERNS: Array<{ regex: RegExp; extract: (m: RegExpMatchArray) => string }> = [
  // دولار1 or دولار 1 or دولار$1
  { regex: /دولار\s*\$?(\d+)/g, extract: (m) => `$${m[1]}` },
  // 1.$ or 1 .$ or 1.$. 
  { regex: /(\d+)\s*\.\s*\$/g, extract: (m) => `$${m[1]}` },
  // $.1 or $. 1
  { regex: /\$\s*\.\s*(\d+)/g, extract: (m) => `$${m[1]}` },
  // 1 دولار (number followed by دولار)
  { regex: /(\d+)\s+دولار/g, extract: (m) => `$${m[1]}` },
  // $1. (trailing dot after valid placeholder)
  { regex: /\$(\d+)\./g, extract: (m) => `$${m[1]}` },
];
const BUILD_CLOSING_TAG_REGEX = /\[\s*\/\s*\w+\s*:[^\]]*\]/g;
const BUILD_CONTROL_OR_PUA_REGEX = /[\uFFF9-\uFFFC\uE000-\uE0FF]/g;

function extractTechnicalTags(text: string): string[] {
  return [...text.matchAll(new RegExp(BUILD_TECH_TAG_REGEX.source, BUILD_TECH_TAG_REGEX.flags))].map((match) => match[0]);
}

function countRegexMatches(text: string, regex: RegExp): number {
  return (text.match(new RegExp(regex.source, regex.flags)) || []).length;
}

function buildTagCountMap(tags: string[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const tag of tags) {
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }

  return counts;
}

function expandTagCountDiff(source: Map<string, number>, target: Map<string, number>): string[] {
  const diff: string[] = [];

  for (const [tag, count] of source) {
    const remaining = count - (target.get(tag) || 0);
    for (let i = 0; i < remaining; i++) {
      diff.push(tag);
    }
  }

  return diff;
}

export interface TechnicalTagDiffResult {
  exactTagMatch: boolean;
  sequenceMatch: boolean;
  missingTags: string[];
  extraTags: string[];
}

/**
 * Check if the ordered sequence of technical tags in translation matches the original.
 * This catches cases where multiset is correct but order is flipped.
 */
export function checkTagSequenceMatch(original: string, translation: string): boolean {
  const origTags = extractTechnicalTags(original);
  const transTags = extractTechnicalTags(translation);
  if (origTags.length !== transTags.length) return false;
  for (let i = 0; i < origTags.length; i++) {
    if (origTags[i] !== transTags[i]) return false;
  }
  return true;
}

export function diffTechnicalTags(original: string, translation: string): TechnicalTagDiffResult {
  const origTags = extractTechnicalTags(original);
  const transTags = extractTechnicalTags(translation);
  const originalCounts = buildTagCountMap(origTags);
  const translatedCounts = buildTagCountMap(transTags);
  const missingTags = expandTagCountDiff(originalCounts, translatedCounts);
  const extraTags = expandTagCountDiff(translatedCounts, originalCounts);
  const exactTagMatch = missingTags.length === 0 && extraTags.length === 0;

  // Sequence check: even if multiset matches, order may be wrong
  let sequenceMatch = exactTagMatch;
  if (exactTagMatch && origTags.length > 0) {
    sequenceMatch = checkTagSequenceMatch(original, translation);
  }

  return {
    exactTagMatch,
    sequenceMatch,
    missingTags,
    extraTags,
  };
}

function hasExactTagMultiset(original: string, translation: string): boolean {
  return diffTechnicalTags(original, translation).exactTagMatch;
}

function hasMissingClosingTags(original: string, translation: string): boolean {
  const originalClosingTags = original.match(new RegExp(BUILD_CLOSING_TAG_REGEX.source, BUILD_CLOSING_TAG_REGEX.flags)) || [];
  return originalClosingTags.some((tag) => !translation.includes(tag));
}

export interface BuildTagRepairResult {
  text: string;
  changed: boolean;
  exactTagMatch: boolean;
  sequenceMatch: boolean;
  missingClosingTags: boolean;
  missingControlOrPua: boolean;
}

/**
 * Fix corrupted $N placeholders in translation by matching against original.
 * E.g. دولار1 → $1, 1.$ → $1
 */
function repairDollarVars(original: string, translation: string): string {
  // Extract $N placeholders from original
  const origVars = [...original.matchAll(/\$(\d+)/g)].map(m => m[0]);
  if (origVars.length === 0) return translation;

  let result = translation;

  // Fix each corrupted pattern
  for (const pattern of CORRUPTED_DOLLAR_PATTERNS) {
    result = result.replace(new RegExp(pattern.regex.source, pattern.regex.flags), (...args) => {
      const match = args as unknown as RegExpMatchArray;
      // Reconstruct $N
      const digits = args[1] as string;
      const fixed = `$${digits}`;
      // Only fix if this $N exists in original
      return origVars.includes(fixed) ? fixed : args[0];
    });
  }

  // Verify all original $N vars are present; if any missing, try to find close matches
  for (const v of origVars) {
    if (!result.includes(v)) {
      // Last resort: if the number exists standalone, prefix with $
      const num = v.slice(1);
      // Match standalone number not already preceded by $
      result = result.replace(new RegExp(`(?<!\\$)\\b${num}\\b`), v);
    }
  }

  return result;
}

/**
 * Reorder tags in translation to match the sequence in original.
 * Only works when multiset matches (same tags, wrong order).
 *
 * STRATEGY: Replace each tag occurrence in the translation, in order, with the
 * tag that should appear at that position in the original. This preserves all
 * surrounding text (including \n) exactly as the translator wrote it.
 *
 * SAFETY: After reordering, every [XENO:n ] is force-followed by \n if missing,
 * preventing the cinematic-freeze bug from orphaned line-break tags.
 */
function reorderTagsToMatchOriginal(original: string, translation: string): string {
  const tagRegex = new RegExp(BUILD_TECH_TAG_REGEX.source, BUILD_TECH_TAG_REGEX.flags);
  const origTags = [...original.matchAll(tagRegex)].map(m => m[0]);
  const transTagMatches = [...translation.matchAll(tagRegex)];
  const transTags = transTagMatches.map(m => m[0]);

  // Only reorder if same multiset but different order
  if (origTags.length === 0 || origTags.length !== transTags.length) return translation;
  const origSorted = [...origTags].sort().join('|');
  const transSorted = [...transTags].sort().join('|');
  if (origSorted !== transSorted) return translation;

  // Already in correct order?
  let alreadyCorrect = true;
  for (let i = 0; i < origTags.length; i++) {
    if (origTags[i] !== transTags[i]) { alreadyCorrect = false; break; }
  }
  if (alreadyCorrect) return ensureXenoNNewlines(translation);

  // Replace each tag in the translation, in order, with the tag at the matching index in original
  let result = '';
  let cursor = 0;
  for (let i = 0; i < transTagMatches.length; i++) {
    const m = transTagMatches[i];
    result += translation.slice(cursor, m.index!);
    result += origTags[i];
    cursor = m.index! + m[0].length;
  }
  result += translation.slice(cursor);

  // Final safety pass: ensure every [XENO:n ] is followed by \n
  return ensureXenoNNewlines(result);
}

/** Force every [XENO:n ] in the text to be followed by a newline char. */
function ensureXenoNNewlines(text: string): string {
  return text.replace(/(\[XENO:n\s*\])(?!\n)/g, '$1\n');
}

/**
 * Clean up artifacts created by reordering:
 * - Collapse 3+ consecutive newlines to 2 (max one blank line)
 * - Remove blank lines that the original didn't have
 * - Trim trailing spaces on each line
 * - Remove spaces immediately before/after [XENO:n ]\n boundary
 */
function normalizeWhitespaceAfterReorder(text: string, original: string): string {
  let result = text;
  // Trim trailing spaces on each line
  result = result.replace(/[ \t]+\n/g, '\n');
  // Remove leading spaces after newline that came from tag movement
  result = result.replace(/\n[ \t]+/g, '\n');
  // Collapse 3+ newlines into 2
  result = result.replace(/\n{3,}/g, '\n\n');

  // If original has no blank lines (no \n\n), strip them from result too
  if (!/\n\s*\n/.test(original)) {
    result = result.replace(/\n\s*\n/g, '\n');
  }
  // Collapse runs of spaces (but not newlines) to single space
  result = result.replace(/[ \t]{2,}/g, ' ');
  return result;
}

export function repairTranslationTagsForBuild(original: string, translation: string): BuildTagRepairResult {
  // Step 1: Fix corrupted $N variables first
  let working = repairDollarVars(original, translation);

  // Step 2: Restore technical tags
  let repairedText = extractTechnicalTags(original).length > 0
    ? restoreTagsLocally(original, working)
    : working;

  // Step 3: If tags are present but in wrong order, reorder to match original
  const diffBefore = diffTechnicalTags(original, repairedText);
  if (diffBefore.exactTagMatch && !diffBefore.sequenceMatch) {
    repairedText = reorderTagsToMatchOriginal(original, repairedText);
  }

  // Step 4: Final safety pass — original [XENO:n] is always followed by \n in well-formed XC3 text.
  // If our pipeline lost that newline, restore it to prevent cinematic freezes.
  if (/\[XENO:n\s*\]\n/.test(original)) {
    repairedText = repairedText.replace(/(\[XENO:n\s*\])(?!\n)/g, '$1\n');
  }

  const diff = diffTechnicalTags(original, repairedText);

  return {
    text: repairedText,
    changed: repairedText !== translation,
    exactTagMatch: diff.exactTagMatch,
    sequenceMatch: diff.sequenceMatch,
    missingClosingTags: hasMissingClosingTags(original, repairedText),
    missingControlOrPua: countRegexMatches(repairedText, BUILD_CONTROL_OR_PUA_REGEX) < countRegexMatches(original, BUILD_CONTROL_OR_PUA_REGEX),
  };
}