/**
 * A line break that sits directly after a tag has a place, and the translation
 * has to keep it.
 *
 * The editor draws every `\n` in the original as a small arrow. Most of those
 * arrows sit at the end of a sentence, and where the matching break belongs in
 * an Arabic translation is a judgement — the words are different, so there is
 * no position to copy. That case belongs to line balancing.
 *
 * An arrow directly after a tag is not that case. Its place is exact: right
 * after that tag. In Pokémon Emerald, measured over 18,828 lines, 7,070 of the
 * 7,241 `{fb}` codes and 1,554 of the 1,564 `{fa}` codes are followed by one —
 * so a translation that runs straight on after `{fb}` has lost a break the
 * game will not put back, and nothing else in the tool notices, because the
 * *count* of breaks can still match.
 *
 * The rule, and it is deliberately about position and not about count:
 *
 *   if the nth tag in the original is followed by a line break,
 *   the nth tag in the translation must be followed by one too.
 *
 * Comparing by position in the tag sequence is safe because the build already
 * refuses any line whose tags changed in number or in order — so if a line
 * reaches here at all, its nth tag is the same tag in both texts.
 *
 * "Tag" means exactly what the translator sees highlighted on screen; the
 * pattern comes from `editor-tag-pattern.ts`, which the entry card uses to
 * draw them. Not a second list that could drift away from the first.
 *
 * The counting and the repair walk the same list in the same order, so what is
 * reported and what is fixed can never disagree.
 */

import { editorTagPattern } from "@/lib/editor-tag-pattern";

interface Anchor {
  /** Index just past the tag. */
  after: number;
  /** Whether a line break follows it there. */
  hasNewline: boolean;
}

/** Every tag in the text, with whether a line break sits right behind it. */
function anchors(text: string): Anchor[] {
  const out: Anchor[] = [];
  for (const m of text.matchAll(editorTagPattern())) {
    const after = m.index! + m[0].length;
    out.push({ after, hasNewline: text[after] === "\n" });
  }
  return out;
}

/**
 * How many line breaks the translation is missing right behind a tag.
 *
 * Tags past the end of the shorter list are ignored rather than counted as
 * missing: a translation whose tags do not line up with the original has a
 * different problem, and the build reports that one.
 */
export function countMissingTagNewlines(original: string, translation: string): number {
  if (!original || !translation) return 0;
  const o = anchors(original);
  if (o.length === 0) return 0;
  const t = anchors(translation);
  let missing = 0;
  for (let i = 0; i < Math.min(o.length, t.length); i++) {
    if (o[i].hasNewline && !t[i].hasNewline) missing++;
  }
  return missing;
}

/**
 * Puts those line breaks back.
 *
 * Spaces that were sitting after the tag are swallowed, so the new line starts
 * on a word rather than on a blank — «مبتدئ؟{fb} هل تعرف» becomes «مبتدئ؟{fb}»
 * and then a line beginning «هل تعرف». Nothing else in the text is touched:
 * no rebalancing, no reflowing, no other break moved.
 */
export function fixTagNewlines(original: string, translation: string): string {
  if (!original || !translation) return translation;
  const o = anchors(original);
  if (o.length === 0) return translation;
  const t = anchors(translation);

  // Right to left, so an insertion never moves an anchor not yet handled.
  let out = translation;
  for (let i = Math.min(o.length, t.length) - 1; i >= 0; i--) {
    if (!o[i].hasNewline || t[i].hasNewline) continue;
    const at = t[i].after;
    let skip = at;
    while (skip < out.length && (out[skip] === " " || out[skip] === "\t")) skip++;
    out = `${out.slice(0, at)}\n${out.slice(skip)}`;
  }
  return out;
}
