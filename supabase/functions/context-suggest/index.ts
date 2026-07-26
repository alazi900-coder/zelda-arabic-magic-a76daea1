// Context-aware translation suggestions (Xenoblade, Risen 1, and any other
// game entry sent — see the `game` field on RequestBody).
// Supports Lovable AI Gateway (Gemini/GPT) and DeepSeek (V4 Pro/Flash).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { maskRisenTags, unmaskRisenTags } from '../_shared/risen-tag-mask.ts';
import { RISEN_FORGET_OTHER_GAME_RULE } from '../_shared/risen-persona-guard.ts';
import { MOTHER3_FORGET_OTHER_GAME_RULE } from '../_shared/mother3-persona-guard.ts';
import { METROID_PRIME_FORGET_OTHER_GAME_RULE } from '../_shared/metroid-prime-persona-guard.ts';

interface ContextEntry {
  original: string;
  translation: string;
}

interface TmExample {
  original: string;
  translation: string;
  similarity?: number;
}

interface Speaker {
  owner?: string;
  role?: string;
}

interface RequestBody {
  target: ContextEntry;
  context: ContextEntry[];
  tmExamples?: TmExample[];
  maxBytes?: number;
  glossary?: string;
  file?: string;
  provider?: 'gemini' | 'deepseek' | 'tokenrouter' | 'mymemory' | 'google';
  aiModel?: string;
  providerApiKey?: string;
  /** Which game this entry is from — the system prompt names it correctly instead
   * of always assuming Xenoblade. Defaults to Xenoblade for backward compatibility
   * with callers that don't send it yet. */
  game?: 'xenoblade' | 'risen' | 'risen2' | 'mother3' | 'metroidprime';
  /** Risen: the speaking NPC (Owner/Role fields from infos.tab), when known. */
  speaker?: Speaker;
  /** Risen: the entry's raw id/key (e.g. "HUD2_Damage_Edge") — grounds the model instead of it guessing from a bare filename. */
  entryKey?: string;
  /** Risen: the entry's resolved category label (e.g. "القوائم والواجهة"), from the app's own table-based classification. */
  category?: string;
}

const DEFAULT_LOVABLE_MODEL = 'google/gemini-3-flash-preview';

const GAME_LABELS: Record<string, string> = {
  xenoblade: 'سلسلة Xenoblade Chronicles',
  risen: 'لعبة Risen 1 (محرك Genome — عالم RPG مفتوح بطابع قروسطي)',
  risen2: 'لعبة Risen 2: Dark Waters (محرك Genome — عالم قراصنة مفتوح في الكاريبي)',
  mother3: 'لعبة MOTHER 3 (سلسلة MOTHER/EarthBound لـ Shigesato Itoi ونينتندو — أسلوب بسيط دافئ طريف)',
};

function buildSystemPrompt(game?: string): string {
  const isRisen = game === 'risen' || game === 'risen1' || game === 'risen2';
  const isMother3 = game === 'mother3';
  const gameLabel = GAME_LABELS[game || 'xenoblade'] || GAME_LABELS.xenoblade;
  const risenTagRule = isRisen
    ? '\n7. الأقواس ⟦0⟧, ⟦1⟧, ... في النص المستهدف رموز Risen محمية — انسخها كما هي بالضبط في كل اقتراح، بنفس موضعها النسبي، ولا تحاول ترجمة ما قد تمثله (لا تراها أصلاً، فقط رمزها).'
    : '';
  const forgetOtherGame = isMother3
    ? `\n${MOTHER3_FORGET_OTHER_GAME_RULE}\n`
    : isRisen
    ? `\n${RISEN_FORGET_OTHER_GAME_RULE}\n`
    : '';
  return `أنت مترجم ألعاب فيديو متخصص في ${gameLabel}.
${forgetOtherGame}قدّم 3 اقتراحات مختلفة لترجمة النص المستهدف بأساليب متنوعة:
- formal (رسمي): لغة فصحى مهذبة مناسبة للقصة الرئيسية والشخصيات الرسمية.
- natural (طبيعي): حوار يومي سلس يناسب معظم المواقف.
- creative (إبداعي): صياغة حيوية أو شاعرية تناسب اللحظات الدرامية.

قواعد صارمة:
1. التزم تماماً بمصطلحات القاموس المُعطى — لا تغيّر ترجمة مصطلح موجود فيه.
2. احفظ كل الرموز التقنية والمتغيرات كما هي بدون أي تعديل: الأقواس [Tag], الأكواد {var}, الأحرف الخاصة \uFFF9-\uFFFC و \uE000-\uF8FF, ورموز السطر \\n.
3. لا تخترع شخصيات أو معلومات. استخدم السياق المُعطى (وهوية المتحدث إن وُجدت) لفهم نبرة الحديث فقط.
4. اشرح سبب كل اقتراح في جملة عربية موجزة (≤ 15 كلمة).
5. confidence رقم بين 0 و 1 يعكس ثقتك في ملاءمة الاقتراح للسياق.
6. contextNote: ملاحظة عربية قصيرة جداً (سطر واحد) عن السياق العام.${risenTagRule}`;
}

