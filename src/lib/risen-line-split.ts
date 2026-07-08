// Manual bulk line-splitting for Risen 1 Arabic translations. The game engine
// auto-wraps long lines, but because Risen Arabic text is stored visually
// reversed, engine wrapping makes multi-row text read bottom-to-top.
// Pre-splitting at word boundaries (~40 chars) renders correctly top-to-bottom
// with no engine wrapping. Confirmed by in-game testing.
import { RISEN_TAG_REGEX } from "./risen-tag-guard";

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
 * only over-limit lines get further split. A protected Risen tag (<Tag>,
 * $(name), ...) never contains a space, so treating whitespace-delimited
 * "words" as atomic units automatically keeps every tag intact — a tag
 * that would cross the limit moves whole to the next line, like any word.
 * A single word longer than `limit` stays whole on its own (over-limit) line.
 */
export function splitLongLines(text: string, limit: number, breakStyle: "\r\n" | "\n" = "\r\n"): string {
  const lines = (text || "").split(/\r\n|\n/);
  const outLines: string[] = [];
  for (const line of lines) {
    if (line.length <= limit) {
      outLines.push(line);
      continue;
    }
    const words = line.split(" ");
    let current = "";
    for (const word of words) {
      if (current === "") {
        current = word;
      } else if (current.length + 1 + word.length <= limit) {
        current += " " + word;
      } else {
        outLines.push(current);
        current = word;
      }
    }
    outLines.push(current);
  }
  return outLines.join(breakStyle);
}

/** Re-exported so callers checking tag integrity don't need a second import. */
export { RISEN_TAG_REGEX };
