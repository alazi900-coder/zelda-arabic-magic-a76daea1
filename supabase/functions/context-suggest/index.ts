// Context-aware translation suggestions for Xenoblade entries.
// Uses Lovable AI Gateway + tool calling to return 3 stylistic suggestions.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface ContextEntry {
  original: string;
  translation: string;
}

interface RequestBody {
  target: ContextEntry;
  context: ContextEntry[];
  glossary?: string;
  file?: string;
}

const MODEL = 'google/gemini-3-flash-preview';

const SYSTEM_PROMPT = `أنت مترجم ألعاب فيديو متخصص في سلسلة Xenoblade Chronicles.
قدّم 3 اقتراحات مختلفة لترجمة النص المستهدف بأساليب متنوعة:
- formal (رسمي): لغة فصحى مهذبة مناسبة للقصة الرئيسية والشخصيات الرسمية.
- natural (طبيعي): حوار يومي سلس يناسب معظم المواقف.
- creative (إبداعي): صياغة حيوية أو شاعرية تناسب اللحظات الدرامية.

قواعد صارمة:
1. التزم تماماً بمصطلحات القاموس المُعطى — لا تغيّر ترجمة مصطلح موجود فيه.
2. احفظ كل الرموز التقنية والمتغيرات كما هي بدون أي تعديل: الأقواس [Tag], الأكواد {var}, الأحرف الخاصة \uFFF9-\uFFFC و \uE000-\uF8FF, ورموز السطر \\n.
3. لا تخترع شخصيات أو معلومات. استخدم السياق المُعطى لفهم نبرة الحديث فقط.
4. اشرح سبب كل اقتراح في جملة عربية موجزة (≤ 15 كلمة).
5. confidence رقم بين 0 و 1 يعكس ثقتك في ملاءمة الاقتراح للسياق.
6. contextNote: ملاحظة عربية قصيرة جداً (سطر واحد) عن السياق العام.`;

const tool = {
  type: 'function' as const,
  function: {
    name: 'return_suggestions',
    description: 'إرجاع 3 اقتراحات ترجمة مع ملاحظة عن السياق',
    parameters: {
      type: 'object',
      properties: {
        suggestions: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              translation: { type: 'string' },
              style: { type: 'string', enum: ['formal', 'natural', 'creative'] },
              styleLabel: { type: 'string' },
              reason: { type: 'string' },
              confidence: { type: 'number' },
            },
            required: ['translation', 'style', 'styleLabel', 'reason', 'confidence'],
          },
        },
        contextNote: { type: 'string' },
      },
      required: ['suggestions', 'contextNote'],
    },
  },
};

function buildUserPrompt(body: RequestBody): string {
  const ctxLines = body.context
    .map((c, i) => `${i + 1}. EN: ${c.original}\n   AR: ${c.translation || '(غير مترجم)'}`)
    .join('\n');
  const glossaryBlock = body.glossary?.trim()
    ? `\n\nالقاموس (مصطلح=ترجمة):\n${body.glossary}`
    : '';
  const fileLine = body.file ? `\nالملف: ${body.file}` : '';
  return `النص المستهدف:
EN: ${body.target.original}
AR الحالية: ${body.target.translation || '(لا توجد)'}
${fileLine}

السياق المحيط (${body.context.length} سطر):
${ctxLines || '(لا يوجد سياق)'}${glossaryBlock}

أعد 3 اقتراحات عبر استدعاء الدالة return_suggestions.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing LOVABLE_API_KEY' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!body?.target?.original?.trim()) {
    return new Response(JSON.stringify({ error: 'target.original is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Lovable-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(body) },
        ],
        tools: [tool],
        tool_choice: { type: 'function', function: { name: 'return_suggestions' } },
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: 'تجاوز معدّل الطلبات. أعد المحاولة بعد قليل.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: 'نفدت أرصدة Lovable AI. الرجاء إضافة رصيد.' }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!response.ok) {
      const t = await response.text();
      return new Response(JSON.stringify({ error: `AI gateway error: ${t.slice(0, 200)}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = toolCall?.function?.arguments;
    if (!argsRaw) {
      return new Response(JSON.stringify({ error: 'لم يستجب النموذج بصيغة منظَّمة' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const parsed = typeof argsRaw === 'string' ? JSON.parse(argsRaw) : argsRaw;
    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
