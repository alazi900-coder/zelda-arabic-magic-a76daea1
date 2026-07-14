// Manual bulk line-splitting for Risen 1 Arabic translations. The game engine
// auto-wraps long lines, but because Risen Arabic text is stored visually
// reversed, engine wrapping makes multi-row text read bottom-to-top.
// Pre-splitting at word boundaries (~40 chars) renders correctly top-to-bottom
// with no engine wrapping. Confirmed by in-game testing.
import { RISEN_TAG_REGEX } from "./risen-tag-guard";
import { detectBreakStyle, balanceChunk } from "./balance-lines";
import type { ExtractedEntry } from "@/components/editor/types";

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** True if `text` contains at least one Arabic character. */
export function hasArabicText(text: string): boolean {
  return ARABIC_RE.test(text || "");
}

/** Length of the longest logical line (split on \r\n|\n) in `text`. */
export function getLongestLineLength(text: string): number {
  if (!text) return 0;
  return Math.max(0, ...text.split(/\r\n|\n/).map((l) => l.length));
}

/**
 * Split every logical line longer than `limit` at word boundaries (spaces
 * only — never inside a word). Existing line breaks are preserved exactly;
 * only over-limit lines get further split, using the same DP word-balancer
 * as the Xenoblade line tools (`balanceChunk`) so words are distributed
 * evenly instead of greedily filling each line first — a greedy fill can
 * strand a single short word alone on a line when the next word doesn't
 * fit, forcing an extra line. `hardMax` is passed as `limit` itself (no
 * slack) to keep the existing guarantee that every resulting line is
 * within `limit`. A protected Risen tag (<Tag>, $(name), ...) never
 * contains a space, so treating whitespace-delimited "words" as atomic
 * units automatically keeps every tag intact — a tag that would cross the
 * limit moves whole to the next line, like any word. A single word longer
 * than `limit` stays whole on its own (over-limit) line.
 */
export function splitLongLines(text: string, limit: number, breakStyle: "\r\n" | "\n" = "\r\n"): string {
  const lines = (text || "").split(/\r\n|\n/);
  const outLines: string[] = [];
  for (const line of lines) {
    if (line.length <= limit) {
      outLines.push(line);
      continue;
    }
    outLines.push(...balanceChunk(line, limit, limit).split("\n"));
  }
  return outLines.join(breakStyle);
}

/** Joins every logical line back into one, replacing each break with a single
 * space. Since splitLongLines only ever breaks at a word boundary (a space),
 * this is its exact inverse — no two words end up glued together. */
export function joinLines(text: string): string {
  return (text || "").split(/\r\n|\n/).join(" ");
}

export interface LineSplitPlan {
  /** Keys of entries the tool would modify. */
  targetKeys: string[];
  /** key -> new (split) translation, only for targeted entries — pass to updateTranslationsBatch to apply. */
  updates: Record<string, string>;
  /** key -> original translation before splitting, only for targeted entries — pass to updateTranslationsBatch to undo. */
  snapshot: Record<string, string>;
}

/**
 * Pure planning step for the bulk line-split tool: given the entries
 * currently visible (already filtered/searched by the caller — this
 * function does no filtering of its own) and their translations, decides
 * which entries need splitting and computes the split result + an undo
 * snapshot. Kept separate from the React component so it can be tested
 * without any UI.
 */
export function planLineSplit(
  entries: Pick<ExtractedEntry, "msbtFile" | "index" | "original">[],
  translations: Record<string, string>,
  limit: number
): LineSplitPlan {
  const targetKeys: string[] = [];
  const updates: Record<string, string> = {};
  const snapshot: Record<string, string> = {};

  for (const e of entries) {
    const key = `${e.msbtFile}:${e.index}`;
    const current = translations[key] || "";
    if (!current.trim() || !hasArabicText(current)) continue;
    if (!current.split(/\r\n|\n/).some((l) => l.length > limit)) continue;

    const breakStyle = detectBreakStyle(e.original);
    targetKeys.push(key);
    snapshot[key] = current;
    updates[key] = splitLongLines(current, limit, breakStyle);
  }

  return { targetKeys, updates, snapshot };
}

/**
 * Pure planning step for joining multi-line translations back into one line.
 * Targets any entry (within the caller-filtered `entries`) whose current
 * translation has more than one line, regardless of length or origin —
 * mirrors planLineSplit's shape so the same undo/apply flow works for both.
 */
export function planLineJoin(
  entries: Pick<ExtractedEntry, "msbtFile" | "index">[],
  translations: Record<string, string>
): LineSplitPlan {
  const targetKeys: string[] = [];
  const updates: Record<string, string> = {};
  const snapshot: Record<string, string> = {};

  for (const e of entries) {
    const key = `${e.msbtFile}:${e.index}`;
    const current = translations[key] || "";
    if (!current.trim() || !/\r\n|\n/.test(current)) continue;

    targetKeys.push(key);
    snapshot[key] = current;
    updates[key] = joinLines(current);
  }

  return { targetKeys, updates, snapshot };
}

/** Re-exported so callers checking tag integrity don't need a second import. */
export { RISEN_TAG_REGEX };
