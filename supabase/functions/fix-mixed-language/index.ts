import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { maskRisenTagPair, unmaskRisenTags } from "../_shared/risen-tag-mask.ts";
import { RISEN_FORGET_OTHER_GAME_RULE_EN } from "../_shared/risen-persona-guard.ts";
import { MOTHER3_FORGET_OTHER_GAME_RULE_EN } from "../_shared/mother3-persona-guard.ts";
import { METROID_PRIME_FORGET_OTHER_GAME_RULE_EN } from '../_shared/metroid-prime-persona-guard.ts';

const POKEMON_XP_TOKEN_REGEX = /\\(?:PN|PM)|\\(?:wt|dxn|v|c|p|i|w|l)\[[^\]\r\n]{0,80}\]|\\[nNbBGg{}\\]/gi;
const POKEMON_XP_UNSAFE_ADDITIONS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const POKEMON_XP_TOKEN_RULE = `This is Pokémon Unbreakable Ties (Pokémon Essentials / RPG Maker XP), not Pokémon GBA or Xenoblade. __PKXP_N__ values are executable message commands. Preserve each placeholder once and in the exact same order. Never translate, delete, move, duplicate, or create one. Do not add BiDi controls, Arabic Presentation Forms, or automatic tashkeel.`;

function pokemonXpTokens(text: string): string[] {
  return [...(text || '').matchAll(new RegExp(POKEMON_XP_TOKEN_REGEX.source, 'gi'))].map((match) => match[0]);
}

function maskPokemonXpText(text: string, tokens: string[]): string {
  let index = 0;
  return (text || '').replace(new RegExp(POKEMON_XP_TOKEN_REGEX.source, 'gi'), () => `__PKXP_${index++}__`);
}

function unmaskPokemonXpText(text: string, tokens: string[]): string {
  return (text || '').replace(/__PKXP_(\d+)__/g, (placeholder, rawIndex: string) => tokens[Number(rawIndex)] ?? placeholder);
}

function preservesPokemonXpContract(source: string, candidate: string): boolean {
  const sourceTokens = pokemonXpTokens(source);
  const candidateTokens = pokemonXpTokens(candidate);
  if (sourceTokens.length !== candidateTokens.length || sourceTokens.some((token, index) => token !== candidateTokens[index])) return false;
  const sourceUnsafe = source.match(POKEMON_XP_UNSAFE_ADDITIONS) || [];
  const candidateUnsafe = candidate.match(POKEMON_XP_UNSAFE_ADDITIONS) || [];
  const allowance = new Map<string, number>();
  sourceUnsafe.forEach((mark) => allowance.set(mark, (allowance.get(mark) || 0) + 1));
  return candidateUnsafe.every((mark) => {
    const remaining = allowance.get(mark) || 0;
    allowance.set(mark, remaining - 1);
    return remaining > 0;
  });
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entries, glossary, game } = await req.json() as {
      entries: { key: string; original: string; translation: string }[];
      glossary?: string;
      game?: 'xenoblade' | 'risen' | 'risen2' | 'mother3' | 'metroidprime' | 'pokemon-xp';
    };

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ translations: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mask Risen tags (<Exit>, $(name), ...) before they reach the model —
    // this function's whole job is "translate remaining English words", and
    // without masking it would happily "translate" a bare tag too.
    const isRisen = game === 'risen' || game === 'risen1' || game === 'risen2';
    const isMother3 = game === 'mother3';
    const isMetroidPrime = game === 'metroidprime';
    const isPokemonXp = game === 'pokemon-xp';
    const risenTagsByIndex: string[][] = [];
    const pokemonXpTokensByIndex: string[][] = [];
    const promptEntries = isRisen
      ? entries.map((e) => {
          const { maskedA, maskedB, tags } = maskRisenTagPair(e.original, e.translation);
          risenTagsByIndex.push(tags);
          return { ...e, original: maskedA, translation: maskedB };
        })
      : isPokemonXp
        ? entries.map((e) => {
            const tokens = pokemonXpTokens(e.original);
            pokemonXpTokensByIndex.push(tokens);
            return { ...e, original: maskPokemonXpText(e.original, tokens), translation: maskPokemonXpText(e.translation, tokens) };
          })
      : entries;

    const textsBlock = promptEntries.map((e, i) =>
      `[${i}]\nOriginal: ${e.original}\nCurrent translation (mixed): ${e.translation}`
    ).join('\n\n');

    let glossarySection = '';
    if (glossary?.trim()) {
      glossarySection = `\n\nUse this glossary for consistent terminology:\n${glossary}\n`;
    }

    const gameNameLabel = isPokemonXp ? 'Pokémon Unbreakable Ties (Pokémon Essentials / RPG Maker XP)' : isMother3 ? 'MOTHER 3' : isRisen ? 'Risen' : 'Xenoblade Chronicles';
    const prompt = `You are a professional Arabic game translator for ${gameNameLabel}.
${isPokemonXp ? '\n' + POKEMON_XP_TOKEN_RULE + '\n' : isMetroidPrime ? '\n' + METROID_PRIME_FORGET_OTHER_GAME_RULE_EN + '\n' : isMother3 ? '\n' + MOTHER3_FORGET_OTHER_GAME_RULE_EN + '\n' : isRisen ? '\n' + RISEN_FORGET_OTHER_GAME_RULE_EN + '\n' : ''}
The following translations contain a mix of Arabic and English text. Your job is to translate the remaining English words into Arabic while keeping the sentence natural and coherent.

CRITICAL RULES:
- Translate ALL English words to Arabic, except for:
  - Proper nouns (character/place names) that are commonly kept in English in Arabic gaming, per the glossary if provided
  - Technical gaming abbreviations: HP, MP, ATK, DEF, NPC, XP, DLC, HUD, FPS
  - Controller button names: A, B, X, Y, L, R, ZL, ZR
  - Tags like [Color:Red], [Icon:Heart], etc. must stay exactly as-is
- Keep the translation length close to the original
- Maintain the existing Arabic text structure and style
- Return ONLY a JSON array of the fixed translations in the same order. No explanations.${glossarySection}

Entries:
${textsBlock}`;

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('Missing LOVABLE_API_KEY');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a game text translator. Fix mixed Arabic/English translations by translating remaining English words. Output only valid JSON arrays.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'تم تجاوز حد الطلبات، حاول لاحقاً' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'يرجى إضافة رصيد لاستخدام الذكاء الاصطناعي' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const err = await response.text();
      console.error('AI gateway error:', err);
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Failed to parse AI response');

    const sanitized = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, ' ');
    const translations: string[] = JSON.parse(sanitized);

    const result: Record<string, string> = {};
    for (let i = 0; i < Math.min(entries.length, translations.length); i++) {
      if (translations[i]?.trim()) {
        const tags = risenTagsByIndex[i];
        const pokemonXpTokensForEntry = pokemonXpTokensByIndex[i];
        const restored = pokemonXpTokensForEntry ? unmaskPokemonXpText(translations[i], pokemonXpTokensForEntry) : tags ? unmaskRisenTags(translations[i], tags) : translations[i];
        if (!isPokemonXp || preservesPokemonXpContract(entries[i].original, restored)) result[entries[i].key] = restored;
      }
    }

    return new Response(JSON.stringify({ translations: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'خطأ غير متوقع' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
