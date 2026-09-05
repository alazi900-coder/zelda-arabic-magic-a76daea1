/**
 * Client-side line balancing utility.
 *
 * Phase 2: Hard-break detection now uses the Token model (text-tokens.ts) so
 * [XENO:n ] and [System:PageBreak ] are first-class semantic anchors — never
 * moved, deleted, or crossed by the DP balancer. We additionally assert via
 * `hardBreaksEqual` that the rebalanced output preserves the EXACT ordered
 * list of cinematic markers; if anything drifts, we fall back to the input
 * untouched (better visual imbalance than a broken cinematic).
 */
import { hardBreaksEqual } from "./text-tokens";
import { PLAT_TAG_RE } from "./nds/plat-tag-mask";

// Platinum's own {COLOR 2}, {STRVAR_1 74, 6, 0} folded in via PLAT_TAG_RE.source
// \u2014 without it, a tag containing spaces/commas (unlike every other bracketed
// tag this pattern already shields) reads as several separate "words" to the
// DP line-balancer below, which is then free to scatter its fragments across
// different lines independently, corrupting the tag instead of keeping it
// atomic. See _shared/plat-tag-mask.ts (the server-side twin of this pattern).
const TAG_SHIELD_PATTERN = new RegExp(
  `[\\uE000-\\uE0FF]+|\\\\?\\[\\s*\\/?\\s*\\w+\\s*:[^\\]]*?\\s*\\\\?\\]|\\d+\\s*\\\\?\\[[A-Z]{2,10}\\\\?\\]|\\\\?\\[[A-Z]{2,10}\\\\?\\]\\s*\\d+|\\\\?\\[\\s*[A-Za-z][A-Za-z0-9]*(?:[ '/-]+[A-Za-z0-9]+)*\\s*\\\\?\\]|\\[\\s*\\w+\\s*=\\s*\\w[^\\]]*\\]|\\{\\s*\\w+\\s*:\\s*\\w[^}]*\\}|\\{[\\w]+\\}|[\\uFFF9-\\uFFFC]+|${PLAT_TAG_RE.source}`,
  "g",
);

/** Calculate visual length: each tag counts as 1 character (renders as single icon in-game) */
export function visualLength(text: string): number {
  return text.replace(TAG_SHIELD_PATTERN, '⬚').length;
}

interface ShieldResult {
  shielded: string;
  map: Map<string, { placeholder: string; original: string; displayLen: number }>;
}

function shieldTagsForBalance(text: string): ShieldResult {
  const map = new Map<string, { placeholder: string; original: string; displayLen: number }>();
  let idx = 0;
  const shielded = text.replace(TAG_SHIELD_PATTERN, (match) => {
    const placeholder = `◆${idx}◆`;
    map.set(placeholder, { placeholder, original: match, displayLen: 1 });
    idx++;
    return placeholder;
  });
  return { shielded, map };
}

function unshieldTagsAfterBalance(
  text: string,
  map: Map<string, { placeholder: string; original: string; displayLen: number }>
): string {
  let result = text;
  for (const [placeholder, info] of map) {
    result = result.replace(placeholder, info.original);
  }
  return result;
}

const TARGET_MAX = 42;
const HARD_MAX = 48;

/** Patterns whose tokens are NOT lexical Arabic words (XC3 tags, brackets, PUA). */
const XC3_TAG_TOKEN = /\[\s*(?:XENO|System|ML)\s*:[^\]]*\]/i;

function countLexicalWords(line: string): number {
  // Strip XC3 tags entirely first — they're not words.
  const cleaned = line.replace(/\[\s*(?:XENO|System|ML)\s*:[^\]]*\]/gi, ' ');
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  let count = 0;
  for (const token of tokens) {
    if (/^◆\d+◆$/.test(token)) continue;
    if (/^TAG_\d+$/i.test(token)) continue;
    if (XC3_TAG_TOKEN.test(token)) continue;
    if (/^[\p{P}\p{S}]+$/u.test(token)) continue;
    if (/[\p{L}\p{N}]/u.test(token)) count++;
  }
  return count;
}

