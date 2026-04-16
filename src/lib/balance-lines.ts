/**
 * Client-side line balancing utility.
 * Mirrors the logic from the translate-entries edge function.
 */

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
        if (lexicalCount <= 1 && isMiddleLine) cost += 50000;
        if (i - j === 1 && isMiddleLine) cost += 50000;
        if (ll < ideal * 0.4 && lexicalCount < 3) cost += 5000;

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

/** Rebalance text lines to fix orphan words. Client-side mirror of edge function logic. */
export function balanceLines(text: string, targetMax?: number, maxLines?: number): string {
  const limit = targetMax ?? TARGET_MAX;
  const hardMax = limit + 6;
  const stripped = text.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
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

  // Enforce maxLines cap if provided
  if (maxLines && maxLines > 0) {
    numLines = Math.min(numLines, maxLines);
  }

  let bestResult: string[] | null = null;
  let bestCost = Infinity;

  const upperBound = maxLines ? Math.min(numLines, maxLines) : Math.min(numLines + 1, words.length);
  for (let nLines = numLines; nLines <= upperBound; nLines++) {
    const result = dpSplitShielded(words, nLines, wordDisplayLen, hardMax);
    if (result) {
      const cost = scoreSplit(
        result.map((line) => {
          const displayLine = line
            .split(/\s+/)
            .map((w) => 'x'.repeat(wordDisplayLen(w)))
            .join(' ');
          return displayLine;
        })
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

/** Split text evenly into N lines by word count (no character limit, only line count matters) */
export function splitEvenlyByLines(text: string, numLines: number): string {
  const flat = text.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
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

  // Use DP to split evenly without hard character limit
  const result = dpSplitShielded(words, numLines, wordDisplayLen, 99999);
  if (!result) {
    // Fallback: distribute words evenly
    const perLine = Math.ceil(words.length / numLines);
    const lines: string[] = [];
    for (let i = 0; i < numLines; i++) {
      lines.push(words.slice(i * perLine, Math.min((i + 1) * perLine, words.length)).join(' '));
    }
    return lines.filter(Boolean).map(l => unshieldTagsAfterBalance(l, map)).join('\n');
  }

  return result.map(line => unshieldTagsAfterBalance(line, map)).join('\n');
}

/** Check if text has orphan lines (single lexical word on a line) */
export function hasOrphanLines(text: string): boolean {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) return false;
  return lines.some((line) => countLexicalWords(line) <= 1);
}
