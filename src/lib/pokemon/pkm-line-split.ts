/**
 * Breaking a translation so it fits the dialogue box.
 *
 * The engine does not wrap. Past the last cell of a line it keeps writing into
 * the background map, which is wider than the screen, so the tail reappears
 * outside the box at the opposite edge — and clearing the box never reaches
 * there, so it stays on screen through the next message and the one after.
 *
 * The only tool used here is `\n`. The paragraph and scroll codes (`{fb}`,
 * `{fa}`) would give a message more room, but they are technical codes: the
 * build compares the codes in a translation against the codes in the original
 * and refuses any line that gained or lost one, so a break invented here would
 * cost the whole line — it would stay English in the game, silently. Whether to
 * spend a code is the translator's call, made in the editor, where the build's
 * refusal is visible.
 *
 * So when two lines are not enough, this says so instead of guessing. Shortening
 * a sentence is a decision about meaning, and nothing here can make it.
 */

import { pkmLineWidth, pkmOverlongLines, PKM_DIALOGUE_LINE_PIXELS } from "./pkm-charmap";

/** How many lines the box shows at once — measured off the box itself. */
export const PKM_BOX_LINES = 2;

/** The codes that end a page, with the layout break the decoder puts after them. */
const SEGMENT_RE = /(\{f[ab]\}\n?)/;

export interface PkmSplitResult {
  text: string;
  /** True when the text came back different from what went in. */
  changed: boolean;
  /** Pages still too long for the box after wrapping — these need shortening. */
  unfittable: number;
}

/**
 * Wraps one page onto as few lines as its words allow.
 *
 * Existing breaks inside the page are re-flowed rather than kept: a break in the
 * wrong place is what put the page over in the first place, and keeping it would
 * only push the overflow onto the next line.
 */
function wrapPage(page: string): string[] {
  const words = page.split(/[ \n]+/).filter((w) => w.length > 0);
  if (words.length === 0) return [page];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (current !== "" && pkmLineWidth(candidate) > PKM_DIALOGUE_LINE_PIXELS) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current !== "") lines.push(current);
  return lines;
}

/**
 * Re-breaks a translation so every line fits the box.
 *
 * Leading and trailing spaces of a page are kept off the wrap and put back, so
 * a page the game indents is not silently trimmed.
 */
export function splitPkmLines(text: string): PkmSplitResult {
  if (pkmOverlongLines(text).length === 0) return { text, changed: false, unfittable: 0 };

  let unfittable = 0;
  const out = text
    .split(SEGMENT_RE)
    .map((part) => {
      if (SEGMENT_RE.test(part) && /^\{f[ab]\}\n?$/.test(part)) return part;
      const lead = part.match(/^[ \n]*/)![0];
      const tail = part.match(/[ \n]*$/)![0];
      const body = part.slice(lead.length, part.length - tail.length);
      if (body === "") return part;
      const lines = wrapPage(body);
      // A page that still needs a third line cannot be fixed by breaking: the
      // box shows two. Left as it was, and counted so the caller can say so.
      if (lines.length > PKM_BOX_LINES) {
        unfittable++;
        return part;
      }
      return lead + lines.join("\n") + tail;
    })
    .join("");

  return { text: out, changed: out !== text, unfittable };
}
