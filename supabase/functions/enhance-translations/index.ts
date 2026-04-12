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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entries, mode, glossary, aiModel } = await req.json() as {
      entries: EnhanceEntry[];
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
      return new Response(JSON.stringify({ suggestions: [], issues: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Grammar check mode
    if (mode === 'grammar') {
      const grammarPrompt = `أنت مدقق لغوي عربي متخصص في ترجمات ألعاب الفيديو.

افحص كل ترجمة بدقة وابحث عن:
1. **أخطاء إملائية**: همزات خاطئة (إ/أ/ا)، تاء مربوطة/مفتوحة، ألف مقصورة/ممدودة
2. **أخطاء نحوية**: رفع/نصب/جر، مطابقة المذكر/المؤنث، جمع/مفرد
3. **حروف ناقصة أو زائدة**: كلمات بها حرف محذوف أو مكرر خطأً
4. **علامات ترقيم**: فواصل ونقاط في غير موضعها
5. **مسافات**: مسافات مزدوجة أو ناقصة بين الكلمات
6. **أرقام ورموز**: تنسيق غير صحيح

لكل خطأ، حدد مستوى الخطورة:
- high: خطأ يغير المعنى أو يجعل النص غير مفهوم
- medium: خطأ إملائي أو نحوي واضح
- low: تحسين بسيط في الترقيم أو التنسيق

النصوص:
${entries.map((e, i) => `[${i}] الأصل: ${e.original}\nالترجمة: ${e.translation}`).join('\n\n')}

أجب بـ JSON فقط:
{
  "issues": [
    {"index": 0, "issue": "وصف الخطأ بدقة", "suggestion": "النص المصحح كاملاً", "severity": "high|medium|low"}
  ]
}

أعِد فقط النصوص التي بها أخطاء فعلية. لا تقترح تحسينات أسلوبية هنا.`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: resolvedModel,
          messages: [
            { role: 'system', content: 'أنت مدقق لغوي عربي. أجب بـ JSON صالح فقط. لا تقترح تعديلات أسلوبية — فقط أخطاء موضوعية.' },
            { role: 'user', content: grammarPrompt }
          ],
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
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: 'الرصيد غير كافٍ' }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`AI error: ${response.status}`);
      }

      const aiResult = await response.json();
      const content = aiResult.choices?.[0]?.message?.content || '';
      let parsed: { issues: any[] } = { issues: [] };
      try {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
        const raw = (jsonMatch[1] || content).trim();
        // Try to extract JSON object from the response
        const objMatch = raw.match(/\{[\s\S]*\}/);
        if (objMatch) {
          parsed = JSON.parse(objMatch[0]);
        } else {
          console.error('No JSON object found in AI response:', content.slice(0, 500));
        }
      } catch (e) {
        console.error('JSON parse error:', e, 'Content:', content.slice(0, 500));
      }

      const mappedIssues = (parsed.issues || []).map((i: any) => ({
        key: entries[i.index]?.key || '',
        original: entries[i.index]?.original || '',
        translation: entries[i.index]?.translation || '',
        issue: i.issue,
        suggestion: i.suggestion,
        severity: i.severity || 'medium',
      })).filter((i: any) => i.key && i.suggestion);

      return new Response(JSON.stringify({ issues: mappedIssues }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Enhanced style/quality check mode
    const enhancePrompt = `أنت مترجم ألعاب فيديو محترف ومراجع لغوي. راجع الترجمات التالية واقترح تحسينات.

**أنواع المشاكل التي يجب البحث عنها:**
1. **missing_char** — حرف ناقص أو زائد في كلمة (مثل "المعركه" بدل "المعركة")
2. **grammar** — خطأ نحوي واضح (مذكر/مؤنث، رفع/نصب)
3. **terminology** — مصطلح مترجم بشكل خاطئ أو غير متسق مع القاموس
4. **accuracy** — ترجمة غير دقيقة تحرف المعنى الأصلي
5. **style** — صياغة ركيكة أو حرفية جداً يمكن تحسينها
6. **consistency** — نفس المصطلح مترجم بطرق مختلفة
7. **punctuation** — علامات ترقيم خاطئة أو ناقصة

${glossary ? `**القاموس المعتمد (التزم بهذه المصطلحات):**\n${glossary.slice(0, 3000)}` : ''}

**النصوص للمراجعة:**
${entries.map((e, i) => `[${i}] الأصل: ${e.original}\nالترجمة: ${e.translation}`).join('\n\n')}

أجب بـ JSON فقط:
{
  "suggestions": [
    {"index": 0, "suggested": "النص المحسن كاملاً", "reason": "شرح مختصر للمشكلة", "type": "missing_char|grammar|terminology|accuracy|style|consistency|punctuation"}
  ]
}

**مهم:**
- أعِد فقط الترجمات التي بها مشاكل حقيقية
- لا تقترح تعديلات تفضيلية بحتة
- ركز على الأخطاء الموضوعية والحروف الناقصة أولاً
- إذا كان النص صحيحاً لا تُعِده`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages: [
          { role: 'system', content: 'أنت مترجم ومراجع محترف. أجب بـ JSON صالح فقط. ركز على الأخطاء الحقيقية لا الأسلوبية.' },
          { role: 'user', content: enhancePrompt }
        ],
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
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'الرصيد غير كافٍ' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || '';
    let parsed: { suggestions: any[] } = { suggestions: [] };
      try {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
        const raw = (jsonMatch[1] || content).trim();
        const objMatch = raw.match(/\{[\s\S]*\}/);
        if (objMatch) {
          parsed = JSON.parse(objMatch[0]);
        } else {
          console.error('No JSON object found in enhance response:', content.slice(0, 500));
        }
      } catch (e) {
        console.error('JSON parse error (enhance):', e, 'Content:', content.slice(0, 500));
      }

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
