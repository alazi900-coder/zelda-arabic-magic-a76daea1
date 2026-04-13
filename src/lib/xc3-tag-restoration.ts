/**
 * XC3 Tag Restoration System
 * Restores missing control characters AND multi-char technical tags
 * from original text into translations.
 * Handles: missing tags, translated tags, reversed brackets, damaged tags.
 */

import { fixTagBracketsStrict } from './tag-bracket-fix';

/** Unified regex matching ALL technical tag formats */
const TAG_REGEX = /[\uFFF9-\uFFFC]|[\uE000-\uE0FF]+|\d+\s*\\?\[\s*\w+\s*:[^\]]*?\\?\]|\\?\[\s*\w+\s*:[^\]]*?\\?\]\s*\d+|\d+\s*\\?\[[A-Z]{2,10}\\?\]|\\?\[[A-Z]{2,10}\\?\]\s*\d+|\\?\[\s*\/?\s*\w+\s*:[^\]]*?\\?\]|\\?\[\s*[A-Za-z][A-Za-z0-9]*(?:[ '\/-]+[A-Za-z0-9]+)*\s*\\?\]|\[\s*\w+\s*=\s*\w[^\]]*\]|\{\s*\w+\s*:\s*\w[^}]*\}|\{[\w]+\}/g;

/** Regex to detect Arabic text inside bracket-like tag structures (translated tags) */
const TRANSLATED_TAG_REGEX = /\\?\[[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF][\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF0-9\s\-\/]*\\?\]|\\\[[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF][\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF0-9\s\-\/]*\\\]/g;

/** Regex to detect N[ArabicTag] or [ArabicTag]N patterns */
const TRANSLATED_NUM_TAG_REGEX = /\d+\s*\\?\[[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF0-9\s:\-\/]+\\?\]|\\?\[[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF0-9\s:\-\/]+\\?\]\s*\d+/g;

/** Regex for {ArabicTag} translated brace tags */
const TRANSLATED_BRACE_TAG_REGEX = /\{[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\s:]+\}/g;
const ARABIC_CHAR_REGEX = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const ARABIC_FRAGMENT_REGEX = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\s]+/g;

/**
 * Extract all technical tag tokens from text (as ordered array of strings).
 */
function extractTags(text: string): string[] {
  return [...text.matchAll(new RegExp(TAG_REGEX.source, TAG_REGEX.flags))].map(m => m[0]);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strip invisible Unicode chars that break tag matching
 */
function stripInvisible(text: string): string {
  return text.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');
}

function extractBracketInner(tag: string): string | null {
  if (!/^\\?\[/.test(tag) || !/\\?\]$/.test(tag)) return null;
  return tag.replace(/^\\?\[/, '').replace(/\\?\]$/, '');
}

function extractArabicFragment(text: string): string {
  return (text.match(ARABIC_FRAGMENT_REGEX) || []).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Repair hybrid corruptions like:
 * - [اثناء الضغط مطولاًML:icon icon=btn_zl ]
 * - مرحلةML:number digit=2 ]
 * by moving Arabic text outside the tag and restoring the exact original tag.
 */
function normalizeCorruptedEmbeddedTags(text: string, origTags: string[]): string {
  if (origTags.length === 0) return text;

  let result = text;

  for (const tag of origTags) {
    const inner = extractBracketInner(tag);
    if (!inner) continue;

    const innerEsc = escapeRegex(inner);

    const wrappedCorruption = new RegExp(`\\\\?\\[([^\\]\\n]{0,120}?)${innerEsc}([^\\]\\n]{0,120}?)\\\\?\\]`, 'g');
    result = result.replace(wrappedCorruption, (match, before = '', after = '') => {
      if (match === tag) return match;
      if (!ARABIC_CHAR_REGEX.test(`${before}${after}`)) return match;

      const prefix = extractArabicFragment(before);
      const suffix = extractArabicFragment(after);
      return [prefix, tag, suffix].filter(Boolean).join(' ');
    });

    const missingOpening = new RegExp(`([\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFDFF\\uFE70-\\uFEFF\\s]{1,120})${innerEsc}\\\\?\\]`, 'g');
    result = result.replace(missingOpening, (match, prefix = '') => {
      const cleanPrefix = extractArabicFragment(prefix);
      if (!cleanPrefix) return match;
      return `${cleanPrefix} ${tag}`;
    });

    const missingClosing = new RegExp(`\\\\?\\[${innerEsc}([\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFDFF\\uFE70-\\uFEFF\\s]{1,120})`, 'g');
    result = result.replace(missingClosing, (match, suffix = '') => {
      const cleanSuffix = extractArabicFragment(suffix);
      if (!cleanSuffix) return match;
      return `${tag} ${cleanSuffix}`;
    });
  }

  return result.replace(/  +/g, ' ');
}

/**
 * Remove "translated" tags — Arabic text inside bracket/brace patterns
 * that are clearly corrupted versions of original English tags.
 */
function stripTranslatedTags(text: string, origTags: string[]): string {
  // Only strip if original has tags (avoid false positives on user-added brackets)
  if (origTags.length === 0) return text;
  
  let result = text;
  
  // Strip Arabic text inside \[...\] or [...] patterns
  result = result.replace(TRANSLATED_TAG_REGEX, ' ');
  
  // Strip N[ArabicTag] or [ArabicTag]N patterns
  result = result.replace(TRANSLATED_NUM_TAG_REGEX, ' ');
  
  // Strip {ArabicTag} patterns
  result = result.replace(TRANSLATED_BRACE_TAG_REGEX, ' ');
  
  // Clean up multiple spaces
  return result.replace(/  +/g, ' ').trim();
}

/**
 * Locally restore missing technical tags from original into translation
 * without using AI — handles missing, translated, reversed, and damaged tags.
 * 
 * Pipeline:
 * 1. Strip invisible Unicode chars
 * 2. Fix reversed/mismatched brackets (via fixTagBracketsStrict)
 * 3. Strip "translated" tags (Arabic content inside brackets)
 * 4. Compare tag multisets
 * 5. Re-insert missing tags at proportional positions
 */
export function restoreTagsLocally(original: string, translation: string): string {
  const origTags = extractTags(original);
  if (origTags.length === 0) return translation;

  // Step 1: Strip invisible chars
  let working = stripInvisible(translation);
  
  // Step 2: Fix reversed/mismatched brackets
  const { text: bracketFixed } = fixTagBracketsStrict(original, working);
  working = bracketFixed;

  // Step 3: Pull Arabic text back out of hybrid-corrupted technical tags
  working = normalizeCorruptedEmbeddedTags(working, origTags);
  
  // Step 4: Check if tags are now all present after normalization
  let transTags = extractTags(working);
  const origCount = new Map<string, number>();
  for (const t of origTags) origCount.set(t, (origCount.get(t) || 0) + 1);
  let transCount = new Map<string, number>();
  for (const t of transTags) transCount.set(t, (transCount.get(t) || 0) + 1);

  let allPresent = true;
  let hasExtra = false;
  for (const [tag, count] of origCount) {
    const tc = transCount.get(tag) || 0;
    if (tc < count) { allPresent = false; break; }
    if (tc > count) { hasExtra = true; }
  }
  let hasForeign = false;
  for (const t of transTags) {
    if (!origCount.has(t)) { hasForeign = true; break; }
  }
  
  if (allPresent && !hasExtra && !hasForeign) {
    return working; // Perfect match after bracket fix
  }
  if (allPresent) {
    return enforceExactTagMultiset(original, working, origTags, origCount);
  }

  // Step 5: Strip translated tags (Arabic inside brackets) before rebuild
  const afterTranslatedStrip = stripTranslatedTags(working, origTags);
  
  // Step 6: Strip ALL remaining detected tags from translation
  const cleanTranslation = afterTranslatedStrip.replace(new RegExp(TAG_REGEX.source, TAG_REGEX.flags), '').replace(/  +/g, ' ').trim();

  // Step 7: Compute relative positions of each tag in original
  const origPlain = original.replace(new RegExp(TAG_REGEX.source, TAG_REGEX.flags), '');
  const origLength = Math.max(origPlain.length, 1);

  interface TagPosition { tag: string; relPos: number }
  const tagPositions: TagPosition[] = [];
  let plainIdx = 0;
  const origMatchAll = [...original.matchAll(new RegExp(TAG_REGEX.source, TAG_REGEX.flags))];
  let matchIdx = 0;

  for (let ci = 0; ci < original.length; ) {
    if (matchIdx < origMatchAll.length && ci === origMatchAll[matchIdx].index) {
      const m = origMatchAll[matchIdx];
      tagPositions.push({ tag: m[0], relPos: plainIdx / origLength });
      ci += m[0].length;
      matchIdx++;
    } else {
      plainIdx++;
      ci++;
    }
  }

  // Step 8: Insert tags into clean translation at proportional positions
  const transLength = Math.max(cleanTranslation.length, 1);
  
  // Find word boundary positions
  const wordBounds = [0];
  for (let j = 0; j < cleanTranslation.length; j++) {
    if (cleanTranslation[j] === ' ' || cleanTranslation[j] === '\n') {
      wordBounds.push(j + 1);
    }
  }
  wordBounds.push(cleanTranslation.length);

  // Map each tag to nearest word boundary
  const insertions: { pos: number; tag: string }[] = [];
  for (const tp of tagPositions) {
    const rawPos = Math.round(tp.relPos * transLength);
    let bestPos = rawPos;
    let bestDist = Infinity;
    for (const wb of wordBounds) {
      const dist = Math.abs(wb - rawPos);
      if (dist < bestDist) { bestDist = dist; bestPos = wb; }
    }
    insertions.push({ pos: bestPos, tag: tp.tag });
  }

  // Sort by position descending to insert from end
  insertions.sort((a, b) => b.pos - a.pos);

  let result = cleanTranslation;
  for (const ins of insertions) {
    const pos = Math.min(ins.pos, result.length);
    result = result.slice(0, pos) + ins.tag + result.slice(pos);
  }

  return result;
}

/**
 * Enforce exact multiset: remove foreign tags AND extra duplicates of original tags.
 */
function enforceExactTagMultiset(original: string, translation: string, origTags: string[], origCount: Map<string, number>): string {
  const remaining = new Map<string, number>();
  for (const [tag, count] of origCount) remaining.set(tag, count);
  
  const allMatches = [...translation.matchAll(new RegExp(TAG_REGEX.source, TAG_REGEX.flags))];
  const tagsToRemove: { tag: string; index: number }[] = [];
  
  for (const m of allMatches) {
    const tag = m[0];
    const rem = remaining.get(tag);
    if (rem !== undefined && rem > 0) {
      remaining.set(tag, rem - 1);
    } else {
      tagsToRemove.push({ tag, index: m.index! });
    }
  }
  
  if (tagsToRemove.length === 0) return translation;
  
  let result = translation;
  for (let i = tagsToRemove.length - 1; i >= 0; i--) {
    const { tag, index } = tagsToRemove[i];
    result = result.slice(0, index) + result.slice(index + tag.length);
  }
  
  return result.replace(/  +/g, ' ').trim();
}

/**
 * Preview tag restoration without applying — returns before/after
 */
export function previewTagRestore(original: string, translation: string): { before: string; after: string; hasDiff: boolean } {
  const after = restoreTagsLocally(original, translation);
  return { before: translation, after, hasDiff: after !== translation };
}
