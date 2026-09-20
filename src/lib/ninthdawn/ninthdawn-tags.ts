/**
 * The four things in a 9th Dawn Remake string that are not words.
 *
 * Measured against the 3,704-entry export rather than guessed: this single
 * pattern reproduces the tool's own `technical_tokens` field for every entry
 * with zero mismatches, so it is the format and not a guess that happens to
 * work on the first file.
 *
 *  • `[0]`, `[1]`… a value the engine drops in at runtime — a name, a number,
 *    a quantity — at that exact position in the sentence.
 *  • `[playername]` and `[cardgamename]` are named placeholders the engine
 *    substitutes.
 *  • `[c=0]`, `[p=1]`, `[i=2]`… colour, parameter and item-reference codes the
 *    engine reads; not prose.
 *  • `<b>` `</b>` `<i>` `</i>` `<br>` are literal formatting tags the game's
 *    own renderer reads (bold, italic, line break) — not real HTML, but not
 *    words either.
 */
export const NINTHDAWN_TAG_RE = /<\/?b>|<\/?i>|<br>|\[playername\]|\[cardgamename\]|\[[a-z]=\d+\]|\[\d+\]/g;

export function extractNinthDawnTags(text: string): string[] {
  return text.match(NINTHDAWN_TAG_RE) ?? [];
}

export function validateNinthDawnTags(original: string, translation: string) {
  const expected = extractNinthDawnTags(original);
  const actual = extractNinthDawnTags(translation);
  const valid = expected.length === actual.length && expected.every((tag, index) => tag === actual[index]);
  return {
    valid,
    expected,
    actual,
    reason: valid
      ? undefined
      : `يجب إبقاء رموز 9th Dawn Remake بالترتيب نفسه: ${expected.join(" ") || "لا توجد"} (قيم/تنسيق يضعها المحرّك).`,
  };
}

/**
 * Repairs only an unambiguous terminal run of tokens.
 *
 * Most of these tokens sit inline inside a sentence — "Are you sure you want
 * to evolve [0] into [1]?" — where moving one would change what the player
 * reads. Only a clean trailing run the translation dropped entirely is safe
 * to reattach; anything else is left for the translator to look at.
 */
export function repairNinthDawnTags(original: string, translation: string): { text: string; changed: boolean } {
  if (validateNinthDawnTags(original, translation).valid) return { text: translation, changed: false };
  const suffix = original.match(/((?:<\/?b>|<\/?i>|<br>|\[playername\]|\[cardgamename\]|\[[a-z]=\d+\]|\[\d+\])\s*)+$/)?.[0]?.trim();
  if (!suffix || !translation.replace(NINTHDAWN_TAG_RE, "").trim()) return { text: translation, changed: false };
  const candidate = `${translation.replace(NINTHDAWN_TAG_RE, "").trimEnd()}${suffix}`;
  return validateNinthDawnTags(original, candidate).valid ? { text: candidate, changed: true } : { text: translation, changed: false };
}
