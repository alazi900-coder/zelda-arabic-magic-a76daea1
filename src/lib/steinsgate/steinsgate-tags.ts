// Fixed command lengths matter: %B1SOrganization contains a tag followed by
// prose, and %CF8FF8 is %CF plus FOUR hexadecimal digits, not six.
export const STEINSGATE_TAG_RE = /%(?:CF[0-9A-Fa-f]{4}|CE|B\d[SE]|[Ot]\d{3}|L[1CER]|T\d|W\d+|[KPNn])|\\n|\r?\n|[▼]/g;

/** Steins;Gate editor form for the raw CR advance marker. */
export function toSteinsGateEditorText(text: string): string { return text.replace(/\r/g, "▼"); }
/** Restore the protected editor arrow before writing PSP script bytes. */
export function fromSteinsGateEditorText(text: string): string { return text.replace(/▼/g, "\r"); }

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
  const expected = extractSteinsGateTags(toSteinsGateEditorText(original));
  const actual = extractSteinsGateTags(toSteinsGateEditorText(translation));
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
  // Only restore terminal advance/page commands. Moving inline colour,
  // timing, or newline commands to the end would change engine behaviour.
  const suffixMatch = original.match(/((?:%[KP])+)[ \t]*$/);
  if (!suffixMatch || expected.join("") !== extractSteinsGateTags(suffixMatch[1]).join("")) {
    return { text: translation, changed: false };
  }
  const visible = translation.replace(STEINSGATE_TAG_RE, "").trimEnd();
  if (!visible) return { text: translation, changed: false };
  return { text: `${visible}${suffixMatch[1].trim()}`, changed: true };
}

/** Exclude confirmed machine data, never discard a word just for uppercase. */
export function isSteinsGateTranslatable(file: string, text: string): boolean {
  if (/^(?:DBG|DMENU)/i.test(file.replace(/^steinsgate\//, ""))) return false;
  const visible = text.replace(STEINSGATE_TAG_RE, "").trim();
  if (!visible || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(visible)) return false;
  if (/^[\dXx+ ().:-]+$/.test(visible)) return false;
  if (/^[\w./\\-]+\.(?:BIN|AFS|P2T|ADX|AHX|AT3|PMF|PNG|WAV|FNT|FNI)$/i.test(visible)) return false;
  return /\p{L}/u.test(visible);
}
