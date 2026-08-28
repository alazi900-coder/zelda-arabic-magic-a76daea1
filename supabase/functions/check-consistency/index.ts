import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createRisenMasker, unmaskRisenTags } from "../_shared/risen-tag-mask.ts";

const POKEMON_XP_TOKEN_REGEX = /\\(?:PN|PM)|\\(?:wt|dxn|v|c|p|i|w|l)\[[^\]\r\n]{0,80}\]|\\[nNbBGg{}\\]/gi;
const POKEMON_XP_UNSAFE_ADDITIONS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const POKEMON_XP_TOKEN_RULE = `Pokémon XP contract: Pokémon Unbreakable Ties uses Pokémon Essentials / RPG Maker XP, not Pokémon GBA or Xenoblade. __PKXP_N__ values are executable message commands. Preserve each one once and in the same order; never translate, remove, move, duplicate, or create them. Do not add BiDi controls, Arabic Presentation Forms, or automatic tashkeel.`;

function pokemonXpTokens(text: string): string[] {
  return [...(text || '').matchAll(new RegExp(POKEMON_XP_TOKEN_REGEX.source, 'gi'))].map((match) => match[0]);
}

function preservesPokemonXpContract(source: string, candidate: string): boolean {
  const sourceTokens = pokemonXpTokens(source);
  const candidateTokens = pokemonXpTokens(candidate);
  if (sourceTokens.length !== candidateTokens.length || sourceTokens.some((token, index) => token !== candidateTokens[index])) return false;
  const sourceUnsafe = source.match(POKEMON_XP_UNSAFE_ADDITIONS) || [];
  const candidateUnsafe = candidate.match(POKEMON_XP_UNSAFE_ADDITIONS) || [];
  return candidateUnsafe.every((mark, index) => mark === sourceUnsafe[index]);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConsistencyEntry {
  key: string;
  original: string;
  translation: string;
  file: string;
}

interface InconsistencyGroup {
  term: string;
  variants: { key: string; translation: string; file: string }[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entries, glossary, game } = await req.json() as {
      entries: ConsistencyEntry[];
      glossary?: string;
      game?: 'xenoblade' | 'risen' | 'risen2' | 'mother3' | 'metroidprime' | 'pokemon-xp';
    };
    const isRisen = game === 'risen' || game === 'risen1' || game === 'risen2';
    const isPokemonXp = game === 'pokemon-xp';

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ groups: [], aiSuggestions: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Group by normalized original text to find inconsistencies
    const byOriginal = new Map<string, ConsistencyEntry[]>();
    for (const entry of entries) {
      const norm = entry.original.trim().toLowerCase();
      if (!norm || norm.length < 2) continue;
      if (!byOriginal.has(norm)) byOriginal.set(norm, []);
      byOriginal.get(norm)!.push(entry);
    }

    // Find groups with different translations for the same original
    const inconsistentGroups: InconsistencyGroup[] = [];
    for (const [term, group] of byOriginal) {
      if (group.length < 2) continue;
      const uniqueTranslations = new Set(group.map(e => e.translation.trim()));
      if (uniqueTranslations.size > 1) {
        inconsistentGroups.push({
          term: group[0].original, // keep original casing
          variants: group.map(e => ({ key: e.key, translation: e.translation, file: e.file })),
        });
      }
    }

    if (inconsistentGroups.length === 0) {
      return new Response(JSON.stringify({ groups: [], aiSuggestions: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Use AI to suggest the best translation for each inconsistent group
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      // Return groups without AI suggestions
      return new Response(JSON.stringify({ groups: inconsistentGroups, aiSuggestions: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Limit to 50 groups to avoid token limits
    const groupsToCheck = inconsistentGroups.slice(0, 50);

    // Mask Risen tags before the term/variant translations reach the model —
    // one shared tag list per group (term + all its variants), so a returned
    // "best" pick can be unmasked regardless of which variant it echoes.
    const groupTagsByIndex: string[][] = [];
    const pokemonXpTokensByGroup: string[][] = [];
    const promptGroups = isRisen
      ? groupsToCheck.map((g) => {
          const { mask, tags } = createRisenMasker();
          const maskedGroup = { term: mask(g.term), variants: g.variants.map(v => ({ ...v, translation: mask(v.translation) })) };
          groupTagsByIndex.push(tags);
          return maskedGroup;
        })
      : isPokemonXp
        ? groupsToCheck.map((g) => {
            const tokens = pokemonXpTokens(g.term);
            pokemonXpTokensByGroup.push(tokens);
            let occurrence = 0;
            const mask = (value: string) => (value || '').replace(new RegExp(POKEMON_XP_TOKEN_REGEX.source, 'gi'), () => `__PKXP_${occurrence++}__`);
            return { term: mask(g.term), variants: g.variants.map((v) => ({ ...v, translation: mask(v.translation) })) };
          })
      : groupsToCheck;

    const prompt = `أنت خبير في اتساق مصطلحات ترجمة ألعاب الفيديو. لكل مصطلح إنجليزي أدناه، هناك عدة ترجمات عربية مختلفة مستخدمة في الملفات. اختر أفضل ترجمة واحدة لكل مصطلح واشرح السبب بجملة واحدة.

${isPokemonXp ? POKEMON_XP_TOKEN_RULE : ''}

${glossary ? `القاموس المرجعي:\n${glossary}\n\n` : ''}المصطلحات:
${promptGroups.map((g, i) => `[${i}] "${g.term}" → الترجمات: ${[...new Set(g.variants.map(v => `"${v.translation}"`))].join(' | ')}`).join('\n')}

أخرج JSON array بنفس الترتيب:
[{"best": "أفضل ترجمة", "reason": "السبب"}, ...]`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'أنت خبير اتساق مصطلحات. أخرج ONLY JSON arrays.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز حد الطلبات، يرجى المحاولة لاحقاً." }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "يرجى إضافة رصيد لاستخدام الذكاء الاصطناعي." }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const err = await response.text();
      console.error('AI gateway error:', response.status, err);
      // Return groups without AI suggestions on error
      return new Response(JSON.stringify({ groups: inconsistentGroups, aiSuggestions: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);

    let aiSuggestions: { best: string; reason: string }[] = [];
    if (jsonMatch) {
      try {
        const sanitized = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, ' ');
        aiSuggestions = JSON.parse(sanitized);
        if (isRisen) {
          aiSuggestions = aiSuggestions.map((s, i) => {
            const tags = groupTagsByIndex[i];
            return tags ? { best: unmaskRisenTags(s.best, tags), reason: unmaskRisenTags(s.reason, tags) } : s;
          });
        } else if (isPokemonXp) {
          aiSuggestions = aiSuggestions.map((s, i) => {
            const tokens = pokemonXpTokensByGroup[i] || [];
            const best = (s.best || '').replace(/__PKXP_(\d+)__/g, (placeholder: string, rawIndex: string) => tokens[Number(rawIndex)] ?? placeholder);
            return { ...s, best };
          }).filter((s, i) => preservesPokemonXpContract(groupsToCheck[i]?.term || '', s.best || ''));
        }
      } catch (e) {
        console.error('Failed to parse AI suggestions:', e);
      }
    }

    return new Response(JSON.stringify({
      groups: inconsistentGroups,
      aiSuggestions,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Consistency check error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'خطأ غير متوقع' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
