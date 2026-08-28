/**
 * Pokémon Unbreakable Ties / Pokémon Essentials localization contract.
 *
 * RPG Maker XP control codes are executable message commands, not text.  This
 * module intentionally compares their *ordered sequence* instead of their
 * count, so an AI result cannot swap two commands while appearing valid.
 */

export const POKEMON_XP_GAME_LABEL = "Pokémon Unbreakable Ties (Pokémon Essentials / RPG Maker XP)";

/** The exact control-code families observed in the shipped English table. */
export const POKEMON_XP_TOKEN_PATTERN = /\\(?:PN|PM)|\\(?:wt|dxn|v|c|p|i|w|l)\[[^\]\r\n]{0,80}\]|\\[nNbBGg{}\\]/gi;

/**
 * Instructions shared by the translator, the improvement panel and the
 * contextual-suggestion panel. Keep this declarative: validation remains the
 * authority, so a model cannot weaken this contract.
 */
export const POKEMON_XP_TOKEN_RULE = `سياق اللعبة: ${POKEMON_XP_GAME_LABEL}. تستخدم اللعبة أوامر رسائل Pokémon Essentials مثل \\PN و\\PM و\\v[1] و\\c[2] و\\n و\\wt[10] و\\dxn[Name] و\\b. هذه أوامر تنفيذية وليست كلمات: انسخ كل أمر حرفياً كما هو، وبالعدد والترتيب نفسيهما، ولا تترجمه ولا تغيّر رقمه أو اسمه أو تنقله أو تضف أمراً جديداً. لا تفترض قواعد Pokémon GBA أو Ruby Destiny (لا قيود ROM أو {FD:xx} ولا صندوق سطرين). اكتب عربية طبيعية مناسبة لعالم Pokémon، من دون اختراع أحداث أو أسماء، والتزم بالقاموس. لا تضف علامات اتجاه BiDi خفية أو تشكيلًا تلقائياً أو Arabic Presentation Forms قبل تحقق الخط.`;

export interface PokemonXpTokenValidation {
  valid: boolean;
  sourceTokens: string[];
  candidateTokens: string[];
  reason: string | null;
}

export function extractPokemonXpTokens(text: string | undefined | null): string[] {
  if (!text) return [];
  const matcher = new RegExp(POKEMON_XP_TOKEN_PATTERN.source, "gi");
  return Array.from(text.matchAll(matcher), (match) => match[0]);
}

const BIDI_OR_PRESENTATION_FORMS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C\uFB50-\uFDFF\uFE70-\uFEFF]/g;

function forbiddenTransformationsAdded(source: string, candidate: string): boolean {
  const sourceMarks = source.match(BIDI_OR_PRESENTATION_FORMS) || [];
  const candidateMarks = candidate.match(BIDI_OR_PRESENTATION_FORMS) || [];
  if (candidateMarks.length === 0) return false;
  const available = new Map<string, number>();
  for (const mark of sourceMarks) available.set(mark, (available.get(mark) || 0) + 1);
  for (const mark of candidateMarks) {
    const remaining = available.get(mark) || 0;
    if (remaining === 0) return true;
    available.set(mark, remaining - 1);
  }
  return false;
}

/** Returns a user-facing reason when an AI proposal breaks the XP contract. */
export function validatePokemonXpTechnicalTokens(source: string, candidate: string): PokemonXpTokenValidation {
  const sourceTokens = extractPokemonXpTokens(source);
  const candidateTokens = extractPokemonXpTokens(candidate);
  const sameSequence = sourceTokens.length === candidateTokens.length &&
    sourceTokens.every((token, index) => token === candidateTokens[index]);

  if (!sameSequence) {
    return {
      valid: false,
      sourceTokens,
      candidateTokens,
      reason: "اقتراح الذكاء غيّر أمراً تقنياً من Pokémon Essentials أو ترتيبه؛ لم يُطبَّق.",
    };
  }
  if (forbiddenTransformationsAdded(source, candidate)) {
    return {
      valid: false,
      sourceTokens,
      candidateTokens,
      reason: "اقتراح الذكاء أضاف علامة اتجاه خفية أو شكلاً عرضياً للحروف العربية؛ لم يُطبَّق.",
    };
  }
  return { valid: true, sourceTokens, candidateTokens, reason: null };
}

export function preservesPokemonXpTechnicalTokenSequence(source: string, candidate: string): boolean {
  return validatePokemonXpTechnicalTokens(source, candidate).valid;
}

export interface PokemonXpTokenMask {
  text: string;
  tokens: string[];
}

/** Hides commands from an AI request and restores the exact original strings. */
export function maskPokemonXpTechnicalTokens(text: string): PokemonXpTokenMask {
  const tokens: string[] = [];
  const matcher = new RegExp(POKEMON_XP_TOKEN_PATTERN.source, "gi");
  const masked = text.replace(matcher, (token) => {
    const index = tokens.push(token) - 1;
    return `⟪PKXP_${index}⟫`;
  });
  return { text: masked, tokens };
}

export function unmaskPokemonXpTechnicalTokens(text: string, tokens: string[]): string {
  return text.replace(/⟪PKXP_(\d+)⟫/g, (placeholder, rawIndex: string) => {
    const token = tokens[Number(rawIndex)];
    return typeof token === "string" ? token : placeholder;
  });
}
