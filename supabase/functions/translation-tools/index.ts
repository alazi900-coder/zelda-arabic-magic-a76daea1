import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, style } = await req.json();
    
    if (!text?.trim()) {
      return new Response(JSON.stringify({ error: 'No text provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
      // Back translation: Arabic → English
      systemPrompt = `You are a professional Arabic-to-English translator for video game localization.
Translate the Arabic text back to English as accurately as possible.
- Preserve the original meaning and tone
- Keep technical tags like [ML:...] and {variables} unchanged
- Keep game terms in their English form
- Return ONLY the English translation, no explanations`;
      userPrompt = `Translate this Arabic text to English:\n\n${text}`;
    } else {
      // Style translation: translate with specific style
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
      userPrompt = `Translate to Arabic:\n\n${text}`;
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
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'رصيد غير كافٍ، يرجى إضافة رصيد' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const t = await response.text();
      console.error('AI gateway error:', response.status, t);
      return new Response(JSON.stringify({ error: 'خطأ في خدمة الذكاء الاصطناعي' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim() || '';

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
