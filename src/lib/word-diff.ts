/**
 * Word-level diff using LCS (Longest Common Subsequence).
 * Returns ops: 'equal' | 'add' | 'del' for rendering colored diffs
 * between an old and new Arabic translation.
 *
 * Tokenization preserves whitespace as its own equal tokens so the
 * rendered output keeps original spacing intact.
 */

export type DiffOp = "equal" | "add" | "del";
export interface DiffToken {
  op: DiffOp;
  text: string;
}

function tokenize(s: string): string[] {
  // Split on whitespace boundaries but keep the separators.
  return s.split(/(\s+)/).filter((t) => t.length > 0);
}

/** LCS table → diff ops. O(n*m) — fine for translation-sized strings. */
export function diffWords(oldStr: string, newStr: string): DiffToken[] {
  const a = tokenize(oldStr || "");
  const b = tokenize(newStr || "");
  const n = a.length;
  const m = b.length;

  // Build LCS length table.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffToken[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: "equal", text: a[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ op: "del", text: a[i] });
      i++;
    } else {
      out.push({ op: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) { out.push({ op: "del", text: a[i++] }); }
  while (j < m) { out.push({ op: "add", text: b[j++] }); }
  return out;
}
