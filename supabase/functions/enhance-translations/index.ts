import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface EnhanceEntry {
  key: string;
  original: string;
  translation: string;
}

/** Robust JSON extractor — handles markdown fences, trailing commas, partial responses */
function extractJson(raw: string): any {
  let text = raw.trim();
  // Strip markdown code fences
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  // Find outermost { }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  let slice = text.slice(start, end + 1);
  // Fix trailing commas before ] or }
  slice = slice.replace(/,\s*([\]}])/g, '$1');
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

/** Map AI result back to entry using key (primary) or numeric index (fallback) */
function resolveEntry(item: any, entries: EnhanceEntry[]): EnhanceEntry | undefined {
  // Primary: match by key field the AI echoed back
  if (item.key) {
    const found = entries.find(e => e.key === item.key);
    if (found) return found;
  }
  // Fallback: use numeric index
  const idx = typeof item.index === 'number' ? item.index : parseInt(item.index, 10);
  if (!isNaN(idx) && idx >= 0 && idx < entries.length) return entries[idx];
  return undefined;
}

async function callAI(LOVABLE_API_KEY: string, messages: any[]): Promise<string> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('AI gateway error:', response.status, errText.slice(0, 300));
    if (response.status === 402) throw Object.assign(new Error('انتهى رصيد الذكاء الاصطناعي — استخدم مفتاح Gemini الشخصي'), { code: 402 });
    if (response.status === 429) throw Object.assign(new Error('تم تجاوز حد الطلبات — حاول بعد دقيقة'), { code: 429 });
    throw new Error(`AI error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { entries, mode, glossary } = await req.json() as {
      entries: EnhanceEntry[];
      mode?: 'enhance' | 'grammar';
      glossary?: string;
    };

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY غير مُعدَّل');

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ suggestions: [], issues: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build entry list with both index AND key for AI to echo back
    const entryList = entries.map((e, i) =>
      `[${i}] key="${e.key}"\nالأصل: ${e.original}\nالترجمة: ${e.translation}`
    ).join('\n\n');

    if (mode === 'grammar') {
      const prompt = `أنت مدقق لغوي عربي متخصص في ترجمات ألعاب الفيديو.

افحص الترجمات التالية وابحث عن أخطاء حقيقية فقط:
1. أخطاء إملائية: همزات خاطئة، تاء مربوطة/مفتوحة خاطئة، ألف مقصورة/ممدودة خاطئة
2. أخطاء نحوية: مذكر/مؤنث، رفع/نصب/جر
3. حروف ناقصة أو زائدة في الكلمة
4. علامات ترقيم خاطئة
5. مسافات مزدوجة أو ناقصة

مستوى الخطورة:
- high: خطأ يغير المعنى
- medium: خطأ إملائي أو نحوي واضح
- low: ترقيم أو تنسيق بسيط

النصوص:
${entryList}

أجب بـ JSON فقط — أعِد فقط الإدخالات التي بها أخطاء فعلية:
{
  "issues": [
    {"index": 0, "key": "المفتاح كما هو", "issue": "وصف دقيق", "suggestion": "النص المصحح كاملاً", "severity": "high|medium|low"}
  ]
}`;

      const content = await callAI(LOVABLE_API_KEY, [
        { role: 'system', content: 'أنت مدقق لغوي عربي. أجب بـ JSON صالح فقط. لا تقترح تعديلات أسلوبية.' },
        { role: 'user', content: prompt },
      ]);

      const parsed = extractJson(content);
      if (!parsed) {
        console.error('Grammar: failed to parse JSON:', content.slice(0, 400));
        return new Response(JSON.stringify({ issues: [], parseError: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const issues = (parsed.issues || []).map((item: any) => {
        const entry = resolveEntry(item, entries);
        if (!entry || !item.suggestion?.trim()) return null;
        return {
          key: entry.key,
          original: entry.original,
          translation: entry.translation,
          issue: item.issue || '',
          suggestion: item.suggestion,
          severity: item.severity || 'medium',
        };
      }).filter(Boolean);

      return new Response(JSON.stringify({ issues }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Enhance mode ──
    const glossarySection = glossary?.trim()
      ? `\n**القاموس المعتمد:**\n${glossary.slice(0, 3000)}\n`
      : '';

    const prompt = `أنت مترجم ألعاب فيديو محترف. راجع الترجمات التالية واقترح تحسينات للمشاكل الحقيقية فقط.

أنواع المشاكل:
- missing_char: حرف ناقص أو زائد (مثل "المعركه" → "المعركة")
- grammar: خطأ نحوي (مذكر/مؤنث، رفع/نصب)
- terminology: مصطلح خاطئ أو غير متسق مع القاموس
- accuracy: ترجمة تحرف المعنى الأصلي
- style: صياغة ركيكة أو حرفية جداً
- consistency: نفس المصطلح مترجم بطرق مختلفة
- punctuation: علامات ترقيم خاطئة أو ناقصة
${glossarySection}
النصوص:
${entryList}

أجب بـ JSON فقط — أعِد فقط الإدخالات التي بها مشاكل حقيقية:
{
  "suggestions": [
    {"index": 0, "key": "المفتاح كما هو", "suggested": "النص المحسن كاملاً", "reason": "شرح مختصر", "type": "missing_char|grammar|terminology|accuracy|style|consistency|punctuation"}
  ]
}

مهم: لا تقترح تعديلات تفضيلية بحتة. ركز على الأخطاء الموضوعية.`;

    const content = await callAI(LOVABLE_API_KEY, [
      { role: 'system', content: 'أنت مترجم ومراجع محترف. أجب بـ JSON صالح فقط. ركز على الأخطاء الحقيقية.' },
      { role: 'user', content: prompt },
    ]);

    const parsed = extractJson(content);
    if (!parsed) {
      console.error('Enhance: failed to parse JSON:', content.slice(0, 400));
      return new Response(JSON.stringify({ suggestions: [], parseError: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const suggestions = (parsed.suggestions || []).map((item: any) => {
      const entry = resolveEntry(item, entries);
      if (!entry || !item.suggested?.trim()) return null;
      return {
        key: entry.key,
        original: entry.original,
        current: entry.translation,
        suggested: item.suggested,
        reason: item.reason || '',
        type: item.type || 'style',
      };
    }).filter(Boolean);

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Enhancement error:', err);
    const code = err.code === 402 ? 402 : err.code === 429 ? 429 : 500;
    return new Response(JSON.stringify({ error: err.message || 'خطأ غير متوقع' }), {
      status: code,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