const SUGGESTIONS_JSON_SCHEMA_HINT = `أعد JSON بالشكل التالي بالضبط ولا تضف أي نص خارجه:
{
  "suggestions": [
    { "translation": "...", "style": "formal", "styleLabel": "رسمي", "reason": "...", "confidence": 0.85 },
    { "translation": "...", "style": "natural", "styleLabel": "طبيعي", "reason": "...", "confidence": 0.9 },
    { "translation": "...", "style": "creative", "styleLabel": "إبداعي", "reason": "...", "confidence": 0.75 }
  ],
  "contextNote": "..."
}`;

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
  const speakerLine = (body.speaker?.owner || body.speaker?.role)
    ? `\nالمتحدث: ${[body.speaker.owner, body.speaker.role].filter(Boolean).join(' — ')}`
    : '';
  const idLine = body.entryKey ? `\nالمعرّف: ${body.entryKey}` : '';
  const categoryLine = body.category ? `\nتصنيف النص (مكانه الفعلي في اللعبة حسب بنية الملف — استخدمه بدل التخمين): ${body.category}` : '';

  // Translation Memory examples — help the model stay consistent with prior
  // translations of similar sentences across the project.
  const tm = (body.tmExamples || []).filter((t) => t?.translation?.trim());
  const tmBlock = tm.length
    ? `\n\nذاكرة الترجمة (جمل سابقة مشابهة — حافظ على نفس المصطلحات والأسلوب):\n${tm
        .map((t, i) => `${i + 1}. EN: ${t.original}\n   AR: ${t.translation}${t.similarity ? ` (تشابه ${t.similarity}%)` : ''}`)
        .join('\n')}`
    : '';

  // Hard byte limit — XC stores translations in fixed-size UTF-16LE buffers.
  const byteLimitBlock = (body.maxBytes && body.maxBytes > 0)
    ? `\n\n⚠️ قيد إلزامي: الترجمة يجب ألا تتجاوز ${body.maxBytes} بايت بترميز UTF-16LE (كل حرف عربي = 2 بايت تقريباً، أي بحد أقصى ~${Math.floor(body.maxBytes / 2)} حرف). إن لم تستطع، اختصر دون فقد المعنى.`
    : '';

  return `النص المستهدف:
EN: ${body.target.original}
AR الحالية: ${body.target.translation || '(لا توجد)'}
${fileLine}${idLine}${categoryLine}${speakerLine}

السياق المحيط (${body.context.length} سطر):
${ctxLines || '(لا يوجد سياق)'}${tmBlock}${glossaryBlock}${byteLimitBlock}

أعد 3 اقتراحات عبر استدعاء الدالة return_suggestions.`;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function parseLooseJson(content: string): any {
  if (!content) return null;
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : content).trim();
  const obj = raw.match(/\{[\s\S]*\}/);
  const candidate = obj ? obj[0] : raw;
  try { return JSON.parse(candidate); } catch { return null; }
}

// ===== DeepSeek =====
// V4 models (released 2026-04-24): deepseek-v4-flash / deepseek-v4-pro are the
// only real model names now. Thinking mode is a REQUEST PARAMETER, not a
// separate model name — the legacy deepseek-chat/deepseek-reasoner aliases
// (deprecated 2026-07-24) actually both routed to deepseek-v4-flash (non-
// thinking vs thinking); deepseek-reasoner was never deepseek-v4-pro. We keep
// the same two-tier choice but make "V4 Pro" the real, bigger model.
const DEEPSEEK_NAME_MAP: Record<string, string> = {
  'deepseek-v4-flash': 'deepseek-v4-flash',
  'deepseek-v4-pro': 'deepseek-v4-pro',
  // Legacy aliases, in case a stale client still sends them.
  'deepseek-chat': 'deepseek-v4-flash',
  'deepseek-reasoner': 'deepseek-v4-pro',
};