function scoreSplit(lines: string[]): number {
  if (lines.length <= 1) return 0;
  // Use visual length so PUA/tag-heavy lines aren't unfairly punished.
  const lengths = lines.map((l) => visualLength(l));
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const maxLen = Math.max(...lengths);
  const minLen = Math.min(...lengths);
  let cost = 0;
  // Imbalance is scored RELATIVE to the average line length, not as raw
  // character counts — this function also compares candidates with
  // DIFFERENT line counts (balanceChunk tries both the minimum feasible
  // nLines and nLines+1), and an absolute spread naturally shrinks when
  // lines are shorter even if they're proportionally just as (or more)
  // uneven. That biased the comparison toward more, shorter, choppier
  // lines over fewer, fuller, better-balanced ones. Normalizing by the
  // average makes different nLines candidates comparable on equal footing.
  const norm = avg > 0 ? avg : 1;
  const relSpread = (maxLen - minLen) / norm;
  cost += relSpread * relSpread * 2;
  for (let i = 0; i < lines.length; i++) {
    const relDev = (lengths[i] - avg) / norm;
    cost += relDev * relDev;
    // Penalize lines that are far below average (under 60% of avg)
    if (lengths[i] < avg * 0.6 && lines.length > 1) {
      const relShortBy = (avg * 0.6 - lengths[i]) / norm;
      cost += relShortBy * relShortBy * 3;
    }
    if (i > 0 && i < lines.length - 1) {
      const lexical = countLexicalWords(lines[i]);
      if (lexical <= 1) cost += 50000;
      if (lexical === 2 && lengths[i] < 10) cost += 5000;
    }
  }
  return cost;
}


/** Merges `a` and `b` with a single space, or null if the result would exceed `maxLen`
 * — a merge that busts the limit is worse than leaving the orphan alone (e.g. a single
 * word that's over-limit by itself and must stay isolated on its own line). */
function tryMerge(a: string, b: string, maxLen: number): string | null {
  const merged = `${a} ${b}`.replace(/\s{2,}/g, ' ').trim();
  return merged.length <= maxLen ? merged : null;
}

function fixOrphans(lines: string[], maxLen: number = Infinity): string[] {
  if (lines.length <= 1) return lines;
  const result = [...lines];
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 8) {
    changed = false;
    iterations++;
    for (let i = 0; i < result.length; i++) {
      const lexical = countLexicalWords(result[i]);
      if (lexical <= 1 && result.length > 1) {
        if (i === 0) {
          const merged = tryMerge(result[0], result[1], maxLen);
          if (merged === null) continue;
          result[1] = merged;
          result.splice(0, 1);
        } else if (i === result.length - 1) {
          const merged = tryMerge(result[i - 1], result[i], maxLen);
          if (merged === null) continue;
          result[i - 1] = merged;
          result.splice(i, 1);
        } else {
          const prevLen = result[i - 1].length;
          const nextLen = result[i + 1].length;
          const preferPrev = prevLen <= nextLen;
          const mergedPrev = tryMerge(result[i - 1], result[i], maxLen);
          const mergedNext = tryMerge(result[i], result[i + 1], maxLen);
          if (preferPrev && mergedPrev !== null) {
            result[i - 1] = mergedPrev;
            result.splice(i, 1);
          } else if (!preferPrev && mergedNext !== null) {
            result[i + 1] = mergedNext;
            result.splice(i, 1);
          } else if (mergedPrev !== null) {
            result[i - 1] = mergedPrev;
            result.splice(i, 1);
          } else if (mergedNext !== null) {
            result[i + 1] = mergedNext;
            result.splice(i, 1);
          } else {
            continue;
          }
        }
        changed = true;
        break;
      }
    }
  }
  return result;
}

