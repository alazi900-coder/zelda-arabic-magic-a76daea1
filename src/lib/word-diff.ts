/**
 * Word-level diff using LCS (Longest Common Subsequence).
 * Returns ops: 'equal' | 'add' | 'del' for rendering colored diffs
 * between an old and new Arabic translation.
 *
 * Tokenization preserves whitespace as its own equal tokens so the
 * rendered output keeps original spacing intact.
 *
 * Performance:
 *  - O(1) fast paths for empty / identical / single-side inputs.
 *  - Common prefix + suffix trimming before LCS — drastically reduces
 *    work for typical edits (small change inside a long string).
 *  - Hard cap on LCS cell count; beyond it we fall back to a coarse
 *    "del-all / add-all" diff so the UI never blocks on huge inputs.
 *  - Uses Uint16Array rows (no full n*m matrix) with backtracking via
 *    a recomputed Hirschberg-style split — but kept simple: we still
 *    allocate the table only when within budget.
 */

export type DiffOp = "equal" | "add" | "del";
export interface DiffToken {
  op: DiffOp;
  text: string;
}

const LCS_CELL_BUDGET = 40_000; // ~40k cells ≈ instant; bigger → fallback

function tokenize(s: string): string[] {
  return s.split(/(\s+)/).filter((t) => t.length > 0);
}

export function diffWords(oldStr: string, newStr: string): DiffToken[] {
  // Fast paths
  if (!oldStr && !newStr) return [];
  if (oldStr === newStr) return oldStr ? [{ op: "equal", text: oldStr }] : [];
  if (!oldStr) return [{ op: "add", text: newStr }];
  if (!newStr) return [{ op: "del", text: oldStr }];

  const a = tokenize(oldStr);
  const b = tokenize(newStr);

  // Strip common prefix
  let start = 0;
  const minLen = Math.min(a.length, b.length);
  while (start < minLen && a[start] === b[start]) start++;

  // Strip common suffix
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const prefix: DiffToken[] = start > 0
    ? [{ op: "equal", text: a.slice(0, start).join("") }]
    : [];
  const suffix: DiffToken[] = endA < a.length
    ? [{ op: "equal", text: a.slice(endA).join("") }]
    : [];

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;

  if (n === 0 && m === 0) return [...prefix, ...suffix];
  if (n === 0) return [...prefix, { op: "add", text: midB.join("") }, ...suffix];
  if (m === 0) return [...prefix, { op: "del", text: midA.join("") }, ...suffix];

  // Budget guard — fall back to coarse diff
  if (n * m > LCS_CELL_BUDGET) {
    return [
      ...prefix,
      { op: "del", text: midA.join("") },
      { op: "add", text: midB.join("") },
      ...suffix,
    ];
  }

  // LCS table (Uint16Array is plenty — token counts stay small after trim)
  const w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = midA[i] === midB[j]
        ? dp[(i + 1) * w + (j + 1)] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + (j + 1)]);
    }
  }

  const mid: DiffToken[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      mid.push({ op: "equal", text: midA[i] });
      i++; j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + (j + 1)]) {
      mid.push({ op: "del", text: midA[i++] });
    } else {
      mid.push({ op: "add", text: midB[j++] });
    }
  }
  while (i < n) mid.push({ op: "del", text: midA[i++] });
  while (j < m) mid.push({ op: "add", text: midB[j++] });

  return [...prefix, ...mid, ...suffix];
}
