/**
 * The things in an Inazuma Eleven string that are not words.
 *
 * Measured against every text-bearing file in the cartridge (88,663 strings
 * from evet, mcht, unitbase.STR, item.STR, command.STR, games.STR,
 * rpgtitle.STR, team.pkb and fmt.pkb) rather than guessed:
 *
 *  • `\n` -- 30,051 times. A line break, stored as the two characters `\`
 *    and `n`, not as a 0x0A byte. Losing one runs two lines together.
 *  • `\f` -- 2,432 times. A page break: everything after it is a second box
 *    the player taps to reach. Losing one pushes that text off the bottom.
 *  • `%1F` `%2F` `%3F` `%4F` -- 11,011 times between them. Slots the engine
 *    fills at runtime with a name or a noun.
 *  • `%d` `%2d` `%4d` and `%s` -- 3,878 times. printf-style number and string
 *    slots, the same idea in the C library's spelling.
 *
 * A bare `%` is left alone: "30% cheaper than shops" is a sentence, and only
 * three strings in the whole cartridge use one that way.
 */
export const INAZUMA_TAG_RE = /\\[nf]|%[1-4]F|%\d?d|%s/g;

export function extractInazumaTags(text: string): string[] {
  return text.match(INAZUMA_TAG_RE) ?? [];
}

export interface InazumaTagCheck {
  valid: boolean;
  expected: string[];
  actual: string[];
  reason?: string;
}

/**
 * Whether a translation kept every token the original carries.
 *
 * Order is compared too, not just the multiset: `%1F` and `%2F` are two
 * different values the engine substitutes, so swapping them puts the wrong
 * word in each place rather than merely reordering the sentence.
 */
export function validateInazumaTags(original: string, translation: string): InazumaTagCheck {
  const expected = extractInazumaTags(original);
  const actual = extractInazumaTags(translation);
  const valid = expected.length === actual.length && expected.every((tag, i) => tag === actual[i]);
  return {
    valid,
    expected,
    actual,
    reason: valid
      ? undefined
      : `يجب إبقاء رموز إينازوما بالعدد والترتيب نفسيهما: ${expected.join(" ") || "لا توجد"} (‎\\n سطر جديد، ‎\\f صفحة جديدة، و‎%1F/%d/%s قيم تضعها اللعبة).`,
  };
}

/**
 * Whether a line is one the player can actually read in this build.
 *
 * Roughly 40% of the cartridge's kind-1 records are untranslated Japanese
 * left in the European release -- half of them internal state dumps for the
 * scouting system ("PartyCount=%d", "[ScoutLv=91]"), the rest dialogue no
 * English script ever replaced. Neither is English to translate from, and
 * feeding either to a machine translator produces nonsense, so they are kept
 * out of the editor rather than shown as thousands of unreadable rows.
 *
 * The test is the raw Shift-JIS byte: this reader keeps one byte per
 * character, so any value at or above 0x80 is part of a Japanese pair.
 */
export function isInazumaTranslatable(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) >= 0x80) return false;
  }
  return text.trim().length > 0;
}