function dpSplitShielded(
  words: string[],
  nLines: number,
  wordDisplayLen: (w: string) => number,
  hardMax: number = HARD_MAX
): string[] | null {
  const n = words.length;
  if (n < nLines) return null;

  const lineLen = (from: number, to: number): number => {
    let len = 0;
    for (let k = from; k < to; k++) {
      len += wordDisplayLen(words[k]) + (k > from ? 1 : 0);
    }
    return len;
  };

  const totalLen = lineLen(0, n);
  const ideal = totalLen / nLines;
  const INF = 1e18;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(nLines + 1).fill(INF));
  const choice: number[][] = Array.from({ length: n + 1 }, () => new Array(nLines + 1).fill(0));

  dp[0][0] = 0;

  for (let k = 1; k <= nLines; k++) {
    for (let i = k; i <= n; i++) {
      for (let j = k - 1; j < i; j++) {
        const ll = lineLen(j, i);
        if (ll > hardMax && i - j > 1) continue;

        const deviation = ll - ideal;
        let cost = deviation * deviation;
        const lexicalCount = countLexicalWords(words.slice(j, i).join(' '));
        const isMiddleLine = k > 1 && k < nLines;
        const isLastLine = k === nLines;
        if (lexicalCount <= 1 && isMiddleLine) cost += 50000;
        if (i - j === 1 && isMiddleLine) cost += 50000;
        if (ll < ideal * 0.4 && lexicalCount < 3) cost += 5000;
        // Strong penalty when any line is much shorter than the ideal — keeps lines visually balanced
        if (ll < ideal * 0.6 && nLines > 1) {
          const shortBy = ideal * 0.6 - ll;
          cost += shortBy * shortBy * 4;
        }
        // Extra penalty if the LAST line is too short (the most visually obvious imbalance)
        if (isLastLine && ll < ideal * 0.7 && nLines > 1) {
          const shortBy = ideal * 0.7 - ll;
          cost += shortBy * shortBy * 6;
        }
        // Reward breaking after [XENO:n ] tag (the original line-break marker)


        const total = dp[j][k - 1] + cost;
        if (total < dp[i][k]) {
          dp[i][k] = total;
          choice[i][k] = j;
        }
      }
    }
  }

  if (dp[n][nLines] >= INF) return null;

  const lines: string[] = new Array(nLines);
  let pos = n;
  for (let k = nLines; k >= 1; k--) {
    const start = choice[pos][k];
    lines[k - 1] = words.slice(start, pos).join(' ');
    pos = start;
  }
  return lines;
}

/**
 * XC3 cinematic HARD line-break markers. The game treats these as mandatory
 * boundaries — words must NEVER be redistributed across them by the balancer:
 *   - `[XENO:n ]`         → next character is a newline (single-line break)
 *   - `[System:PageBreak ]` → flushes the dialogue box (page break)
 * We split on either marker FIRST, then balance each chunk independently.
 */
const XENO_N_HARD_BREAK = /\[\s*XENO\s*:\s*n\s*\]\s*\n?|\[\s*System\s*:\s*PageBreak\s*\]\s*\n?/g;

/**
 * Balance a SINGLE chunk (no [XENO:n ] inside) into lines using DP. Exported
 * for reuse by other line-splitting tools (e.g. Risen's manual char-limit
 * splitter) that need the same orphan-avoiding word balancing.
 */
