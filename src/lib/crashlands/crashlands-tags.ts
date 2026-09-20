/**
 * The two things in a Crashlands string that are not words.
 *
 * Measured against the 9,132-entry export rather than guessed: `%r` appears 45
 * times and `#` 11 times, and nothing else does. The earlier pattern also
 * claimed `{…}`, `<…>`, `\n` and URLs, none of which occur in the game's text
 * at all -- a tag list longer than the game's own vocabulary teaches the
 * translator to distrust the highlighting.
 *
 *  • `%r` is a value the engine drops in at runtime: "deals %r% bonus damage",
 *    "press %r to join". The `%` that follows it in the first example is an
 *    ordinary percent sign, so the token is `%r` and the rest is prose.
 *  • `#` is a line break. Losing one runs two lines together, which is why it
 *    belongs in this pattern and not in a separate count the editor never
 *    shows.
 *
 * A bare `%` is left alone: "-25% physical resistance" is a sentence, not a
 * token.
 */
export const CRASHLANDS_TAG_RE = /%r|#/g;

export function extractCrashlandsTags(text: string): string[] {
  return text.match(CRASHLANDS_TAG_RE) ?? [];
}

export function validateCrashlandsTags(original: string, translation: string) {
  const expected = extractCrashlandsTags(original);
  const actual = extractCrashlandsTags(translation);
  const valid = expected.length === actual.length && expected.every((tag, index) => tag === actual[index]);
  return {
    valid,
    expected,
    actual,
    reason: valid
      ? undefined
      : `يجب إبقاء رموز Crashlands بالترتيب نفسه: ${expected.join(" ") || "لا توجد"} (‎%r قيمة يضعها المحرّك، و# فاصل سطر).`,
  };
}

/**
 * Repairs only an unambiguous terminal run of tokens.
 *
 * An inline `%r` sits inside a sentence and a `#` decides where a line breaks;
 * moving either to the end would change what the player reads, so anything
 * that is not a clean suffix is left for the translator to look at.
 */
export function repairCrashlandsTags(original: string, translation: string): { text: string; changed: boolean } {
  if (validateCrashlandsTags(original, translation).valid) return { text: translation, changed: false };
  const suffix = original.match(/((?:%r|#)\s*)+$/)?.[0]?.trim();
  if (!suffix || !translation.replace(CRASHLANDS_TAG_RE, "").trim()) return { text: translation, changed: false };
  const candidate = `${translation.replace(CRASHLANDS_TAG_RE, "").trimEnd()}${suffix}`;
  return validateCrashlandsTags(original, candidate).valid ? { text: candidate, changed: true } : { text: translation, changed: false };
}

/**
 * Whether the English side is really Chinese.
 *
 * 5,711 of the entries come from `campaign_story_zh-cn.json`, a file whose name
 * says Chinese but whose contents are mostly untranslated English. 246 rows in
 * it are genuinely Chinese, and those are the ones a translator needs to find:
 * there is no English to work from, so they cannot be treated like the rest.
 */
export function isChineseSource(text: string): boolean {
  return /[㐀-䶿一-鿿豈-﫿]/.test(text);
}
