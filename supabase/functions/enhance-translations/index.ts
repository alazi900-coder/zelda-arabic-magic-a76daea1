import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const { entries, action, glossary, aiModel } = await req.json() as {
      entries: EnhanceEntry[];
      action: 'analyze' | 'enhance' | 'alternatives';
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
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pre-analyze context for all entries
    const entriesWithContext = entries.map(e => ({
      ...e,
      detectedContext: {
        sceneType: detectSceneType(e.fileName || '', e.original),
        character: detectCharacter(e.original, e.fileName || ''),
      }
    }));

    // Build analysis prompt
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
    
    // Parse JSON from AI response
    let parsed: { results: any[] } = { results: [] };
    try {
      // Extract JSON from potential markdown code block
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = jsonMatch[1] || content;
      parsed = JSON.parse(jsonStr.trim());
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, 'Content:', content.slice(0, 500));
      // Try to extract partial results
      const resultsMatch = content.match(/"results"\s*:\s*\[([\s\S]*?)\]/);
      if (resultsMatch) {
        try {
          parsed = { results: JSON.parse(`[${resultsMatch[1]}]`) };
        } catch { /* ignore */ }
      }
    }

    // Merge AI analysis with pre-detected context
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
