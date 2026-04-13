/**
 * Unified Tag Bracket Fix Utility
 * Single source of truth for fixing broken brackets around [Tag:Value] technical tags.
 * 
 * SAFETY PRINCIPLE: Never delete brackets unless we successfully identified and restored
 * the corresponding technical tag. If we can't fix with confidence, leave as-is (fail-safe).
 */

export interface TagBracketFixStats {
  reversed: number;    // ]tag[ → [tag]
  mismatched: number;  // ]tag] or [tag[ → [tag]
  bare: number;        // tag without brackets → [tag]
  total: number;
}

export interface TagBracketFixResult {
  text: string;
  stats: TagBracketFixStats;
}

/** Regex to match valid [Tag:Value] or [/Tag:Value] patterns, optionally followed by (description) */
const TAG_COLON_REGEX = /\[\s*\/?\s*\w+\s*:[^\]]*?\s*\](?:\s*\([^)]{1,100}\))?/g;

/** Regex to match [TAG]N patterns (tag then number) e.g. [ML]1 */
const TAG_BRACKET_NUM_REGEX = /\[[A-Z]{2,10}\]\d+/g;

/** Regex to match N[TAG] patterns (number then tag) e.g. 1[ML] */
const NUM_TAG_BRACKET_REGEX = /\d+\[[A-Z]{2,10}\]/g;

/** Regex to match [TAG=Value] patterns e.g. [Color=Red] */
const TAG_EQUALS_REGEX = /\[\w+=\w[^\]]*\]/g;