export function balanceChunk(chunk: string, limit: number, hardMax: number, maxLines?: number): string {
  const stripped = chunk.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!stripped) return stripped;
  const { shielded, map } = shieldTagsForBalance(stripped);

  let displayLen = shielded.length;
  for (const [placeholder, info] of map) {
    displayLen += info.displayLen - placeholder.length;
  }
  if (displayLen <= limit) return stripped;

  const words = shielded.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < 2) return stripped;

  const wordDisplayLen = (w: string): number => {
    let len = w.length;
    for (const [placeholder, info] of map) {
      if (w.includes(placeholder)) {
        len += info.displayLen - placeholder.length;
      }
    }
    return len;
  };

  const totalLen = words.reduce((s, w) => s + wordDisplayLen(w), 0) + (words.length - 1);
  let numLines = Math.max(2, Math.ceil(totalLen / limit));
  if (maxLines && maxLines > 0) numLines = Math.min(numLines, maxLines);

  let bestResult: string[] | null = null;
  let bestCost = Infinity;
  const upperBound = maxLines ? Math.min(numLines, maxLines) : Math.min(numLines + 1, words.length);
  for (let nLines = numLines; nLines <= upperBound; nLines++) {
    const result = dpSplitShielded(words, nLines, wordDisplayLen, hardMax);
    if (result) {
      const cost = scoreSplit(
        result.map((line) =>
          line.split(/\s+/).map((w) => 'x'.repeat(wordDisplayLen(w))).join(' ')
        )
      );
      if (cost < bestCost) {
        bestCost = cost;
        bestResult = result;
      }
    }
  }

  if (!bestResult) return stripped;
  bestResult = fixOrphans(bestResult, hardMax);
  return bestResult.map((line) => unshieldTagsAfterBalance(line, map)).join('\n');
}

/**
 * Rebalance text lines.
 *
 * CRITICAL XC3 BEHAVIOR: `[XENO:n ]` is a HARD cinematic line break in the original.
 * We split on `[XENO:n ]` boundaries first, balance each chunk independently with
 * its own DP pass, then re-join — the DP never crosses the tag, and the word that
 * follows it never ends up alone on its own line by accident.
 */
export function balanceLines(text: string, targetMax?: number, maxLines?: number): string {
  const limit = targetMax ?? TARGET_MAX;
  const hardMax = limit + 6;

  // Step 1: split on hard XENO:n breaks (the tag stays at the end of its chunk).
  const chunks: string[] = [];
  const re = new RegExp(XENO_N_HARD_BREAK.source, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index).replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const tagMatch = match[0].match(/\[\s*XENO\s*:\s*n\s*\]|\[\s*System\s*:\s*PageBreak\s*\]/);
    const tagText = tagMatch ? tagMatch[0] : '[XENO:n ]';
    chunks.push((before ? before + ' ' : '') + tagText);
    lastIndex = match.index + match[0].length;
  }
  const tail = text.slice(lastIndex).replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (tail) chunks.push(tail);

  // No XENO:n found — legacy single-chunk behavior.
  if (chunks.length <= 1) {
    const out = balanceChunk(text, limit, hardMax, maxLines);
    return hardBreaksEqual(text, out) ? out : text;
  }

  // Step 2: distribute the maxLines budget across chunks proportionally to word count.
  let perChunkMax: number[] | undefined;
  if (maxLines && maxLines > 0) {
    const wordCounts = chunks.map(c =>
      c.replace(XENO_N_HARD_BREAK, ' ').split(/\s+/).filter(Boolean).length
    );
    const total = wordCounts.reduce((a, b) => a + b, 0) || 1;
    const extra = Math.max(0, maxLines - chunks.length);
    perChunkMax = chunks.map((_, i) =>
      Math.max(1, 1 + Math.round((wordCounts[i] / total) * extra))
    );
  }

  // Step 3: balance each chunk independently — DP never crosses [XENO:n ].
  const balanced = chunks.map((chunk, i) =>
    balanceChunk(chunk, limit, hardMax, perChunkMax ? perChunkMax[i] : undefined)
  );

  const joined = balanced.join('\n');
  // SAFETY ASSERTION: if our cinematic anchors drifted, return the input
  // untouched rather than ship a freeze-inducing line layout.
  return hardBreaksEqual(text, joined) ? joined : text;
}