async function callDeepSeek(body: RequestBody, apiKey: string, model: string): Promise<any> {
  const dsModel = DEEPSEEK_NAME_MAP[model] || 'deepseek-v4-flash';
  const thinkingEnabled = dsModel === 'deepseek-v4-pro';
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(120_000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: dsModel,
      thinking: { type: thinkingEnabled ? 'enabled' : 'disabled' },
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(body.game) + '\n\n' + SUGGESTIONS_JSON_SCHEMA_HINT },
        { role: 'user', content: buildUserPrompt(body) },
      ],
    }),
  });
  if (resp.status === 429) throw new Error('429: تجاوز معدّل الطلبات على DeepSeek. أعد المحاولة بعد قليل.');
  if (resp.status === 402) throw new Error('402: الرصيد غير كافٍ على DeepSeek.');
  if (resp.status === 401) throw new Error('مفتاح DeepSeek غير صالح. تحقق من الإعدادات.');
  if (!resp.ok) throw new Error(`DeepSeek HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  if (data?.error) {
    const msg = typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error));
    throw new Error(`DeepSeek: ${msg}`);
  }
  const content = data?.choices?.[0]?.message?.content || '';
  const parsed = parseLooseJson(content);
  if (!parsed || !Array.isArray(parsed.suggestions)) {
    throw new Error('لم يعد DeepSeek بصيغة JSON صالحة');
  }
  return parsed;
}

// ===== TokenRouter =====
async function callTokenRouter(body: RequestBody, apiKey: string): Promise<any> {
  const resp = await fetch('https://api.tokenrouter.com/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(120_000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'z-ai/glm-5.2-free',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(body.game) + '\n\n' + SUGGESTIONS_JSON_SCHEMA_HINT },
        { role: 'user', content: buildUserPrompt(body) },
      ],
    }),
  });
  if (resp.status === 429) throw new Error('429: تجاوز معدّل الطلبات على TokenRouter. أعد المحاولة بعد قليل.');
  if (resp.status === 402) throw new Error('402: الرصيد غير كافٍ على TokenRouter.');
  if (resp.status === 401) throw new Error('مفتاح TokenRouter غير صالح. تحقق من الإعدادات.');
  if (!resp.ok) throw new Error(`TokenRouter HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  if (data?.error) {
    const msg = typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error));
    throw new Error(`TokenRouter: ${msg}`);
  }
  const content = data?.choices?.[0]?.message?.content || '';
  const parsed = parseLooseJson(content);
  if (!parsed || !Array.isArray(parsed.suggestions)) {
    throw new Error('لم يعد TokenRouter بصيغة JSON صالحة');
  }
  return parsed;
}

// ===== Lovable AI Gateway =====
async function callLovable(body: RequestBody, apiKey: string, model: string): Promise<any> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Lovable-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(body.game) },
        { role: 'user', content: buildUserPrompt(body) },
      ],
      tools: [tool],
      tool_choice: { type: 'function', function: { name: 'return_suggestions' } },
    }),
  });
  if (response.status === 429) throw new Error('تجاوز معدّل الطلبات. أعد المحاولة بعد قليل.');
  if (response.status === 402) throw new Error('نفدت أرصدة Lovable AI. الرجاء إضافة رصيد.');
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`AI gateway error: ${t.slice(0, 200)}`);
  }
  const data = await response.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  const argsRaw = toolCall?.function?.arguments;
  if (!argsRaw) throw new Error('لم يستجب النموذج بصيغة منظَّمة');
  return typeof argsRaw === 'string' ? JSON.parse(argsRaw) : argsRaw;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid json' }, 400);
  }

  if (!body?.target?.original?.trim()) {
    return jsonResponse({ error: 'target.original is required' }, 400);
  }

  const provider = body.provider || 'gemini';

  // Risen-only proactive tag masking — the model never sees the raw tag, so it
  // can't mistranslate it. Restored on every returned suggestion before responding.
  let risenTags: string[] = [];
  if (body.game === 'risen' || body.game === 'risen1' || body.game === 'risen2') {
    const { masked, tags } = maskRisenTags(body.target.original);
    body = { ...body, target: { ...body.target, original: masked } };
    risenTags = tags;
  }

  try {
    let parsed: any;
    if (provider === 'deepseek') {
      const dsKey = body.providerApiKey || Deno.env.get('DEEPSEEK_API_KEY');
      if (!dsKey) {
        return jsonResponse({ error: 'يحتاج DeepSeek مفتاح API — أضفه في الإعدادات.' }, 400);
      }
      parsed = await callDeepSeek(body, dsKey, body.aiModel || 'deepseek-v4-flash');
    } else if (provider === 'tokenrouter') {
      const trKey = body.providerApiKey || Deno.env.get('TOKENROUTER_API_KEY');
      if (!trKey) {
        return jsonResponse({ error: 'يحتاج TokenRouter مفتاح API — أضفه في الإعدادات.' }, 400);
      }
      parsed = await callTokenRouter(body, trKey);
    } else {
      // Default: Lovable AI Gateway. mymemory/google don't expose chat — fall back to Lovable.
      const apiKey = Deno.env.get('LOVABLE_API_KEY');
      if (!apiKey) return jsonResponse({ error: 'Missing LOVABLE_API_KEY' }, 500);
      parsed = await callLovable(body, apiKey, DEFAULT_LOVABLE_MODEL);
    }
    if (risenTags.length > 0 && Array.isArray(parsed?.suggestions)) {
      for (const s of parsed.suggestions) {
        if (typeof s?.translation === 'string') s.translation = unmaskRisenTags(s.translation, risenTags);
      }
    }
    return jsonResponse(parsed);
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg.startsWith('429') ? 429 : msg.startsWith('402') ? 402 : 500;
    return jsonResponse({ error: msg }, status);
  }
});
