import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface EnhanceEntry {
  key: string;
  original: string;
  translation: string;
  fileName?: string;
  tableName?: string;
}

interface EnhanceResult {
  key: string;
  original: string;
  currentTranslation: string;
  context: {
    character?: string;
    sceneType: 'combat' | 'emotional' | 'system' | 'dialogue' | 'tutorial' | 'unknown';
    tone: 'formal' | 'casual' | 'dramatic' | 'neutral';
  };
  issues: Array<{
    type: 'literal' | 'awkward' | 'inconsistent' | 'context_mismatch' | 'style';
    message: string;
    severity: 'high' | 'medium' | 'low';
  }>;
  suggestions: Array<{
    text: string;
    reason: string;
    style: 'literary' | 'natural' | 'concise' | 'dramatic';
  }>;
  preferredSuggestion?: string;
}

// Detect scene type from file name and content
function detectSceneType(fileName: string, original: string): 'combat' | 'emotional' | 'system' | 'dialogue' | 'tutorial' | 'unknown' {
  const fn = fileName?.toLowerCase() || '';
  const orig = original?.toLowerCase() || '';
  
  if (fn.includes('btl') || fn.includes('battle') || /\b(attack|damage|hp|skill|buff|debuff|combo|chain)\b/i.test(orig)) {
    return 'combat';
  }
  if (fn.includes('ev_') || fn.includes('event') || /\b(sorry|thank|love|miss|remember|goodbye|promise|forever)\b/i.test(orig)) {
    return 'emotional';
  }
  if (fn.includes('mnu') || fn.includes('sys') || fn.includes('ui') || /\b(menu|option|setting|select|confirm|cancel|save|load)\b/i.test(orig)) {
    return 'system';
  }
  if (fn.includes('tuto') || fn.includes('help') || /\b(tutorial|tip|hint|learn|guide|how to)\b/i.test(orig)) {
    return 'tutorial';
  }
  if (fn.includes('msg_') || fn.includes('talk') || fn.includes('npc')) {
    return 'dialogue';
  }
  return 'unknown';
}