function splitChunkEvenly(
  chunk: string,
  numLines: number,
): string {
  const flat = chunk.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (numLines <= 1 || !flat) return flat;

  const { shielded, map } = shieldTagsForBalance(flat);
  const words = shielded.split(/\s+/).filter(w => w.length > 0);
  if (words.length < numLines) return flat;

  const wordDisplayLen = (w: string): number => {
    let len = w.length;
    for (const [placeholder, info] of map) {
      if (w.includes(placeholder)) {
        len += info.displayLen - placeholder.length;
      }
    }
    return len;
  };

  const result = dpSplitShielded(words, numLines, wordDisplayLen, 99999);
  if (!result) {
    const perLine = Math.ceil(words.length / numLines);
    const lines: string[] = [];
    for (let i = 0; i < numLines; i++) {
      lines.push(words.slice(i * perLine, Math.min((i + 1) * perLine, words.length)).join(' '));
    }
    return lines.filter(Boolean).map(l => unshieldTagsAfterBalance(l, map)).join('\n');
  }

  return result.map(line => unshieldTagsAfterBalance(line, map)).join('\n');
}

/**
 * Split text evenly into N lines by word count.
 *
 * CRITICAL XC3 BEHAVIOR: `[XENO:n ]` is a HARD cinematic line break in the original
 * English. We never redistribute words across it. Instead we:
 *   1. Split the text into chunks separated by `[XENO:n ]` (the tag stays at the
 *      end of its chunk, followed by the newline the engine requires).
 *   2. Distribute the requested `numLines` across those chunks proportionally to
 *      their word count.
 *   3. Balance each chunk independently with the DP splitter.
 *
 * This prevents the "كلمة وحيدة بعد [XENO:n ] في سطر منفصل" bug where the DP used
 * to flatten everything and place the word right after the tag on its own line,
 * which then exploded the total line count and triggered the deep diagnostic
 * "أسطر زائدة عن الأصل" / "فرق كبير بعدد الأسطر" warnings by the thousands.
 */
export function splitEvenlyByLines(text: string, numLines: number): string {
  if (!text) return text;
  if (numLines <= 1) {
    // Even when collapsing to a single visual line, we MUST preserve [XENO:n ] breaks.
    return text;
  }

  // Step 1: split on hard XENO:n breaks (preserve the tag at chunk-end).
  const chunks: string[] = [];
  let lastIndex = 0;
  XENO_N_HARD_BREAK.lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(XENO_N_HARD_BREAK.source, 'g');
  while ((match = re.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index).trim();
    // Re-attach the hard-break tag (without trailing whitespace) to the preceding chunk.
    const tagMatch = match[0].match(/\[\s*XENO\s*:\s*n\s*\]|\[\s*System\s*:\s*PageBreak\s*\]/);
    const tagText = tagMatch ? tagMatch[0] : '[XENO:n ]';
    chunks.push((before ? before + ' ' : '') + tagText);
    lastIndex = match.index + match[0].length;
  }
  const tail = text.slice(lastIndex).replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (tail) chunks.push(tail);

  // No XENO:n found — fall back to legacy single-chunk balancing.
  if (chunks.length <= 1) {
    const out = splitChunkEvenly(text, numLines);
    return hardBreaksEqual(text, out) ? out : text;
  }

  // Step 2: every XENO:n already produces a hard newline. The remaining "extra"
  // lines we still need to introduce equals numLines - chunks.length. Distribute
  // them across chunks proportionally to word count.
  const chunkWordCounts = chunks.map(c =>
    c.replace(XENO_N_HARD_BREAK, ' ').split(/\s+/).filter(Boolean).length
  );
  const extraLinesNeeded = Math.max(0, numLines - chunks.length);
  const totalWords = chunkWordCounts.reduce((a, b) => a + b, 0) || 1;

  const linesPerChunk = chunks.map((_, i) =>
    1 + Math.round((chunkWordCounts[i] / totalWords) * extraLinesNeeded)
  );

  // Step 3: balance each chunk independently with the assigned line budget.
  const balancedChunks = chunks.map((chunk, i) => {
    const target = Math.max(1, linesPerChunk[i]);
    return splitChunkEvenly(chunk, target);
  });

  const joined = balancedChunks.join('\n');
  // SAFETY ASSERTION (token model): cinematic anchors must be preserved 1:1.
  return hardBreaksEqual(text, joined) ? joined : text;
}

