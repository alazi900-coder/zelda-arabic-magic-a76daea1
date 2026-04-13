import { restoreTagsLocally } from "@/lib/xc3-tag-restoration";

const BUILD_TECH_TAG_REGEX = /[\uFFF9-\uFFFC]|[\uE000-\uE0FF]+|\d+\s*\\?\[\s*\w+\s*:[^\]]*?\\?\]|\\?\[\s*\w+\s*:[^\]]*?\\?\]\s*\d+|\d+\s*\\?\[[A-Z]{2,10}\\?\]|\\?\[[A-Z]{2,10}\\?\]\s*\d+|\\?\[\s*\/?\s*\w+\s*:[^\]]*?\\?\]|\\?\[\s*[A-Za-z][A-Za-z0-9]*(?:[ '\/-]+[A-Za-z0-9]+)*\s*\\?\]|\[\s*\w+\s*=\s*\w[^\]]*\]|\{\s*\w+\s*:\s*\w[^}]*\}|\{[\w]+\}/g;
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

function hasExactTagMultiset(original: string, translation: string): boolean {
  const originalTags = extractTechnicalTags(original);
  const translatedTags = extractTechnicalTags(translation);

  if (originalTags.length !== translatedTags.length) {
    return false;
  }

  const originalCounts = buildTagCountMap(originalTags);
  const translatedCounts = buildTagCountMap(translatedTags);

  if (originalCounts.size !== translatedCounts.size) {
    return false;
  }

  for (const [tag, count] of originalCounts) {
    if ((translatedCounts.get(tag) || 0) !== count) {
      return false;
    }
  }

  return true;
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

export function repairTranslationTagsForBuild(original: string, translation: string): BuildTagRepairResult {
  const repairedText = extractTechnicalTags(original).length > 0
    ? restoreTagsLocally(original, translation)
    : translation;

  return {
    text: repairedText,
    changed: repairedText !== translation,
    exactTagMatch: hasExactTagMultiset(original, repairedText),
    missingClosingTags: hasMissingClosingTags(original, repairedText),
    missingControlOrPua: countRegexMatches(repairedText, BUILD_CONTROL_OR_PUA_REGEX) < countRegexMatches(original, BUILD_CONTROL_OR_PUA_REGEX),
  };
}