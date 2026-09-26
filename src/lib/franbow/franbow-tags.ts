/**
 * Technical placeholders in a Fran Bow string, the same shape used across
 * this project's other JSON-export games (Crashlands, 9th Dawn Remake):
 * `{…}` runtime values, `<…>` literal formatting tags, `[…]` bracket codes,
 * `%s`/`%d` sprintf placeholders, and a literal `\n`.
 *
 * Checked against the full 7,280-entry export this session: none of these
 * appear anywhere in `source` (the game's dialogue is plain prose with only
 * ordinary punctuation), so `technical_tokens` comes back empty for every
 * entry today. The pattern is kept anyway as a safety net — a future export
 * (a different scene, a save-slot count, a percentage) may carry one, and
 * this is what protects it the same way the other games' guards do.
 */
export const FRANBOW_TAG_RE = /\{[^}]*\}|<[^>]*>|\[[^\]]*\]|%[a-zA-Z]|\\n/g;

export function extractFranBowTags(text: string): string[] {
  return text.match(FRANBOW_TAG_RE) ?? [];
}

export function validateFranBowTags(original: string, translation: string) {
  const expected = extractFranBowTags(original);
  const actual = extractFranBowTags(translation);
  const valid = expected.length === actual.length && expected.every((tag, index) => tag === actual[index]);
  return {
    valid,
    expected,
    actual,
    reason: valid
      ? undefined
      : `يجب إبقاء رموز Fran Bow التقنية بالترتيب نفسه: ${expected.join(" ") || "لا توجد"} (قيم/تنسيق يضعها المحرّك).`,
  };
}

/** Repairs only an unambiguous trailing run of tokens the translation dropped, same as 9th Dawn Remake's repair. */
export function repairFranBowTags(original: string, translation: string): { text: string; changed: boolean } {
  if (validateFranBowTags(original, translation).valid) return { text: translation, changed: false };
  const suffix = original.match(/((?:\{[^}]*\}|<[^>]*>|\[[^\]]*\]|%[a-zA-Z]|\\n)\s*)+$/)?.[0]?.trim();
  if (!suffix || !translation.replace(FRANBOW_TAG_RE, "").trim()) return { text: translation, changed: false };
  const candidate = `${translation.replace(FRANBOW_TAG_RE, "").trimEnd()}${suffix}`;
  return validateFranBowTags(original, candidate).valid ? { text: candidate, changed: true } : { text: translation, changed: false };
}
