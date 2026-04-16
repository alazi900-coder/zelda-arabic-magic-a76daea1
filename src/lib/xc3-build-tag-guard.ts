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
 * SAFETY: [XENO:n ] followed by \n is treated as one atomic unit and never split.
 * This prevents game freezes caused by orphaned line-break tags.
 */
function reorderTagsToMatchOriginal(original: string, translation: string): string {
  const tagRegex = new RegExp(BUILD_TECH_TAG_REGEX.source, BUILD_TECH_TAG_REGEX.flags);
  const origTags = [...original.matchAll(tagRegex)].map(m => m[0]);
  const transTags = [...translation.matchAll(tagRegex)].map(m => m[0]);

  // Only reorder if same multiset but different order
  if (origTags.length === 0 || origTags.length !== transTags.length) return translation;
  const origSorted = [...origTags].sort().join('|');
  const transSorted = [...transTags].sort().join('|');
  if (origSorted !== transSorted) return translation;

  // Check if already in correct order
  let alreadyCorrect = true;
  for (let i = 0; i < origTags.length; i++) {
    if (origTags[i] !== transTags[i]) { alreadyCorrect = false; break; }
  }
  if (alreadyCorrect) return translation;

  // Build a list of "tokens": either a tag (or atomic [XENO:n]\n unit) or a text chunk
  // We strip all tags+(their following \n if XENO:n) from translation,
  // then re-insert them in original order at proportional positions.
  const XENO_N = /^\[XENO:n\s*\]$/;
  const isXenoN = (t: string) => XENO_N.test(t);

  // Split translation into [text segments, tags] preserving order
  const transTagMatches = [...translation.matchAll(tagRegex)];
  const transSegments: string[] = [];
  let cursor = 0;
  for (const m of transTagMatches) {
    transSegments.push(translation.slice(cursor, m.index!));
    cursor = m.index! + m[0].length;
    // If this is [XENO:n] and next char is \n, swallow the \n into the tag-unit
    if (isXenoN(m[0]) && translation[cursor] === '\n') {
      cursor++;
    }
  }
  const trailingText = translation.slice(cursor);
  const transText = transSegments.join('') + trailingText;
  const transLen = transText.length;

  if (transLen === 0) {
    // No text content, just return tags in original order with \n preserved after XENO:n
    return origTags.map(t => isXenoN(t) ? t + '\n' : t).join('');
  }

  // Calculate where each tag sits proportionally in the original (text chars only)
  const origTextOnly = original.replace(tagRegex, '').length;
  const origTagMatches = [...original.matchAll(tagRegex)];
  interface TagSlot { tag: string; relPos: number; followedByNewline: boolean }
  const slots: TagSlot[] = [];
  let origTextSoFar = 0;
  let prevEnd = 0;
  for (const m of origTagMatches) {
    origTextSoFar += original.slice(prevEnd, m.index!).length;
    const followedByNewline = isXenoN(m[0]) && original[m.index! + m[0].length] === '\n';
    slots.push({
      tag: m[0],
      relPos: origTextOnly > 0 ? origTextSoFar / origTextOnly : slots.length / origTagMatches.length,
      followedByNewline,
    });
    prevEnd = m.index! + m[0].length + (followedByNewline ? 1 : 0);
  }

  // Build result: insert tags (as atomic units) at proportional positions
  let result = '';
  let inserted = 0;
  for (let ci = 0; ci <= transLen; ci++) {
    while (inserted < slots.length) {
      const targetPos = slots[inserted].relPos * transLen;
      if (ci >= Math.round(targetPos)) {
        result += slots[inserted].tag;
        if (slots[inserted].followedByNewline) result += '\n';
        inserted++;
      } else break;
    }
    if (ci < transLen) result += transText[ci];
  }
  while (inserted < slots.length) {
    result += slots[inserted].tag;
    if (slots[inserted].followedByNewline) result += '\n';
    inserted++;
  }

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