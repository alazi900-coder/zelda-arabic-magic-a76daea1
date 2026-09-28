/**
 * Missing spaces that are safe to restore without reading the sentence:
 *   - ة and ى only ever end a word, so a letter right after one starts the
 *     next word (الطاقة السحريةمن → الطاقة السحرية من, left by replacing
 *     "Psynergy" and losing the space after it).
 *   - a comma (, or ،) is followed by a space before a letter (أخيرا,لكن).
 * Control codes (\xNN) and everything else are left as they are.
 */
const ARABIC_LETTER = "ء-ي";
const WORD_END_GLUE = new RegExp(`([ةى])(?=[${ARABIC_LETTER}])`, "g");
const COMMA_GLUE = new RegExp(`([,،])(?=[${ARABIC_LETTER}A-Za-z])`, "g");

export function fixGoldenSunSpacing(text: string): string {
  return text.replace(WORD_END_GLUE, "$1 ").replace(COMMA_GLUE, "$1 ");
}

/** The translations the fix would change: key -> fixed text. */
export function goldenSunSpacingFixes(translations: Record<string, string>): Record<string, string> {
  const fixes: Record<string, string> = {};
  for (const [key, text] of Object.entries(translations)) {
    if (!text) continue;
    const fixed = fixGoldenSunSpacing(text);
    if (fixed !== text) fixes[key] = fixed;
  }
  return fixes;
}
