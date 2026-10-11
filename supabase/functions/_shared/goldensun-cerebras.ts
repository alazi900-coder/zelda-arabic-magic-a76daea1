/**
 * Golden Sun: The Lost Age — strict game-specific localization contract.
 * Structural byte escapes are executable game control codes, not punctuation.
 */
export const GOLDEN_SUN_2_SYSTEM_PROMPT = [
  "You localize Golden Sun: The Lost Age (Golden Sun II, Game Boy Advance) from English into clear, fluent Modern Standard Arabic.",
  "The story follows Felix, Jenna, Sheba and Piers, exploring Weyard. Use only identities and context supplied by the source/glossary. Never import Xenoblade, Pokémon or other games' lore.",
  "Voice: vivid but concise classic fantasy JRPG; natural conversations, measured solemnity for elders, warm camaraderie for companions, tension for confrontations. Avoid stiff word-for-word English syntax, excessive classical archaisms and invented narrative details.",
  "Respect glossary choices exactly. Suggested terminology ONLY in the absence of a glossary: Psynergy = ساينرجي, Adept = أديبت, Djinn = جِنّ, Alchemy = الخيمياء. Never replace an established user-approved name.",
  "Game Boy Advance space is limited. Keep dialogue succinct; UI labels terse and consistent. No added explanations or extra lines. The game's build pipeline, not the model, handles pixel-width dialogue layout.",
  "CRITICAL: \\xNN (such as \\x03, \\x1E, \\x11) are literal engine control codes, NOT display text. Copy each protected TAG_N and NEWLINE_N placeholder byte-for-byte, exactly ONCE, and in the original order. Do not insert, remove, move or alter control codes or their arguments.",
  "Preserve all variables, markup, printf tokens, speaker markers, and existing hard line breaks without changing count or relative order.",
  "Keep normal, logical Arabic Unicode. Do NOT reverse Arabic visually, create Arabic Presentation Forms, or insert invisible BiDi marks. The game's engine applies Arabic shaping/rendering later.",
  "Return ONLY one valid JSON object containing the requested K0, K1, ... keys. Each value MUST be Arabic (except proper names, technical tokens and abbreviations). Never echo English in place of a translation.",
].join("\n");

const GS_CODE = /\\x[0-9a-fA-F]{2}/g;
const GS_INVALID_CODE = /\\x(?![0-9a-fA-F]{2})/i;

/** Normalize hex casing for comparison; preserve exact bytes in final output. */
export function goldenSunCodeSequence(value: string): string[] {
  return (value.match(GS_CODE) || []).map(x => x.toLowerCase());
}

export function goldenSunCodesUnchanged(source: string, translated: string): boolean {
  if (GS_INVALID_CODE.test(translated)) return false;
  const sourceCodes = goldenSunCodeSequence(source);
  const translatedCodes = goldenSunCodeSequence(translated);
  return sourceCodes.length === translatedCodes.length &&
    sourceCodes.every((item, i) => item === translatedCodes[i]);
}

/** Validate ordered placeholder sequence before any restoration. */
export function hasExactMaskedTechnicalSequence(sourceMasked: string, translationMasked: string): boolean {
  const re = /\b(?:TAG|NEWLINE)_\d+\b/g;
  const a = sourceMasked.match(re) || [];
  const b = translationMasked.match(re) || [];
  return a.length === b.length && a.every((item, i) => item === b[i]);
}
