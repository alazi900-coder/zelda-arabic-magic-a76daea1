// Shared Risen 1 tag masking — mirrors src/lib/risen-tag-guard.ts (the client-side
// post-hoc repair equivalent). This is the pre-emptive half: mask each Risen tag
// with a ⟦N⟧ placeholder before the text reaches an AI model, so the model never
// sees (and can't mistranslate/mangle) the raw tag, then restore it afterward.
//
// Confirmed real formats (from actual extracted Risen 1 strings):
//   - Button/UI tags:      <Exit>, <MeleeWeapon>, ... (17 confirmed)
//   - Parenthesized vars:  $(name), $(value), $(day), $(hour), $(minute)
//   - Bare engine tokens:  XXX, SGN, SGT, SGPT, SGL — no brackets at all,
//     found in hud2.tab (save-screen text). Matched as whole words only.
//   - Duration template:   "MM minutes, HH hours, DD days" — MM/HH/DD are
//     only tags in that exact context; matched via lookahead on the unit
//     word so ordinary dialogue never false-positives.
export const RISEN_TAG_REGEX =
  /<[A-Za-z][A-Za-z0-9_]{0,30}>|\$\([A-Za-z0-9_]{1,30}\)|\b(?:XXX|SGN|SGT|SGPT|SGL)\b|\bMM\b(?=\s*minutes)|\bHH\b(?=\s*hours)|\bDD\b(?=\s*days)/g;

export function maskRisenTags(text: string): { masked: string; tags: string[] } {
  const tags: string[] = [];
  const masked = text.replace(new RegExp(RISEN_TAG_REGEX.source, RISEN_TAG_REGEX.flags), (m) => {
    tags.push(m);
    return `⟦${tags.length - 1}⟧`;
  });
  return { masked, tags };
}

export function unmaskRisenTags(text: string, tags: string[]): string {
  let result = text;
  tags.forEach((tag, i) => {
    result = result.split(`⟦${i}⟧`).join(tag);
  });
  return result;
}

/**
 * Create a masker whose `mask()` closure shares ONE running tag list across
 * every string passed through it. Use this whenever several related strings
 * (original + existing translation, or a group of translation variants) go
 * into the same prompt: masking each string independently would restart the
 * placeholder count at ⟦0⟧ for every one of them, so the model's response
 * (which may echo any field's placeholder) could not be unambiguously
 * unmasked against a single tags array.
 */
export function createRisenMasker(): { mask: (text: string) => string; tags: string[] } {
  const tags: string[] = [];
  const mask = (text: string) =>
    text.replace(new RegExp(RISEN_TAG_REGEX.source, RISEN_TAG_REGEX.flags), (m) => {
      tags.push(m);
      return `⟦${tags.length - 1}⟧`;
    });
  return { mask, tags };
}

/** Convenience wrapper over createRisenMasker for the common two-string case. */
export function maskRisenTagPair(a: string, b: string): { maskedA: string; maskedB: string; tags: string[] } {
  const { mask, tags } = createRisenMasker();
  const maskedA = mask(a);
  const maskedB = mask(b);
  return { maskedA, maskedB, tags };
}
