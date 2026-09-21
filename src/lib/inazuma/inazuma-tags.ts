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
 * Repairs only an unambiguous trailing run of tokens the translation dropped
 * entirely.
 *
 * Most of these tokens sit inline inside a sentence -- "%s joined you!" --
 * where guessing a position would put the engine's substitution in the wrong
 * place. Only a clean run at the very end the translation lost outright is
 * safe to reattach; anything else (a token missing from the middle, or one
 * swapped for another) is left for the translator to look at.
 */
export function repairInazumaTags(original: string, translation: string): { text: string; changed: boolean } {
  if (validateInazumaTags(original, translation).valid) return { text: translation, changed: false };
  const suffix = original.match(/((?:\\[nf]|%[1-4]F|%\d?d|%s)\s*)+$/)?.[0]?.trim();
  if (!suffix || !translation.replace(INAZUMA_TAG_RE, "").trim()) return { text: translation, changed: false };
  const candidate = `${translation.replace(INAZUMA_TAG_RE, "").trimEnd()}${suffix}`;
  return validateInazumaTags(original, candidate).valid ? { text: candidate, changed: true } : { text: translation, changed: false };
}

/**
 * A scene id the script addresses a cutscene by -- `mr01b04`, `mr02i27`.
 * 173 of them sit in the dialogue archive as ordinary records. Narrow on
 * purpose: player names (Gouenji, Kabeyama) are single ASCII tokens too, and
 * those a translator does want.
 */
const SCENE_ID_RE = /^[a-z]{1,3}\d{1,3}[a-z]\d{1,3}[a-z]?$/;

/** Script switches, not text: only EncountON/OFF and HookTimerON/OFF exist. */
const ENGINE_FLAG_RE = /^[A-Za-z]+(?:ON|OFF)$/;

/**
 * Whether a line is one the player can actually read in this build.
 *
 * Three kinds of record are kept out of the editor, all measured against the
 * cartridge rather than guessed:
 *
 *  • Untranslated Japanese -- roughly 40% of the kind-1 records in this
 *    European release. Half are internal state dumps for the scouting system
 *    ("PartyCount=%d", "[ScoutLv=91]"), the rest dialogue no English script
 *    ever replaced. Neither is English to translate from, and a machine
 *    translation pass over either produces nonsense. The test is the raw
 *    Shift-JIS byte: this reader keeps one byte per character, so anything at
 *    or above 0x80 is half of a Japanese pair.
 *  • Scene ids (173) and engine switches (870), which the script reads and no
 *    screen ever prints.
 */
export function isInazumaTranslatable(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) >= 0x80) return false;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (SCENE_ID_RE.test(trimmed)) return false;
  if (ENGINE_FLAG_RE.test(trimmed)) return false;
  return true;
}