// Detect speaking character from content patterns
function detectCharacter(original: string, fileName: string): string | undefined {
  const characters = ['Noah', 'Mio', 'Eunie', 'Taion', 'Lanz', 'Sena', 'Ethel', 'Cammuravi', 'Monica', 'Guernica', 'Moebius', 'Consul'];
  
  for (const char of characters) {
    if (original.includes(char) || fileName?.toLowerCase().includes(char.toLowerCase())) {
      return char;
    }
  }
  
  // Detect based on speech patterns
  if (/\b(mate|blimey|innit)\b/i.test(original)) return 'Eunie';
  if (/\b(logically|therefore|analysis)\b/i.test(original)) return 'Taion';
  if (/\b(smash|crush|strong)\b/i.test(original)) return 'Lanz';
  if (/\b(ouroboros|interlink|moebius)\b/i.test(original)) return 'System';
  
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entries, action, mode, glossary, aiModel } = await req.json() as {
      entries: EnhanceEntry[];
      action?: 'analyze' | 'enhance' | 'alternatives';
      mode?: 'enhance' | 'grammar';
      glossary?: string;
      aiModel?: string;
    };

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const gatewayModelMap: Record<string, string> = {
      'gemini-2.5-flash': 'google/gemini-2.5-flash',
      'gemini-2.5-pro': 'google/gemini-2.5-pro',
      'gemini-3-flash-preview': 'google/gemini-3-flash-preview',
      'gpt-5': 'openai/gpt-5',
    };
    const resolvedModel = (aiModel && gatewayModelMap[aiModel]) || 'google/gemini-3-flash-preview';

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ results: [], suggestions: [], issues: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle grammar check mode (new)
    if (mode === 'grammar') {
      const grammarPrompt = `أنت مدقق نحوي عربي. افحص النصوص التالية بحثاً عن أخطاء:
1. أخطاء إملائية (همزات، تاء مربوطة/مفتوحة)
2. أخطاء نحوية (رفع/نصب/جر)
3. علامات ترقيم خاطئة

النصوص:
${entries.map((e, i) => `[${i}] ${e.translation}`).join('\n')}

أجب بصيغة JSON:
{
  "issues": [
    {"index": 0, "issue": "وصف الخطأ", "suggestion": "النص المصحح"}
  ]
}`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: resolvedModel,
          messages: [
            { role: 'system', content: 'أنت مدقق نحوي. أجب بـ JSON صالح فقط.' },
            { role: 'user', content: grammarPrompt }
          ],
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Grammar check error:', response.status, errText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: 'تم تجاوز حد الطلبات' }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`AI error: ${response.status}`);
      }

      const aiResult = await response.json();
      const content = aiResult.choices?.[0]?.message?.content || '';
      let parsed: { issues: any[] } = { issues: [] };
      try {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
        parsed = JSON.parse((jsonMatch[1] || content).trim());
      } catch { /* ignore */ }

      const mappedIssues = (parsed.issues || []).map((i: any) => ({
        key: entries[i.index]?.key || '',
        original: entries[i.index]?.original || '',
        translation: entries[i.index]?.translation || '',
        issue: i.issue,
        suggestion: i.suggestion,
      })).filter((i: any) => i.key && i.suggestion);

      return new Response(JSON.stringify({ issues: mappedIssues }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle style enhancement mode (new)
    if (mode === 'enhance') {
      const enhancePrompt = `أنت مترجم ألعاب فيديو محترف. راجع الترجمات واقترح تحسينات:

${entries.map((e, i) => `[${i}] الأصل: ${e.original}\nالترجمة: ${e.translation}`).join('\n\n')}

${glossary ? `القاموس:\n${glossary.slice(0, 2000)}` : ''}

أجب بـ JSON:
{
  "suggestions": [
    {"index": 0, "suggested": "النص المحسن", "reason": "السبب", "type": "style|accuracy|consistency"}
  ]
}

أرجع فقط الترجمات التي تحتاج تحسين.`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: resolvedModel,
          messages: [
            { role: 'system', content: 'أنت مترجم محترف. أجب بـ JSON صالح فقط.' },
            { role: 'user', content: enhancePrompt }
          ],
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Enhance error:', response.status, errText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: 'تم تجاوز حد الطلبات' }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`AI error: ${response.status}`);
      }

      const aiResult = await response.json();
      const content = aiResult.choices?.[0]?.message?.content || '';
      let parsed: { suggestions: any[] } = { suggestions: [] };
      try {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
        parsed = JSON.parse((jsonMatch[1] || content).trim());
      } catch { /* ignore */ }

      const mappedSuggestions = (parsed.suggestions || []).map((s: any) => ({
        key: entries[s.index]?.key || '',
        original: entries[s.index]?.original || '',
        current: entries[s.index]?.translation || '',
        suggested: s.suggested,
        reason: s.reason,
        type: s.type || 'style',
      })).filter((s: any) => s.key && s.suggested);

      return new Response(JSON.stringify({ suggestions: mappedSuggestions }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Original full analysis mode (action-based)
    const entriesWithContext = entries.map(e => ({
      ...e,
      detectedContext: {
        sceneType: detectSceneType(e.fileName || '', e.original),
        character: detectCharacter(e.original, e.fileName || ''),
      }
    }));

    const analysisPrompt = `أنت خبير في تحسين ترجمات ألعاب الفيديو من الإنجليزية للعربية، متخصص في لعبة Xenoblade Chronicles 3.

مهمتك: تحليل الترجمات التالية وتقديم اقتراحات تحسين مع مراعاة:
1. السياق: من يتحدث؟ ما نوع المشهد (قتال/عاطفي/نظام)؟
2. الطبيعية: هل الترجمة تبدو طبيعية بالعربية أم حرفية جامدة؟
3. الأسلوب: هل يتناسب مع شخصية المتحدث ونبرة المشهد؟
4. البدائل: اقترح 2-3 بدائل مختلفة الأسلوب (أدبي، طبيعي، مختصر)

${glossary ? `القاموس المعتمد (التزم بهذه المصطلحات):\n${glossary.split('\n').slice(0, 100).join('\n')}` : ''}

النصوص للتحليل:
${entriesWithContext.map((e, i) => `[${i}] 
الإنجليزي: ${e.original}
الترجمة الحالية: ${e.translation}
السياق المكتشف: ${e.detectedContext.sceneType}${e.detectedContext.character ? `, المتحدث: ${e.detectedContext.character}` : ''}`).join('\n\n')}

أجب بصيغة JSON:
{
  "results": [
    {
      "index": 0,
      "issues": [
        {"type": "literal|awkward|context_mismatch|style", "message": "وصف المشكلة", "severity": "high|medium|low"}
      ],
      "suggestions": [
        {"text": "الترجمة البديلة", "reason": "سبب الاقتراح", "style": "literary|natural|concise|dramatic"}
      ],
      "preferredSuggestion": "أفضل اقتراح",
      "contextAdjustment": {
        "character": "اسم الشخصية إن تم تحديدها",
        "tone": "formal|casual|dramatic|neutral"
      }
    }
  ]
}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages: [
          { role: 'system', content: 'أنت مترجم ألعاب محترف متخصص في Xenoblade Chronicles 3. أجب دائماً بصيغة JSON صالحة.' },
          { role: 'user', content: analysisPrompt }
        ],
        temperature: 0.7,
        max_tokens: 4000,
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
      throw new Error(`AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || '';
    
    let parsed: { results: any[] } = { results: [] };
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = jsonMatch[1] || content;
      parsed = JSON.parse(jsonStr.trim());
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, 'Content:', content.slice(0, 500));
      const resultsMatch = content.match(/"results"\s*:\s*\[([\s\S]*?)\]/);
      if (resultsMatch) {
        try {
          parsed = { results: JSON.parse(`[${resultsMatch[1]}]`) };
        } catch { /* ignore */ }
      }
    }

    const finalResults: EnhanceResult[] = entriesWithContext.map((entry, i) => {
      const aiAnalysis = parsed.results?.find((r: any) => r.index === i) || {};
      
      return {
        key: entry.key,
        original: entry.original,
        currentTranslation: entry.translation,
        context: {
          character: aiAnalysis.contextAdjustment?.character || entry.detectedContext.character,
          sceneType: entry.detectedContext.sceneType,
          tone: aiAnalysis.contextAdjustment?.tone || 'neutral',
        },
        issues: aiAnalysis.issues || [],
        suggestions: aiAnalysis.suggestions || [],
        preferredSuggestion: aiAnalysis.preferredSuggestion,
      };
    });

    return new Response(JSON.stringify({ results: finalResults }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Enhancement error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'خطأ غير متوقع',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
