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
  missingTags: string[];
  extraTags: string[];
}

export function diffTechnicalTags(original: string, translation: string): TechnicalTagDiffResult {
  const originalCounts = buildTagCountMap(extractTechnicalTags(original));
  const translatedCounts = buildTagCountMap(extractTechnicalTags(translation));
  const missingTags = expandTagCountDiff(originalCounts, translatedCounts);
  const extraTags = expandTagCountDiff(translatedCounts, originalCounts);

  return {
    exactTagMatch: missingTags.length === 0 && extraTags.length === 0,
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

export function repairTranslationTagsForBuild(original: string, translation: string): BuildTagRepairResult {
  // Step 1: Fix corrupted $N variables first
  let working = repairDollarVars(original, translation);

  // Step 2: Restore technical tags
  const repairedText = extractTechnicalTags(original).length > 0
    ? restoreTagsLocally(original, working)
    : working;

  return {
    text: repairedText,
    changed: repairedText !== translation,
    exactTagMatch: hasExactTagMultiset(original, repairedText),
    missingClosingTags: hasMissingClosingTags(original, repairedText),
    missingControlOrPua: countRegexMatches(repairedText, BUILD_CONTROL_OR_PUA_REGEX) < countRegexMatches(original, BUILD_CONTROL_OR_PUA_REGEX),
  };
}