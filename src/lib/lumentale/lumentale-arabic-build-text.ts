/**
 * LumenTale build rule: Unity/TMP runtime tokens are opaque, ordered data.
 * They must not enter Arabic shaping or the legacy LTR BiDi reversal step.
 */
import { hasArabicChars, hasArabicPresentationForms, processArabicText } from "@/lib/arabic-processing";
import {
  lumentaleTechnicalTokens,
  replaceLumenTaleTechnicalTokens,
  validateLumenTaleTranslation,
} from "./lumentale-token-guard";

// These PUA marker triples remain one atomic chunk in reverseBidi. The middle
// character is limited to E000–E0EF; E0F0/E0F1 are the immutable delimiters.
const SLOT_START = 0xE000;
const SLOT_LIMIT = 0xF0;
const SLOT_OPEN = "\uE0F0";
const SLOT_CLOSE = "\uE0F1";
const SLOT_PATTERN = /\uE0F0([\uE000-\uE0EF])\uE0F1/g;

/**
 * Shapes Arabic for LumenTale while keeping every protected token byte-for-byte
 * intact and in original source order. Source order is deliberate: tags such as
 * `<pause=1>` are executable commands, not visible punctuation.
 */
export function prepareLumenTaleLocalizedText(text: string): string {
  if (!hasArabicChars(text) || hasArabicPresentationForms(text)) return text;

  const sourceTokens = lumentaleTechnicalTokens(text);
  if (sourceTokens.length > SLOT_LIMIT) {
    throw new Error("السطر يحتوي رموزاً تقنية أكثر من الحد الآمن لتشكيل العربية.");
  }

  let slotIndex = 0;
  const shielded = replaceLumenTaleTechnicalTokens(text, () => {
    const slot = String.fromCharCode(SLOT_START + slotIndex);
    slotIndex += 1;
    return `${SLOT_OPEN}${slot}${SLOT_CLOSE}`;
  });

  const shaped = processArabicText(shielded, { arabicNumerals: true, mirrorPunct: true });
  let restoredIndex = 0;
  const restored = shaped.replace(SLOT_PATTERN, () => sourceTokens[restoredIndex++] ?? "");

  if (restoredIndex !== sourceTokens.length || SLOT_PATTERN.test(restored)) {
    throw new Error("تعذر استعادة رموز LumenTale التقنية بعد تشكيل العربية.");
  }

  const tokenError = validateLumenTaleTranslation(text, restored);
  if (tokenError) throw new Error(tokenError);
  return restored;
}
