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
import { tokenize, splitOnHardBreaks, detokenize, hardBreaksEqual } from "./text-tokens";

const TAG_SHIELD_PATTERN = /[\uE000-\uE0FF]+|\\?\[\s*\/?\s*\w+\s*:[^\]]*?\s*\\?\]|\d+\s*\\?\[[A-Z]{2,10}\\?\]|\\?\[[A-Z]{2,10}\\?\]\s*\d+|\\?\[\s*[A-Za-z][A-Za-z0-9]*(?:[ '\/-]+[A-Za-z0-9]+)*\s*\\?\]|\[\s*\w+\s*=\s*\w[^\]]*\]|\{\s*\w+\s*:\s*\w[^}]*\}|\{[\w]+\}|[\uFFF9-\uFFFC]+/g;

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

function countLexicalWords(line: string): number {
  const tokens = line.split(/\s+/).filter(Boolean);
  let count = 0;
  for (const token of tokens) {
    if (/^◆\d+◆$/.test(token)) continue;
    if (/^TAG_\d+$/i.test(token)) continue;
    if (/^[\p{P}\p{S}]+$/u.test(token)) continue;
    if (/[\p{L}\p{N}]/u.test(token)) count++;
  }
  return count;
}

function scoreSplit(lines: string[]): number {
  if (lines.length <= 1) return 0;
  const lengths = lines.map((l) => l.length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const maxLen = Math.max(...lengths);
  const minLen = Math.min(...lengths);
  let cost = 0;
  // Strong penalty for imbalance between longest and shortest line
  const spread = maxLen - minLen;
  cost += spread * spread * 2;
  for (let i = 0; i < lines.length; i++) {
    const dev = lengths[i] - avg;
    cost += dev * dev;
    // Penalize lines that are far below average (under 60% of avg)
    if (lengths[i] < avg * 0.6 && lines.length > 1) {
      const shortBy = avg * 0.6 - lengths[i];
      cost += shortBy * shortBy * 3;
    }
    if (i > 0 && i < lines.length - 1) {
      const lexical = countLexicalWords(lines[i]);
      if (lexical <= 1) cost += 50000;
      if (lexical === 2 && lengths[i] < 10) cost += 5000;
    }
  }
  return cost;
}


function fixOrphans(lines: string[]): string[] {
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
          result[1] = `${result[0]} ${result[1]}`.replace(/\s{2,}/g, ' ').trim();
          result.splice(0, 1);
        } else if (i === result.length - 1) {
          result[i - 1] = `${result[i - 1]} ${result[i]}`.replace(/\s{2,}/g, ' ').trim();
          result.splice(i, 1);
        } else {
          const prevLen = result[i - 1].length;
          const nextLen = result[i + 1].length;
          if (prevLen <= nextLen) {
            result[i - 1] = `${result[i - 1]} ${result[i]}`.replace(/\s{2,}/g, ' ').trim();
            result.splice(i, 1);
          } else {
            result[i + 1] = `${result[i]} ${result[i + 1]}`.replace(/\s{2,}/g, ' ').trim();
            result.splice(i, 1);
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
 * Internal: balance a SINGLE chunk (no [XENO:n ] inside) into lines using DP.
 */
function balanceChunk(chunk: string, limit: number, hardMax: number, maxLines?: number): string {
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
  bestResult = fixOrphans(bestResult);
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

/** Check if text has orphan lines (single lexical word on a line) */
export function hasOrphanLines(text: string): boolean {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) return false;
  return lines.some((line) => countLexicalWords(line) <= 1);
}
