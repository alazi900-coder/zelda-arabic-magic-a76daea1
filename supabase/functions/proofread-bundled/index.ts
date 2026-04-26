import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ProofreadEntry {
  key: string;
  arabic: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entries } = await req.json() as { entries: ProofreadEntry[] };

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    // Process in chunks of 40
    const CHUNK_SIZE = 40;
    const allResults: { key: string; original: string; corrected: string }[] = [];
    let skippedChunks = 0;
    let skippedEntries = 0;

    for (let c = 0; c < entries.length; c += CHUNK_SIZE) {
      const chunk = entries.slice(c, c + CHUNK_SIZE);

      const prompt = `أنت مدقق لغوي عربي متخصص في ترجمات ألعاب الفيديو. مهمتك تصحيح الأخطاء الإملائية والنحوية فقط دون تغيير المعنى أو الأسلوب.

قواعد صارمة:
- صحّح الأخطاء الإملائية فقط (مثل: "الاعب" → "اللاعب"، "مفتوحه" → "مفتوحة")
- صحّح التاء المربوطة والمفتوحة إن كانت خاطئة
- صحّح الألف المقصورة واللينة (مثل: "الي" → "إلى")
- صحّح الهمزات الخاطئة (مثل: "مسئول" → "مسؤول")
- أزل المسافات الزائدة أو المكررة
- لا تغير الوسوم [Tags] أو الرموز ￼
- لا تغير المصطلحات الإنجليزية المتروكة عمداً
- إذا كان النص صحيحاً تماماً، أعد نفس النص بدون تغيير
- لا تضف تشكيلات أو حركات

النصوص:
${chunk.map((e, i) => `[${i}] "${e.arabic}"`).join('\n')}

أخرج JSON array فقط بنفس الترتيب يحتوي النصوص المصححة. مثال: ["نص مصحح 1", "نص مصحح 2"]`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'أنت مدقق إملائي عربي. أخرج ONLY JSON arrays. لا تضف أي نص آخر.' },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('AI gateway error:', response.status, errText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: 'تم تجاوز حد الطلبات، حاول مرة أخرى لاحقاً' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: 'الرصيد غير كافٍ، يرجى إضافة رصيد' }), {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`AI error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error('Failed to parse AI response:', content.substring(0, 200));
        skippedChunks++;
        skippedEntries += chunk.length;
        continue;
      }

      try {
        const sanitized = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, ' ');
        const corrected: string[] = JSON.parse(sanitized);

        for (let i = 0; i < Math.min(chunk.length, corrected.length); i++) {
          const orig = chunk[i].arabic.trim();
          const fixed = corrected[i]?.trim();
          if (fixed && fixed !== orig) {
            allResults.push({
              key: chunk[i].key,
              original: orig,
              corrected: fixed,
            });
          }
        }
      } catch (parseErr) {
        console.error('JSON parse error for chunk:', parseErr);
        skippedChunks++;
        skippedEntries += chunk.length;
      }
    }

    return new Response(JSON.stringify({
      results: allResults,
      total: entries.length,
      skippedChunks,
      skippedEntries,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Proofread error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'خطأ غير متوقع' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
