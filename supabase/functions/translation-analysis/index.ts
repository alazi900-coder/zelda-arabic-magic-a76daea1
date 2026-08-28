import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { maskRisenTagPair, unmaskRisenTags } from "../_shared/risen-tag-mask.ts";
import { RISEN_FORGET_OTHER_GAME_RULE } from "../_shared/risen-persona-guard.ts";
import { MOTHER3_FORGET_OTHER_GAME_RULE } from "../_shared/mother3-persona-guard.ts";
import { METROID_PRIME_FORGET_OTHER_GAME_RULE } from '../_shared/metroid-prime-persona-guard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface AnalysisEntry {
  key: string;
  original: string;
  translation: string;
  fileName?: string;
}

type AnalysisAction = 'literal-detect' | 'style-unify' | 'consistency-check' | 'alternatives' | 'full-analysis';

const POKEMON_XP_TOKEN_REGEX = /\\(?:PN|PM)|\\(?:wt|dxn|v|c|p|i|w|l)\[[^\]\r\n]{0,80}\]|\\[nNbBGg{}\\]/gi;

function maskPokemonXpPair(original: string, translation: string): { maskedA: string; maskedB: string; tokens: string[] } {
  const tokens: string[] = [];
  const mask = (text: string) => (text || '').replace(new RegExp(POKEMON_XP_TOKEN_REGEX.source, 'gi'), (token) => {
    const index = tokens.length;
    tokens.push(token);
    return `__PXPTOKEN_${index}__`;
  });
  return { maskedA: mask(original), maskedB: mask(translation), tokens };
}

function unmaskPokemonXpTokens(text: unknown, tokens: string[] | undefined): unknown {
  if (!tokens || typeof text !== 'string') return text;
  let malformed = false;
  const restored = text.replace(/__PXPTOKEN_(\d+)__/g, (placeholder, rawIndex) => {
    const token = tokens[Number(rawIndex)];
    if (token === undefined) {
      malformed = true;
      return placeholder;
    }
    return token;
  });
  return malformed ? '' : restored;
}

const gatewayModelMap: Record<string, string> = {
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
  'gemini-2.5-pro': 'google/gemini-2.5-pro',
  'gemini-3-flash-preview': 'google/gemini-3-flash-preview',
  'gpt-5': 'openai/gpt-5',
};