/**
 * Align the translation's hard breaks to the ORIGINAL's structure.
 * Places [XENO:n ]/[System:PageBreak ] tokens at the same semantic positions
 * as in the original, distributing the translation tokens proportionally by
 * the word count of each original segment.
 *
 * Inline tags inside the translation (e.g. `[XENO:act act=EVT_EXT1]`,
 * `[XENO:wait wait=key]`) are kept as atomic tokens — never split.
 */
export function splitByOriginalBreaks(original: string, translation: string): string {
  if (!translation) return translation;
  const breakRe = new RegExp(XENO_N_HARD_BREAK.source, 'g');

  // 1. Find break tokens in the ORIGINAL (with their exact form incl. trailing \n).
  const breaks: { match: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = breakRe.exec(original)) !== null) {
    breaks.push({ match: m[0], index: m.index });
  }

  // No breaks in original → flatten translation to a single line.
  if (breaks.length === 0) {
    return translation
      .replace(new RegExp(XENO_N_HARD_BREAK.source, 'g'), ' ')
      .replace(/\n+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // 2. Split the original into N+1 segments around the breaks.
  const origSegments: string[] = [];
  let last = 0;
  for (const b of breaks) {
    origSegments.push(original.slice(last, b.index));
    last = b.index + b.match.length;
  }
  origSegments.push(original.slice(last));

  // 3. Flatten the translation (drop ALL break tokens & newlines).
  const flat = translation
    .replace(new RegExp(XENO_N_HARD_BREAK.source, 'g'), ' ')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 4. Tokenize: bracketed tags stay atomic, then whitespace-separated tokens.
  const tokenRe = /\[[^\]]*\]|\S+/g;
  const tokens: string[] = [];
  let t: RegExpExecArray | null;
  while ((t = tokenRe.exec(flat)) !== null) tokens.push(t[0]);

  if (tokens.length === 0) return translation;

  // 5. Weight each original segment by lexical word count (tags excluded).
  const weights = origSegments.map(seg => {
    const cleaned = seg.replace(/\[[^\]]*\]/g, ' ').trim();
    const w = cleaned.split(/\s+/).filter(Boolean).length;
    return Math.max(1, w);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // 6. Compute cut points across tokens; ensure each segment gets ≥1 token.
  const N = tokens.length;
  const numSegs = origSegments.length;
  const cuts: number[] = [];
  let acc = 0;
  for (let i = 0; i < numSegs - 1; i++) {
    acc += weights[i];
    let c = Math.round((acc / totalWeight) * N);
    // Keep at least 1 token in each remaining segment.
    const minC = i + 1;
    const maxC = N - (numSegs - 1 - i);
    if (c < minC) c = minC;
    if (c > maxC) c = maxC;
    if (cuts.length && c <= cuts[cuts.length - 1]) c = cuts[cuts.length - 1] + 1;
    cuts.push(c);
  }

  // 7. Build segments from tokens and rejoin with original break tokens.
  const segs: string[] = [];
  let start = 0;
  for (const c of cuts) {
    segs.push(tokens.slice(start, c).join(' '));
    start = c;
  }
  segs.push(tokens.slice(start).join(' '));

  let result = '';
  for (let i = 0; i < segs.length; i++) {
    result += segs[i];
    if (i < breaks.length) {
      // Ensure clean join: no trailing space before the break token.
      result = result.replace(/\s+$/, '');
      result += breaks[i].match;
      // If the break token didn't already end with \n but original had one, keep behavior:
      // (XENO_N_HARD_BREAK already captures the optional \n, so this is faithful.)
    }
  }
  return result;
}

/**
 * Does `text` use XC engine line-break tags ([XENO:n]/[System:PageBreak])?
 * `splitByOriginalBreaks` only understands these — for plain multi-line text
 * with no such tags (e.g. Risen in-game documents), it has no breaks to work
 * with and collapses everything to one line. `mapTranslationToLineSkeleton`
 * below is the correct tool for that case instead.
 */
export function hasEngineLineBreakTags(text: string): boolean {
  return new RegExp(XENO_N_HARD_BREAK.source).test(text);
}

export type LineSlotKind = "empty" | "list" | "prose";

/** The break style used by `text`: "\r\n" if present, else "\n". */
export function detectBreakStyle(text: string): "\r\n" | "\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * Classify each line of a plain multi-line original into a skeleton slot:
 * empty (deliberate page-layout spacing), list item (starts with optional
 * spaces then "-"), or prose.
 */
export function buildLineSkeleton(original: string): LineSlotKind[] {
  return original.split(/\r\n|\n/).map((line) => {
    if (line.trim() === "") return "empty";
    if (/^\s*-/.test(line)) return "list";
    return "prose";
  });
}

export interface SkeletonMapResult {
  ok: boolean;
  text?: string;
  expectedContentLines?: number;
  actualContentLines?: number;
}

/**
 * Map a user's translation onto the ORIGINAL's line skeleton — structure
 * mapping, not rewrapping. Empty skeleton slots stay empty; every non-empty
 * slot (list item or prose) consumes exactly one non-empty translation line,
 * in order. Refuses (does not guess/merge) when the translation's content-line
 * count doesn't match the skeleton's content-slot count — the caller should
 * leave the text unchanged and surface `expectedContentLines`/`actualContentLines`
 * to the user in that case. Preserves the original's break style (\r\n vs \n).
 */
export function mapTranslationToLineSkeleton(original: string, translation: string): SkeletonMapResult {
  const skeleton = buildLineSkeleton(original);
  const breakStyle = detectBreakStyle(original);
  const expectedContentLines = skeleton.filter((slot) => slot !== "empty").length;

  const contentLines = translation
    .split(/\r\n|\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

  if (contentLines.length !== expectedContentLines) {
    return { ok: false, expectedContentLines, actualContentLines: contentLines.length };
  }

  let i = 0;
  const resultLines = skeleton.map((slot) => (slot === "empty" ? "" : contentLines[i++]));
  return { ok: true, text: resultLines.join(breakStyle) };
}

/**
 * Silently normalize `text`'s line-break style to match `source`'s (\r\n vs \n).
 * No-op if `text` has no line breaks or already matches.
 */
export function normalizeBreakStyleToSource(source: string, text: string): string {
  if (!text.includes("\n")) return text;
  return detectBreakStyle(source) === "\r\n"
    ? text.replace(/\r\n|\n/g, "\r\n")
    : text.replace(/\r\n/g, "\n");
}

export interface LineStructureValidation {
  ok: boolean;
  originalLines: number;
  translatedLines: number;
  emptyMaskMatches: boolean;
}

/**
 * Validate that `translated` reproduces `original`'s line structure: the same
 * total line count AND the same positions of empty lines (order-sensitive).
 */
export function validateLineStructure(original: string, translated: string): LineStructureValidation {
  const origLines = original.split(/\r\n|\n/);
  const trLines = translated.split(/\r\n|\n/);
  const origMask = origLines.map((line) => line.trim() === "");
  const trMask = trLines.map((line) => line.trim() === "");
  const sameCount = origLines.length === trLines.length;
  const maskMatches = sameCount && origMask.every((v, i) => v === trMask[i]);
  return {
    ok: sameCount && maskMatches,
    originalLines: origLines.length,
    translatedLines: trLines.length,
    emptyMaskMatches: maskMatches,
  };
}

/** Check if text has orphan lines (single lexical word on a line) */
export function hasOrphanLines(text: string): boolean {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) return false;
  return lines.some((line) => countLexicalWords(line) <= 1);
}
