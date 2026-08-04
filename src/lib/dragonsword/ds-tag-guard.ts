/**
 * DragonSword Awakening's technical tokens, and the one that is not a token.
 *
 * Counted over the shipped Italian pak, all 42,661 lines:
 *
 *   </>                  2762   closes whatever style is open
 *   <LightOrange>        1224   and <orange> <Orange> <Yellow> <White>
 *   <big> <small>         356   <minibig> <MiniBig> <Bold> <DarkGray>
 *   {0} {1} {2} {3}       902   values the game substitutes at run time
 *   <actkey = "JUMP"/>     13   the button the player has bound
 *
 * And the reason this file exists rather than one regex over `<...>`:
 *
 *   <Una nota scarabocchiata da qualcuno>      16 times
 *
 * That is a line of prose in angle brackets — «a note scribbled by someone» —
 * and a guard that protected every `<…>` would refuse to let it be translated
 * and leave Italian in the game. So the styles are named, one by one, and
 * anything else between angle brackets is treated as words.
 */

/** Every style name the shipped text opens, lower-cased for comparison. */
const STYLES = [
  "orange", "lightorange", "yellow", "white", "darkgray", "darkgrey",
  "big", "small", "minibig", "bold", "italic", "red", "green", "blue", "gray", "grey",
];

/**
 * A style tag, its closer, an action-key tag, or a run-time value.
 *
 * Written out as one alternation so a caller can split on it and get the tags
 * back as their own pieces, the way the editor's highlighter wants them.
 */
export const DS_TAG_REGEX = new RegExp(
  `<\\/>|<(?:${STYLES.join("|")})>|<\\s*actkey\\s*=\\s*"[^"]*"\\s*\\/?>|\\{\\d+\\}`,
  "gi"
);

/** Every technical token in a line, in the order it appears. */
export function dsTags(text: string): string[] {
  return [...(text || "").matchAll(new RegExp(DS_TAG_REGEX.source, "gi"))].map((m) => m[0]);
}

export interface DsTagDiff {
  missing: string[];
  extra: string[];
  /** False when the same tokens came back in a different order. */
  sameOrder: boolean;
}

/**
 * What a translation did to the tokens.
 *
 * Order is compared as well as count: `{0}` and `{1}` are two different values
 * the game fills in, so swapping them puts the wrong one in the sentence even
 * though nothing was lost.
 */
export function diffDsTags(original: string, translation: string): DsTagDiff {
  const a = dsTags(original);
  const b = dsTags(translation);
  const left = new Map<string, number>();
  for (const t of a) left.set(t.toLowerCase(), (left.get(t.toLowerCase()) ?? 0) + 1);
  const right = new Map<string, number>();
  for (const t of b) right.set(t.toLowerCase(), (right.get(t.toLowerCase()) ?? 0) + 1);
  const missing: string[] = [];
  const extra: string[] = [];
  for (const [t, n] of left) {
    const m = right.get(t) ?? 0;
    for (let i = 0; i < n - m; i++) missing.push(t);
  }
  for (const [t, n] of right) {
    const m = left.get(t) ?? 0;
    for (let i = 0; i < n - m; i++) extra.push(t);
  }
  const sameOrder =
    a.length === b.length && a.every((t, i) => t.toLowerCase() === b[i].toLowerCase());
  return { missing, extra, sameOrder };
}

/** True when the line carries nothing but tokens, spaces and digits. */
export function dsIsTechnicalOnly(text: string): boolean {
  const bare = (text || "").replace(new RegExp(DS_TAG_REGEX.source, "gi"), "").trim();
  return bare.length === 0 || /^[\d\s.,:;\-_/\\]+$/.test(bare);
}