function buildPrompt(action: AnalysisAction, entries: AnalysisEntry[], glossary?: string, styleGuide?: string, isRisen?: boolean, isMother3?: boolean, isMetroidPrime?: boolean, isPokemonXp?: boolean): string {
  const glossarySection = glossary ? `\nالقاموس المعتمد (التزم بهذه المصطلحات):\n${glossary.split('\n').slice(0, 100).join('\n')}` : '';
  const gameNameLabel = isPokemonXp ? 'Pokémon Unbreakable Ties (Pokémon Essentials / RPG Maker XP)' : isMetroidPrime ? 'Metroid Prime Remastered' : isMother3 ? 'MOTHER 3' : isRisen ? 'Risen' : 'Xenoblade Chronicles 3';
  const forgetOtherGame = isPokemonXp
    ? '\nسياق ثابت: هذه Pokémon Essentials على RPG Maker XP، وليست Pokémon GBA أو Ruby Destiny أو Xenoblade. كل __PXPTOKEN_n__ يمثل أمراً تقنياً أصلياً؛ انسخه مرة واحدة وبالترتيب نفسه ولا تنشئ أو تحذف أو تعيد ترقيم أي رمز، ولا تضف علامات BiDi مخفية أو تشكيلًا أو Presentation Forms.\n'
    : isMetroidPrime
    ? `\n${METROID_PRIME_FORGET_OTHER_GAME_RULE}\n`
    : isMother3
    ? `\n${MOTHER3_FORGET_OTHER_GAME_RULE}\n`
    : isRisen
    ? `\n${RISEN_FORGET_OTHER_GAME_RULE}\n`
    : '';

  if (action === 'literal-detect') {
    return `أنت خبير في كشف الترجمات الحرفية من الإنجليزية للعربية في ألعاب الفيديو (${gameNameLabel}).
${forgetOtherGame}
مهمتك: فحص كل ترجمة وتحديد إن كانت حرفية (word-by-word) أو طبيعية.
الترجمة الحرفية تتميز بـ:
- اتباع ترتيب الكلمات الإنجليزي
- استخدام تعابير غير مألوفة بالعربية
- عدم مراعاة السياق الثقافي
- الجمود والركاكة
${glossarySection}

النصوص:
${entries.map((e, i) => `[${i}] EN: ${e.original}\nAR: ${e.translation}`).join('\n\n')}

أجب بـ JSON فقط:
{
  "results": [
    {
      "index": 0,
      "isLiteral": true/false,
      "literalScore": 0-100,
      "issues": ["وصف المشكلة"],
      "naturalVersion": "الترجمة الطبيعية المقترحة",
      "explanation": "شرح التحسين"
    }
  ]
}`;
  }

  if (action === 'style-unify') {
    return `أنت خبير في توحيد أسلوب الترجمة للعربية في ألعاب الفيديو (${gameNameLabel}).
${forgetOtherGame}
مهمتك: مراجعة مجموعة الترجمات وتوحيد أسلوبها:
- توحيد النبرة (رسمية/ودية) عبر كل النصوص
- توحيد أسلوب المخاطبة (أنت/أنتم)
- توحيد المصطلحات والتعابير المتكررة
- ضمان اتساق مستوى الرسمية
${styleGuide ? `\nالأسلوب المطلوب: ${styleGuide}` : '\nالأسلوب: رسمي ملائم لعالم خيالي'}
${glossarySection}

النصوص:
${entries.map((e, i) => `[${i}] EN: ${e.original}\nAR: ${e.translation}\nملف: ${e.fileName || 'غير محدد'}`).join('\n\n')}

أجب بـ JSON فقط:
{
  "results": [
    {
      "index": 0,
      "styleIssues": ["وصف مشكلة الأسلوب"],
      "currentTone": "formal/casual/mixed",
      "suggestedTone": "formal/casual",
      "unifiedVersion": "النص بعد توحيد الأسلوب",
      "changes": ["التغيير المحدد"]
    }
  ],
  "globalNotes": ["ملاحظات عامة عن اتساق المشروع"]
}`;
  }

  if (action === 'consistency-check') {
    return `أنت خبير في فحص اتساق الترجمة في ألعاب الفيديو (${gameNameLabel}).
${forgetOtherGame}
مهمتك: فحص الاتساق الشامل:
1. المصطلحات: هل نفس الكلمة الإنجليزية مترجمة بنفس الطريقة دائماً؟
2. الشخصيات: هل أسماء الشخصيات متسقة؟
3. الأسلوب: هل مستوى الرسمية متسق؟
4. القاموس: هل الترجمات تلتزم بالقاموس المعتمد؟
${glossarySection}

النصوص:
${entries.map((e, i) => `[${i}] EN: ${e.original}\nAR: ${e.translation}\nملف: ${e.fileName || '?'}`).join('\n\n')}

أجب بـ JSON فقط:
{
  "inconsistencies": [
    {
      "type": "terminology/character/style/glossary",
      "term": "المصطلح الإنجليزي",
      "variants": [{"index": 0, "text": "الترجمة1"}, {"index": 2, "text": "الترجمة2"}],
      "recommended": "الترجمة الموصى بها",
      "severity": "high/medium/low"
    }
  ],
  "score": 85,
  "summary": "ملخص عام لحالة الاتساق"
}`;
  }

  if (action === 'alternatives') {
    return `أنت مترجم ألعاب محترف متخصص في ${gameNameLabel}.
${forgetOtherGame}
مهمتك: تقديم 4 بدائل مختلفة الأسلوب لكل ترجمة:
1. أدبي (literary): صياغة أدبية راقية
2. طبيعي (natural): كما يتحدث العرب يومياً
3. مختصر (concise): أقصر ما يمكن مع الحفاظ على المعنى
4. درامي (dramatic): مناسب للمشاهد المهمة
${glossarySection}

النصوص:
${entries.map((e, i) => `[${i}] EN: ${e.original}\nAR الحالي: ${e.translation}`).join('\n\n')}

أجب بـ JSON فقط:
{
  "results": [
    {
      "index": 0,
      "alternatives": [
        {"style": "literary", "text": "...", "note": "سبب الاختيار"},
        {"style": "natural", "text": "...", "note": "..."},
        {"style": "concise", "text": "...", "note": "..."},
        {"style": "dramatic", "text": "...", "note": "..."}
      ],
      "recommended": "literary/natural/concise/dramatic",
      "characterContext": "اسم الشخصية إن تم تحديدها"
    }
  ]
}`;
  }

  // full-analysis: combines everything
  return `أنت خبير شامل في تحليل وتحسين ترجمات ألعاب الفيديو من الإنجليزية للعربية (${gameNameLabel}).
${forgetOtherGame}
أجرِ تحليلاً شاملاً لكل ترجمة يشمل:
1. كشف الترجمة الحرفية (هل هي word-by-word؟)
2. تحليل السياق (من المتحدث؟ ما نوع المشهد؟)
3. فحص الاتساق (هل المصطلحات متسقة مع باقي المشروع؟)
4. تقديم 3 بدائل بأساليب مختلفة
${glossarySection}

النصوص:
${entries.map((e, i) => `[${i}] EN: ${e.original}\nAR: ${e.translation}\nملف: ${e.fileName || '?'}`).join('\n\n')}

أجب بـ JSON فقط:
{
  "results": [
    {
      "index": 0,
      "literalScore": 0-100,
      "isLiteral": true/false,
      "sceneType": "combat/emotional/dialogue/system/tutorial",
      "character": "اسم الشخصية أو null",
      "tone": "formal/casual/dramatic/neutral",
      "issues": [{"type": "literal/awkward/inconsistent/style", "message": "...", "severity": "high/medium/low"}],
      "alternatives": [
        {"style": "literary", "text": "...", "note": "..."},
        {"style": "natural", "text": "...", "note": "..."},
        {"style": "concise", "text": "...", "note": "..."}
      ],
      "recommended": "أفضل ترجمة مقترحة"
    }
  ],
  "consistencyNotes": ["ملاحظات عن الاتساق العام"]
}`;
}

