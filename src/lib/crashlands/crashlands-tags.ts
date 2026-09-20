/** Crashlands strings use a small runtime language. These tokens are never prose. */
export const CRASHLANDS_TAG_RE = /%%|%[A-Za-z](?:%)?|\\[nrt]|https?:\/\/[^\s#]+|\{[^{}]*\}|<[^<>]*>/g;

export function extractCrashlandsTags(text: string): string[] {
  return text.match(CRASHLANDS_TAG_RE) ?? [];
}

export function validateCrashlandsTags(original: string, translation: string) {
  const expected = extractCrashlandsTags(original);
  const actual = extractCrashlandsTags(translation);
  const hashesExpected = (original.match(/#/g) ?? []).length;
  const hashesActual = (translation.match(/#/g) ?? []).length;
  const valid = expected.length === actual.length && expected.every((tag, index) => tag === actual[index]) && hashesExpected === hashesActual;
  return { valid, expected, actual, reason: valid ? undefined : `يجب إبقاء رموز Crashlands بالترتيب نفسه (${expected.join(" ") || "لا توجد"}) وفواصل # بالعدد نفسه.` };
}

/** Only repairs an unambiguous terminal token sequence. Inline tokens control
 * layout or substitution and remain visible for the translator to review. */
export function repairCrashlandsTags(original: string, translation: string): { text: string; changed: boolean } {
  if (validateCrashlandsTags(original, translation).valid) return { text: translation, changed: false };
  const suffix = original.match(/((?:(?:%%|%[A-Za-z](?:%)?|\\[nrt]|\{[^{}]*\}|<[^<>]*>)\s*)+)$/)?.[1]?.trim();
  if (!suffix || !translation.replace(CRASHLANDS_TAG_RE, "").trim()) return { text: translation, changed: false };
  const candidate = `${translation.replace(CRASHLANDS_TAG_RE, "").trimEnd()}${suffix}`;
  return validateCrashlandsTags(original, candidate).valid ? { text: candidate, changed: true } : { text: translation, changed: false };
}
