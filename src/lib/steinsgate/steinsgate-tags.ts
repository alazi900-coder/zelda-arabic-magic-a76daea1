export const STEINSGATE_TAG_RE = /%(?:K|P|N|CE|CF[0-9A-Fa-f]{6}|L\d+|W\d+|[A-Z][A-Z0-9_]*)/g;

export function extractSteinsGateTags(text: string): string[] {
  return text.match(STEINSGATE_TAG_RE) ?? [];
}

export interface SteinsGateTagValidation {
  valid: boolean;
  expected: string[];
  actual: string[];
  reason?: string;
}

export function validateSteinsGateTags(original: string, translation: string): SteinsGateTagValidation {
  const expected = extractSteinsGateTags(original);
  const actual = extractSteinsGateTags(translation);
  const valid = expected.length === actual.length && expected.every((tag, index) => tag === actual[index]);
  return {
    valid,
    expected,
    actual,
    reason: valid ? undefined : `يجب إبقاء الوسوم بالترتيب نفسه: ${expected.join(" ") || "لا توجد وسوم"}`,
  };
}

/** Repairs only an unambiguous case: all visible text exists and the technical
 * suffix was removed or damaged. Inline tags are left for manual review. */
export function repairSteinsGateTags(original: string, translation: string): { text: string; changed: boolean } {
  const expected = extractSteinsGateTags(original);
  if (expected.length === 0 || validateSteinsGateTags(original, translation).valid) {
    return { text: translation, changed: false };
  }
  const suffixMatch = original.match(/((?:%(?:K|P|N|CE|CF[0-9A-Fa-f]{6}|L\d+|W\d+|[A-Z][A-Z0-9_]*))+\s*)$/);
  if (!suffixMatch || expected.join("") !== extractSteinsGateTags(suffixMatch[1]).join("")) {
    return { text: translation, changed: false };
  }
  const visible = translation.replace(STEINSGATE_TAG_RE, "").trimEnd();
  if (!visible) return { text: translation, changed: false };
  return { text: `${visible}${suffixMatch[1].trim()}`, changed: true };
}