function parseAIResponse(content: string): any {
  try {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    return JSON.parse((jsonMatch[1] || content).trim());
  } catch {
    // Try extracting results array
    const m = content.match(/"results"\s*:\s*(\[[\s\S]*?\])/);
    if (m) {
      try { return { results: JSON.parse(m[1]) }; } catch { /* ignore */ }
    }
    const m2 = content.match(/"inconsistencies"\s*:\s*(\[[\s\S]*?\])/);
    if (m2) {
      try { return { inconsistencies: JSON.parse(m2[1]) }; } catch { /* ignore */ }
    }
    return {};
  }
}

/** Unmask every Risen-tag-bearing field across the 4 possible result shapes
 * this endpoint returns (results[]/inconsistencies[]), using each entry's
 * own tag list (looked up via the `index` field the model echoes back). */
function unmaskAnalysisResult(parsed: any, risenTagsByIndex: string[][], pokemonXpTokensByIndex: string[][] = []): any {
  const unmaskWith = (tags: string[] | undefined, text: unknown): unknown =>
    tags && typeof text === 'string' ? unmaskRisenTags(text, tags) : text;
  const restoreWith = (index: unknown, text: unknown): unknown => {
    const risenTags = typeof index === 'number' ? risenTagsByIndex[index] : undefined;
    const risenRestored = unmaskWith(risenTags, text);
    const pokemonXpTokens = typeof index === 'number' ? pokemonXpTokensByIndex[index] : undefined;
    return unmaskPokemonXpTokens(risenRestored, pokemonXpTokens);
  };

  if (Array.isArray(parsed?.results)) {
    parsed.results = parsed.results.map((r: any) => {
      const out = { ...r };
      out.naturalVersion = restoreWith(r?.index, out.naturalVersion);
      out.unifiedVersion = restoreWith(r?.index, out.unifiedVersion);
      out.recommended = restoreWith(r?.index, out.recommended);
      if (Array.isArray(out.alternatives)) {
        out.alternatives = out.alternatives.map((a: any) =>
          a && typeof a.text === 'string' ? { ...a, text: restoreWith(r?.index, a.text) } : a);
      }
      return out;
    });
  }
  if (Array.isArray(parsed?.inconsistencies)) {
    parsed.inconsistencies = parsed.inconsistencies.map((g: any) => {
      const out = { ...g };
      if (Array.isArray(out.variants)) {
        out.variants = out.variants.map((v: any) => {
          return v && typeof v.text === 'string' ? { ...v, text: restoreWith(v?.index, v.text) } : v;
        });
      }
      // `recommended` has no index of its own — best-effort: reuse the first variant's tags.
      out.recommended = restoreWith(out.variants?.[0]?.index, out.recommended);
      return out;
    });
  }
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entries, action, glossary, aiModel, styleGuide, game } = await req.json() as {
      entries: AnalysisEntry[];
      action: AnalysisAction;
      glossary?: string;
      aiModel?: string;
      styleGuide?: string;
      game?: 'xenoblade' | 'risen' | 'risen2' | 'mother3' | 'metroidprime' | 'pokemon-xp';
    };

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const resolvedModel = (aiModel && gatewayModelMap[aiModel]) || 'google/gemini-3-flash-preview';

    if (!entries?.length) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mask Risen tags before ANY prompt text is built — one tag list per entry
    // (index-aligned with `entries`, since the model echoes back an `index`
    // field), used to unmask whichever result field references that index.
    const isRisen = game === 'risen' || game === 'risen1' || game === 'risen2';
    const isMother3 = game === 'mother3';
    const isMetroidPrime = game === 'metroidprime';
    const isPokemonXp = game === 'pokemon-xp';
    const risenTagsByIndex: string[][] = [];
    const pokemonXpTokensByIndex: string[][] = [];
    const promptEntries: AnalysisEntry[] = isPokemonXp
      ? entries.map((e) => {
          const { maskedA, maskedB, tokens } = maskPokemonXpPair(e.original, e.translation);
          pokemonXpTokensByIndex.push(tokens);
          return { ...e, original: maskedA, translation: maskedB };
        })
      : isRisen
      ? entries.map((e) => {
          const { maskedA, maskedB, tags } = maskRisenTagPair(e.original, e.translation);
          risenTagsByIndex.push(tags);
          return { ...e, original: maskedA, translation: maskedB };
        })
      : entries;

    const prompt = buildPrompt(action, promptEntries, glossary, styleGuide, isRisen, isMother3, isMetroidPrime, isPokemonXp);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages: [
          { role: 'system', content: 'أنت محلل ترجمات ألعاب محترف. أجب دائماً بصيغة JSON صالحة فقط بدون أي نص إضافي.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 6000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'تم تجاوز حد الطلبات، حاول لاحقاً' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'يرجى شحن رصيد الذكاء الاصطناعي' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || '';
    let parsed = parseAIResponse(content);
    if (isRisen || isPokemonXp) parsed = unmaskAnalysisResult(parsed, risenTagsByIndex, pokemonXpTokensByIndex);

    return new Response(JSON.stringify({ action, ...parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'خطأ غير متوقع',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
