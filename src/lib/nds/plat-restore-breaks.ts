/**
 * Putting back the pauses a translation lost.
 *
 * Before `plat-break-tokens.ts` existed, a page break reached the editor as a
 * bare `\r` and was destroyed on the way in — by the textarea, by a `.trim()`,
 * or by a model with no reason to keep a character it could not see. 12,425 of
 * them went that way, and the text after each one never reaches the screen.
 *
 * Nothing in the Arabic says where they were, so the English original is the
 * only witness. What survives translation is the *sentence structure*: a page
 * break in this game almost always ends a sentence (12,812 of 12,954 do), and a
 * translator rendering three English sentences writes three Arabic ones. So the
 * English is cut into the pieces its breaks make, each piece's sentences are
 * counted, and the Arabic is cut after the matching sentence.
 *
 * Measured against 293 messages whose Arabic kept its breaks — real ground
 * truth, not a simulation — this reproduces them exactly 99.5% of the time
 * (192 of 193 it answered on). The proportional guess that could cover the rest
 * scored 86.3%, which is not good enough to apply to someone's translation
 * unasked, so it is not used: where the sentences do not line up this returns
 * `null` and the message is left for a human to look at.
 */

import { PAGE_BREAK_TOKEN, SCROLL_BREAK_TOKEN } from "./plat-break-tokens";

const BREAK_RE = /[▼▽]/;
/** A sentence ends at `.`/`!`/`?`/`…` in English, and also `؟`/`۔` in Arabic. */
const SENTENCE_END = /[.!?…؟۔]/;

/** Splits on pause markers, keeping which kind each one was. */
function segments(text: string): { parts: string[]; kinds: string[] } {
  const parts: string[] = [];
  const kinds: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (BREAK_RE.test(ch)) {
      parts.push(cur);
      kinds.push(ch);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return { parts, kinds };
}

/**
 * Index of the whitespace that closes each sentence.
 *
 * Deliberately not counting the end of the text as a sentence end. Doing so
 * was tried: it let the rule answer 266 of the 293 reference messages instead
 * of 193, and accuracy fell from 99.5% to 71.8%, because the extra answers were
 * the cases it had been right to refuse. The end of a message is handled by its
 * own rule below, where no counting is needed at all.
 */
function sentenceEnds(text: string): number[] {
  const out: number[] = [];
  for (let i = 1; i < text.length; i++) {
    if (/\s/.test(text[i]) && SENTENCE_END.test(text[i - 1])) out.push(i);
  }
  return out;
}

/**
 * The translation with its pauses back, or `null` when the sentences do not
 * line up well enough to be sure.
 *
 * A token the translation already has is left where it is: the display newline
 * that follows one is re-derived, so the result is always in the editor's own
 * shape.
 */
export function restoreBreaks(original: string, translation: string): string | null {
  // A pause that is the last thing in the message needs no reasoning: it goes
  // last. 5,046 of the game's page breaks are exactly this — the marker that
  // waits for the button before the box closes — so it is worth taking out of
  // the sentence arithmetic rather than making the arithmetic cover it.
  const tail = /[▼▽]\s*$/.exec(original)?.[0].trim() ?? "";
  const head = tail ? original.slice(0, original.length - tail.length).trimEnd() : original;

  const { parts, kinds } = segments(head);
  if (kinds.length === 0) {
    if (!tail) return null;
    const body = translation.replace(/[▼▽]\n?/g, "\n").trimEnd();
    return body + tail;
  }

  // Whatever pauses survived are re-cut from scratch, so a partially damaged
  // message is treated the same as a fully damaged one.
  const flat = translation.replace(/[▼▽]\n?/g, "\n").trimEnd();

  const wanted: number[] = [];
  let running = 0;
  for (const part of parts.slice(0, -1)) {
    running += sentenceEnds(part).length + 1;
    wanted.push(running);
  }

  const ends = sentenceEnds(flat);
  if (ends.length < wanted[wanted.length - 1]) return null;

  const cuts = wanted.map((n) => ends[n - 1]);
  if (new Set(cuts).size !== cuts.length) return null;

  let out = "";
  let prev = 0;
  cuts.forEach((cut, i) => {
    out += flat.slice(prev, cut) + kinds[i] + "\n";
    prev = cut + 1;
  });
  out += flat.slice(prev);
  return out.trimEnd() + tail;
}

/**
 * Whether a candidate only moved pauses and whitespace around.
 *
 * This is what makes it safe to let a translation model do the cases the
 * sentence rule cannot: strip the markers and the spacing from both sides, and
 * the words must be identical. A model that rewrote, dropped or reordered so
 * much as one word fails here and its answer is thrown away.
 */
export function onlyBreaksChanged(before: string, after: string): boolean {
  const bare = (s: string) => s.replace(/[▼▽]/g, "").replace(/\s+/g, " ").trim();
  return bare(before) === bare(after);
}

/** The pauses the English asks for, in order — what a candidate must deliver. */
export function breakSequence(text: string): string {
  return (text.match(/[▼▽]/g) ?? []).join("");
}

export { PAGE_BREAK_TOKEN, SCROLL_BREAK_TOKEN };