/** Regex to match generic English bracket tags like [Passive], [Arts Seal], [Lock-On] */
const TAG_GENERIC_WORD_REGEX = /\\?\[\s*[A-Za-z][A-Za-z0-9]*(?:[ '\/-]+[A-Za-z0-9]+)*\s*\\?\]/g;

/** Regex to match {TAG:Value} patterns e.g. {player:name} */
const BRACE_TAG_REGEX = /\{\w+:\w[^}]*\}/g;

/**
 * Check if original text contains technical tags in any supported format.
 */
export function hasTechnicalBracketTag(original: string): boolean {
  return /\[\s*\/?\s*\w+\s*:[^\]]*?\s*\]/.test(original) 
    || /\[[A-Z]{2,10}\]\d+/.test(original)
    || /\d+\[[A-Z]{2,10}\]/.test(original)
    || /\\?\[\s*[A-Za-z][A-Za-z0-9]*(?:[ '\/-]+[A-Za-z0-9]+)*\s*\\?\]/.test(original)
    || /\[\w+=\w[^\]]*\]/.test(original)
    || /\{\w+:\w[^}]*\}/.test(original);
}

function extractBracketInner(tag: string): string | null {
  if (!/^\\?\[/.test(tag) || !/\\?\]$/.test(tag)) return null;
  return tag.replace(/^\\?\[/, '').replace(/\\?\]$/, '');
}

/**
 * Escape a string for use in a RegExp.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Flexible whitespace pattern that also matches invisible Unicode formatting chars */
const FLEX_WS = '[\\s\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]*';

/**
 * Make an escaped regex string tolerant of invisible chars between each character.
 * This handles cases where BiDi processing inserts RTL/LTR marks within tag content.
 */
function flexibleEsc(esc: string): string {
  // Insert optional invisible char match between each character of the escaped string
  // But be careful not to break escaped sequences like \\[
  const chars: string[] = [];
  for (let i = 0; i < esc.length; i++) {
    if (esc[i] === '\\' && i + 1 < esc.length) {
      chars.push(esc[i] + esc[i + 1]);
      i++;
    } else {
      chars.push(esc[i]);
    }
  }
  return chars.join('[\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]?');
}

/**
 * Fix broken/reversed/missing brackets around [Tag:Value] technical tags.
 * Compares the original text's tags with the translation and repairs any mangled versions.
 * 
 * SAFE: Does NOT delete any brackets unless a valid tag replacement was made.
 * If the translation can't be fixed with confidence, it's returned unchanged.
 */
export function fixTagBracketsStrict(original: string, translation: string): TagBracketFixResult {
  const stats: TagBracketFixStats = { reversed: 0, mismatched: 0, bare: 0, total: 0 };

  // Strip invisible Unicode formatting chars that break regex matching in Arabic text
  let result = translation.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');

  // 1. Handle [Tag:Value] style tags
  const colonTags = [...original.matchAll(new RegExp(TAG_COLON_REGEX.source, TAG_COLON_REGEX.flags))].map(m => m[0]);
  for (const tag of colonTags) {
    if (result.includes(tag)) continue;

    const closeBracketIdx = tag.indexOf(']');
    const inner = tag.slice(1, closeBracketIdx);
    const esc = escapeRegex(inner);

    // Pattern 1: reversed brackets ]inner[
    const revPattern = new RegExp(`\\]${FLEX_WS}${esc}${FLEX_WS}\\[`);
    if (revPattern.test(result)) {
      result = result.replace(revPattern, `[${inner}]`);
      stats.reversed++;
      stats.total++;
      continue;
    }

    // Pattern 2: mismatched brackets ]inner] or [inner[
    let fixed = false;
    for (const bp of [
      new RegExp(`\\]${FLEX_WS}${esc}${FLEX_WS}\\]`),
      new RegExp(`\\[${FLEX_WS}${esc}${FLEX_WS}\\[`),
    ]) {
      if (bp.test(result)) {
        result = result.replace(bp, `[${inner}]`);
        stats.mismatched++;
        stats.total++;
        fixed = true;
        break;
      }
    }
    if (fixed) continue;

    // Pattern 3: bare inner without brackets
    const barePattern = new RegExp(`(?<!\\[)${esc}(?!\\])`);
    if (barePattern.test(result)) {
      result = result.replace(barePattern, `[${inner}]`);
      stats.bare++;
      stats.total++;
      continue;
    }

    // Pattern 4: inner content got fully reversed by BiDi
    const reversedInner = inner.split('').reverse().join('');
    const escapedReversed = escapeRegex(reversedInner);
    for (const rp of [
      new RegExp(`\\[${FLEX_WS}${escapedReversed}${FLEX_WS}\\]`),
      new RegExp(`\\]${FLEX_WS}${escapedReversed}${FLEX_WS}\\[`),
    ]) {
      if (rp.test(result)) {
        result = result.replace(rp, `[${inner}]`);
        stats.reversed++;
        stats.total++;
        break;
      }
    }
  }

  // 1.5 Handle generic bracket tags like [Passive], [Arts Seal], [Lock-On]
  const genericBracketTags = [...original.matchAll(new RegExp(TAG_GENERIC_WORD_REGEX.source, TAG_GENERIC_WORD_REGEX.flags))].map(m => m[0]);
  for (const tag of genericBracketTags) {
    if (result.includes(tag)) continue;
    const inner = extractBracketInner(tag);
    if (!inner) continue;
    const esc = flexibleEsc(escapeRegex(inner));

    const patterns: [RegExp, 'reversed' | 'mismatched' | 'bare'][] = [
      [new RegExp(`\\]${FLEX_WS}${esc}${FLEX_WS}\\[`), 'reversed'],
      [new RegExp(`\\]${FLEX_WS}${esc}${FLEX_WS}\\]`), 'mismatched'],
      [new RegExp(`\\[${FLEX_WS}${esc}${FLEX_WS}\\[`), 'mismatched'],
      [new RegExp(`(?<!\\[)${esc}(?!\\])`), 'bare'],
    ];

    let fixed = false;
    for (const [pat, type] of patterns) {
      if (pat.test(result)) {
        result = result.replace(pat, tag);
        stats[type]++;
        stats.total++;
        fixed = true;
        break;
      }
    }
    if (fixed) continue;
  }

  // 2. Handle [TAG]N style tags (e.g. [ML]1, [SE]0)
  const bracketNumTags = [...original.matchAll(new RegExp(TAG_BRACKET_NUM_REGEX.source, TAG_BRACKET_NUM_REGEX.flags))].map(m => m[0]);
  for (const tag of bracketNumTags) {
    if (result.includes(tag)) continue;
    const match = tag.match(/^\[([A-Z]{2,10})\](\d+)$/);
    if (!match) continue;
    const [, tagName, num] = match;
    const escName = escapeRegex(tagName);
    const escNum = escapeRegex(num);

    const patterns: [RegExp, 'reversed' | 'mismatched' | 'bare'][] = [
      [new RegExp(`\\]${escName}\\[${escNum}`), 'reversed'],
      [new RegExp(`\\[${escName}\\[${escNum}`), 'mismatched'],
      [new RegExp(`\\]${escName}\\]${escNum}`), 'mismatched'],
      [new RegExp(`\\[${escName}\\]${FLEX_WS}${escNum}`), 'mismatched'],
      [new RegExp(`(?<!\\[)${escName}(?!\\])${FLEX_WS}${escNum}`), 'bare'],
    ];
    let fixed2 = false;
    for (const [pat, type] of patterns) {
      if (pat.test(result)) {
        result = result.replace(pat, tag);
        stats[type]++;
        stats.total++;
        fixed2 = true;
        break;
      }
    }
    if (fixed2) continue;
  }

  // 3. Handle N[TAG] style tags (e.g. 1[ML], 0[SE])
  const numBracketTags = [...original.matchAll(new RegExp(NUM_TAG_BRACKET_REGEX.source, NUM_TAG_BRACKET_REGEX.flags))].map(m => m[0]);
  for (const tag of numBracketTags) {
    if (result.includes(tag)) continue;
    const match = tag.match(/^(\d+)\[([A-Z]{2,10})\]$/);
    if (!match) continue;
    const [, num, tagName] = match;
    const escName = escapeRegex(tagName);
    const escNum = escapeRegex(num);

    const patterns: [RegExp, 'reversed' | 'mismatched' | 'bare'][] = [
      [new RegExp(`${escNum}\\]${escName}\\[`), 'reversed'],
      [new RegExp(`${escNum}\\[${escName}\\[`), 'mismatched'],
      [new RegExp(`${escNum}\\]${escName}\\]`), 'mismatched'],
      [new RegExp(`${escNum}${FLEX_WS}(?<!\\[)${escName}(?!\\])`), 'bare'],
    ];
    let fixed3 = false;
    for (const [pat, type] of patterns) {
      if (pat.test(result)) {
        result = result.replace(pat, tag);
        stats[type]++;
        stats.total++;
        fixed3 = true;
        break;
      }
    }
    if (fixed3) continue;
  }

  // 4. Handle [TAG=Value] style tags (e.g. [Color=Red])
  const equalsTags = [...original.matchAll(new RegExp(TAG_EQUALS_REGEX.source, TAG_EQUALS_REGEX.flags))].map(m => m[0]);
  for (const tag of equalsTags) {
    if (result.includes(tag)) continue;
    const inner = tag.slice(1, -1); // remove [ ]
    const esc = escapeRegex(inner);

    const patterns: [RegExp, 'reversed' | 'mismatched' | 'bare'][] = [
      [new RegExp(`\\]${FLEX_WS}${esc}${FLEX_WS}\\[`), 'reversed'],
      [new RegExp(`\\]${FLEX_WS}${esc}${FLEX_WS}\\]`), 'mismatched'],
      [new RegExp(`\\[${FLEX_WS}${esc}${FLEX_WS}\\[`), 'mismatched'],
      [new RegExp(`(?<!\\[)${esc}(?!\\])`), 'bare'],
    ];
    let fixed4 = false;
    for (const [pat, type] of patterns) {
      if (pat.test(result)) {
        result = result.replace(pat, `[${inner}]`);
        stats[type]++;
        stats.total++;
        fixed4 = true;
        break;
      }
    }
    if (fixed4) continue;
  }

  // 5. Handle {TAG:Value} style tags (e.g. {player:name})
  const braceTags = [...original.matchAll(new RegExp(BRACE_TAG_REGEX.source, BRACE_TAG_REGEX.flags))].map(m => m[0]);
  for (const tag of braceTags) {
    if (result.includes(tag)) continue;
    const inner = tag.slice(1, -1); // remove { }
    const esc = escapeRegex(inner);

    const patterns: [RegExp, 'reversed' | 'mismatched' | 'bare'][] = [
      [new RegExp(`\\}${FLEX_WS}${esc}${FLEX_WS}\\{`), 'reversed'],
      [new RegExp(`\\}${FLEX_WS}${esc}${FLEX_WS}\\}`), 'mismatched'],
      [new RegExp(`\\{${FLEX_WS}${esc}${FLEX_WS}\\{`), 'mismatched'],
      [new RegExp(`(?<!\\{)${esc}(?!\\})`), 'bare'],
    ];
    let fixed5 = false;
    for (const [pat, type] of patterns) {
      if (pat.test(result)) {
        result = result.replace(pat, `{${inner}}`);
        stats[type]++;
        stats.total++;
        fixed5 = true;
        break;
      }
    }
    if (fixed5) continue;
  }

  return { text: result, stats };
}
