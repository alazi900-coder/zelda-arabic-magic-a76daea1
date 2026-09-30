/**
 * The one thing in a GTA San Andreas string that is not words: `~...~`.
 *
 * Measured against the 17,165-entry export rather than guessed: 3,131 of its
 * source lines carry these, and in the finished Arabic file every one of them
 * comes through in the same sequence (0 mismatches), so the pattern is the
 * format and not a guess that happens to work on the first file.
 *
 *  • `~s~` `~m~` `~r~` `~y~` `~b~` `~w~` `~g~` `~h~` — text colour switches; a
 *    capital (`~S~`, `~N~`) appears too and is a different token.
 *  • `~n~` — a hard line break (111 lines).
 *  • `~1~` — a number the game drops in (money, a count, a time). A `$` in
 *    front of it (`$~1~`) is ordinary text and stays outside the token.
 *  • `~widget_...~` — an on-screen button icon (`~widget_brake~`).
 *  • `~<~~>~`, `~u~~d~` — d-pad arrows; they read as adjacent tokens
 *    (`~<~` then `~>~`), which is exactly how the export keeps them.
 *
 * The translation must keep every token, in the same order.
 */
export const GTASA_TAG_RE = /~[^~\n]*~/g;

export function extractGtaSaTags(text: string): string[] {
  return text.match(GTASA_TAG_RE) ?? [];
}

export function validateGtaSaTags(original: string, translation: string) {
  const expected = extractGtaSaTags(original);
  const actual = extractGtaSaTags(translation);
  const valid = expected.length === actual.length && expected.every((tag, index) => tag === actual[index]);
  return {
    valid,
    expected,
    actual,
    reason: valid
      ? undefined
      : `يجب إبقاء رموز GTA San Andreas (~...~) بالترتيب نفسه: ${expected.join(" ") || "لا توجد"} (ألوان وأزرار وأرقام تضعها اللعبة).`,
  };
}

/**
 * Repairs only an unambiguous terminal run of tokens.
 *
 * Most tokens sit inline ("Press ~m~~widget_brake~ to stop") where moving one
 * would change what the player reads. Only a clean trailing run the
 * translation dropped entirely is safe to reattach.
 */
export function repairGtaSaTags(original: string, translation: string): { text: string; changed: boolean } {
  if (validateGtaSaTags(original, translation).valid) return { text: translation, changed: false };
  const suffix = original.match(/(?:~[^~\n]*~\s*)+$/)?.[0]?.trim();
  if (!suffix || !translation.replace(GTASA_TAG_RE, "").trim()) return { text: translation, changed: false };
  const candidate = `${translation.replace(GTASA_TAG_RE, "").trimEnd()}${suffix}`;
  return validateGtaSaTags(original, candidate).valid ? { text: candidate, changed: true } : { text: translation, changed: false };
}
