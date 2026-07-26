import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createRisenMasker, unmaskRisenTags } from "../_shared/risen-tag-mask.ts";
import { RISEN_FORGET_OTHER_GAME_RULE_EN } from "../_shared/risen-persona-guard.ts";
import { MOTHER3_FORGET_OTHER_GAME_RULE_EN } from "../_shared/mother3-persona-guard.ts";
import { METROID_PRIME_FORGET_OTHER_GAME_RULE_EN } from '../_shared/metroid-prime-persona-guard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { text, style, entries, glossary, game } = body;

    // Mask Risen tags before ANY prompt text is built — the response here is a
    // single combined string (per-entry masking isn't needed), so one shared
    // masker for the whole request is enough; unmask the final result once.
    const isRisen = game === 'risen' || game === 'risen1' || game === 'risen2';
    const isMother3 = game === 'mother3';
    const masker = isRisen ? createRisenMasker() : null;
    const pt = (s: string): string => (masker && typeof s === 'string' ? masker.mask(s) : s);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let systemPrompt = '';
    let userPrompt = '';

    if (style === 'back-translate') {
      if (!text?.trim()) {
        return new Response(JSON.stringify({ error: 'No text provided' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      systemPrompt = `You are a professional Arabic-to-English translator for video game localization.
Translate the Arabic text back to English as accurately as possible.
- Preserve the original meaning and tone
- Keep technical tags like [ML:...] and {variables} unchanged
- Keep game terms in their English form
- Return ONLY the English translation, no explanations`;
      userPrompt = `Translate this Arabic text to English:\n\n${pt(text)}`;

    } else if (style === 'ai-fix') {
      // AI Fix suggestion: given original + translation + issue description, suggest a fix
      const { original, translation: trans, issues } = body;
      if (!original || !trans) {
        return new Response(JSON.stringify({ error: 'Missing original or translation' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      systemPrompt = `You are a professional Arabic video game localization expert.
You are given an English original text, its Arabic translation, and a list of detected quality issues.
Fix the Arabic translation to resolve ALL the listed issues while preserving the meaning.
Rules:
- Keep ALL technical tags like [ML:...], {variables}, and Unicode control characters EXACTLY as they appear
- Keep game terminology consistent
- Return ONLY the fixed Arabic translation, nothing else
- If the issues mention missing numbers, add them back
- If the issues mention missing variables, add them back
- If the issues mention extra spaces, remove them
- If the issues mention punctuation, fix it
- Do NOT change parts that have no issues`;
      userPrompt = `English original: ${pt(original)}\n\nCurrent Arabic translation: ${pt(trans)}\n\nDetected issues:\n${issues}\n\nProvide the fixed Arabic translation:`;

    } else if (style === 'context-check') {
      // Contextual check: verify translation makes sense in game context
      if (!entries || !Array.isArray(entries)) {
        return new Response(JSON.stringify({ error: 'Missing entries array' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const glossaryContext = glossary ? `\nGame glossary for reference:\n${glossary.slice(0, 3000)}` : '';
      const gameLabel = isMother3 ? 'MOTHER 3' : isRisen ? 'Risen' : 'Xenoblade Chronicles 3';
      systemPrompt = `You are a professional video game localization QA reviewer for ${gameLabel} Arabic translation.
${isMetroidPrime ? METROID_PRIME_FORGET_OTHER_GAME_RULE_EN + '\n' : isMother3 ? MOTHER3_FORGET_OTHER_GAME_RULE_EN + '\n' : isRisen ? RISEN_FORGET_OTHER_GAME_RULE_EN + '\n' : ''}Review each translation for contextual accuracy in the game's universe.
Check for:
1. Character names used correctly and consistently
2. Game terminology matching the glossary
3. Tone appropriate for the context (battle cries, menus, dialogue)
4. Gender agreement in Arabic
5. Logical sense in game context

Return a JSON array of objects. For each entry that has issues, include:
{ "key": "entry_key", "issues": ["issue description 1", "issue description 2"], "suggestion": "suggested fix if applicable" }

Only include entries that have actual contextual issues. If an entry is fine, skip it.
Return ONLY the JSON array, no other text.${glossaryContext}`;
      userPrompt = `Review these translations:\n${entries.map((e: any) => `[${e.key}] EN: ${pt(e.original)}\nAR: ${pt(e.translation)}`).join('\n\n')}`;

    } else if (style === 'batch-improve') {
      // Batch improve: improve wording of multiple translations at once
      if (!entries || !Array.isArray(entries)) {
        return new Response(JSON.stringify({ error: 'Missing entries array' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const improvementStyle = body.improvementStyle || 'natural';
      const styleGuides: Record<string, string> = {
        natural: 'Make the Arabic sound natural and fluent, avoiding literal translations.',
        formal: 'Use formal/classical Arabic (فصحى). Dignified vocabulary for epic narratives.',
        concise: 'Make translations more concise while preserving meaning. Shorter is better for UI.',
        expressive: 'Make translations more expressive and engaging. Add emotional depth.',
      };
      const guide = styleGuides[improvementStyle] || styleGuides.natural;
      const glossaryContext = glossary ? `\nGame glossary - use these exact terms:\n${glossary.slice(0, 3000)}` : '';
      systemPrompt = `You are a professional Arabic video game localization expert.
Improve the Arabic translations following this style: ${guide}
Rules:
- Keep ALL technical tags like [ML:...], {variables}, and Unicode control characters EXACTLY as they appear
- Keep game terminology from the glossary consistent
- Return a JSON array of objects: { "key": "entry_key", "improved": "improved Arabic text" }
- Only include entries where you actually made improvements
- If a translation is already good, skip it
- Return ONLY the JSON array${glossaryContext}`;
      userPrompt = `Improve these translations:\n${entries.map((e: any) => `[${e.key}] EN: ${pt(e.original)}\nAR: ${pt(e.translation)}`).join('\n\n')}`;

    } else if (style === 'mismatch-detect') {
      // Detect misplaced translations using AI
      if (!entries || !Array.isArray(entries)) {
        return new Response(JSON.stringify({ error: 'Missing entries array' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      systemPrompt = `You are a professional video game translation QA expert.
You are given pairs of English original text and their Arabic translations.
Your job is to detect MISMATCHED translations — where an Arabic translation clearly does NOT correspond to its paired English original.

Signs of a mismatch:
1. The translation talks about a completely different topic than the original
2. Names/numbers/variables in the translation don't match the original
3. The translation appears to belong to a different entry entirely
4. The meaning is completely unrelated (not just a bad translation, but WRONG content)

Do NOT flag:
- Bad quality translations (those are still matched correctly)
- Literal translations (still correct target)
- Missing content (partial translations are OK)

Return a JSON array of objects for ONLY the mismatched entries:
{ "key": "entry_key", "reason": "brief Arabic explanation of why this is mismatched", "confidence": "high" or "medium" }

If all translations match their originals, return an empty array [].
Return ONLY the JSON array.`;
      userPrompt = `Check these translation pairs for mismatches:\n${entries.map((e: any) => `[${e.key}] EN: ${pt(e.original)}\nAR: ${pt(e.translation)}`).join('\n\n')}`;

    } else {
      // Style translation
      if (!text?.trim()) {
        return new Response(JSON.stringify({ error: 'No text provided' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const styleGuides: Record<string, string> = {
        formal: 'Use formal/classical Arabic (فصحى). Avoid colloquial expressions. Use dignified vocabulary suitable for epic narratives.',
        informal: 'Use casual/colloquial Arabic. Keep it natural and conversational, like everyday speech.',
        poetic: 'Use poetic/literary Arabic. Employ metaphors, alliteration, and rhythmic phrasing where appropriate.',
        gaming: 'Use modern gaming Arabic terminology. Keep it punchy, action-oriented, and exciting.',
      };
      const guide = styleGuides[style] || styleGuides.formal;
      systemPrompt = `You are a professional English-to-Arabic translator for video game localization.
Translate the text to Arabic following this style guide:
${guide}
- Preserve technical tags like [ML:...] and {variables} unchanged
- Return ONLY the Arabic translation, no explanations`;
      userPrompt = `Translate to Arabic:\n\n${pt(text)}`;
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'تم تجاوز حد الطلبات، حاول لاحقاً' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'رصيد غير كافٍ، يرجى إضافة رصيد' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const t = await response.text();
      console.error('AI gateway error:', response.status, t);
      return new Response(JSON.stringify({ error: 'خطأ في خدمة الذكاء الاصطناعي' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    let result = data.choices?.[0]?.message?.content?.trim() || '';
    if (masker) result = unmaskRisenTags(result, masker.tags);

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('translation-tools error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
