// =============================================================================
// smart-tag-fix — إصلاح ذكي بالـ AI لترجمة عربية واحدة بحيث تتطابق رموزها
// التقنية وفواصل أسطرها مع النصّ الإنجليزي الأصلي مع الحفاظ التامّ على المعنى.
// يدعم Lovable AI Gateway (Gemini/GPT) و DeepSeek (V4 Pro/Flash).
// =============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SmartFixEntry { key: string; original: string; translation: string; }
interface ReqBody {
  entries: SmartFixEntry[];
  engine?: "lovable" | "deepseek";
  aiModel?: string;          // gemini-3-flash-preview | gpt-5 | deepseek-v4-pro | deepseek-v4-flash …
  providerApiKey?: string;   // DeepSeek key from UI settings (optional)
}

// PUA tags (U+E000..U+E0FF) و U+FFF9..U+FFFC + وسوم XC3 النصّية بين معقوفات.
const PUA_REGEX = /[\uFFF9-\uFFFC\uE000-\uE0FF]/g;
const XC3_BRACKET_REGEX = /\[(?:XENO|System|ML|\/System|\/ML)[^\]]*\]/g;

/** يُرجع تسلسل وسوم النصّ (PUA + معقوفات XC3) كسلسلة موحّدة للمقارنة. */
function tagSignature(text: string): string {
  if (!text) return "";
  const pua = text.match(PUA_REGEX) || [];
  const br  = text.match(XC3_BRACKET_REGEX) || [];
  // المهم: نفس المجموعة بنفس الترتيب — لذلك نمشي على النصّ بترتيب الظهور.
  const combined: string[] = [];
  const re = /(\[(?:XENO|System|ML|\/System|\/ML)[^\]]*\])|([\uFFF9-\uFFFC\uE000-\uE0FF])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) combined.push(m[0]);
  void pua; void br;
  return combined.join("§");
}

/** يحسب الأسطر الفعلية مع اعتبار [XENO:n] و[System:PageBreak] فواصل أسطر. */
function countEffectiveLines(text: string): number {
  if (!text) return 0;
  const hard = (text.match(/\[(?:XENO:n|System:PageBreak)\s*\]/g) || []).length;
  const real = (text.match(/\n/g) || []).length;
  return hard + real + 1;
}

function buildPrompt(entries: SmartFixEntry[]): string {
  const items = entries.map((e, i) => {
    const oLines = countEffectiveLines(e.original);
    return `### ${i + 1} (key=${e.key}) — أسطر الأصل ≈ ${oLines}
[ENGLISH ORIGINAL]
${e.original}
[CURRENT ARABIC]
${e.translation}`;
  }).join("\n\n");

  return `أنت مُصحِّح ترجمة عربية للعبة Xenoblade Chronicles 1. لكل عنصر، أعد كتابة الترجمة العربية بحيث:

1) تحتوي على **نفس مجموعة الرموز التقنية وبنفس الترتيب تماماً** مثل الأصل الإنجليزي. الرموز هي:
   - رموز PUA الخفية في النطاق U+E000..U+E0FF و U+FFF9..U+FFFC (انسخها كما هي).
   - وسوم XC3 بين معقوفات مثل: [XENO:n ], [XENO:wait wait=key ], [System:PageBreak ], [System:Ruby rt=... ]…[/System:Ruby ], [ML:icon icon=btn_a ], [ML:Dash ].
2) عدد فواصل الأسطر (\\n وأيضاً [XENO:n ] و[System:PageBreak ]) يطابق الأصل قدر الإمكان.
3) **لا تُغيِّر معنى الترجمة العربية الحالية**: حافظ على نفس الكلمات والصياغة العامة قدر الإمكان، فقط أعد توزيع/إصلاح الرموز والأسطر. يُسمح بتعديلات بسيطة جداً للنحو إذا كان ذلك ضرورياً لاستيعاب الرموز في موضعها الصحيح.
4) لا تُضِف ولا تحذف أيّ رمز تقنيّ غير موجود في الأصل.
5) لا تستخدم التشكيل (الفتحة/الضمّة/الكسرة/التنوين/الشدّة/السكون) — خطّ اللعبة لا يدعمها.

أعِد JSON فقط بهذا الشكل (لا أيّ نصّ خارجه ولا code fences):
{"results":[{"key":"...","text":"الترجمة المصحَّحة كاملةً"}]}

العناصر:
${items}`;
}

async function callLovable(prompt: string, model: string): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY غير مُهيّأ");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "أنت مصحّح ترجمة عربية. أعِد JSON صالحاً فقط." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (resp.status === 429) throw new Error("429: تم تجاوز حدّ الطلبات على Lovable AI");
  if (resp.status === 402) throw new Error("402: الرصيد غير كافٍ على Lovable AI");
  if (!resp.ok) throw new Error(`Lovable AI HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function callGeminiDirect(prompt: string, apiKey: string): Promise<string> {
  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"];
  let lastErr = "";
  for (const m of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt + "\n\nأعِد JSON صالحاً فقط بدون أيّ نصّ خارجه." }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }
    lastErr = `${resp.status} ${(await resp.text()).slice(0, 200)}`;
    if (resp.status !== 429 && resp.status !== 503) break;
  }
  throw new Error(`Gemini direct فشل: ${lastErr}`);
}

async function callDeepSeek(prompt: string, model: string, apiKey: string): Promise<string> {
  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "أنت مصحّح ترجمة عربية لـ Xenoblade Chronicles 1. أعِد JSON صالحاً فقط بالشكل المطلوب." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (resp.status === 429) throw new Error("429: تم تجاوز حدّ الطلبات على DeepSeek");
  if (resp.status === 402) throw new Error("402: الرصيد غير كافٍ على DeepSeek");
  if (!resp.ok) throw new Error(`DeepSeek HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  if (data?.error) {
    const msg = typeof data.error === "string" ? data.error : (data.error.message || JSON.stringify(data.error));
    throw new Error(`DeepSeek: ${msg}`);
  }
  return data?.choices?.[0]?.message?.content || "";
}

function parseJsonLoose(content: string): { results?: Array<{ key: string; text: string }> } {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : content).trim();
  const obj = raw.match(/\{[\s\S]*\}/);
  if (!obj) return {};
  try { return JSON.parse(obj[0]); } catch { return {}; }
}

function stripDiacritics(s: string): string {
  return s.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, "");
}

/** Extract every tag token (PUA or XC3 bracket) in order. */
function extractTags(text: string): string[] {
  const re = /(\[(?:XENO|System|ML|\/System|\/ML)[^\]]*\])|([\uFFF9-\uFFFC\uE000-\uE0FF])/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[0]);
  return out;
}

/** Strip all tag tokens, return plain text. */
function stripTagsAll(text: string): string {
  return text.replace(/\[(?:XENO|System|ML|\/System|\/ML)[^\]]*\]/g, "")
             .replace(/[\uFFF9-\uFFFC\uE000-\uE0FF]/g, "");
}

/**
 * If AI returned the right Arabic content but tag count/order drifted, try to
 * graft the original tag sequence back: strip AI tags, then re-insert original
 * tags at line boundaries (one tag per natural break/line in order).
 * Returns null when grafting is unsafe (different tag count vs natural slots).
 */
function graftOriginalTags(original: string, aiText: string): string | null {
  const origTags = extractTags(original);
  if (origTags.length === 0) return aiText; // nothing to graft
  // Build a "plain" template of the AI text where line breaks and PageBreak-style holes survive.
  const stripped = stripTagsAll(aiText).replace(/\s*\n\s*/g, "\n").trim();
  if (!stripped) return null;
  // Where the original placed each tag among its words: compute index by stripping original tags
  // and noting tag positions relative to original plain text length.
  const origPlain = stripTagsAll(original);
  const ratios: number[] = [];
  let cursor = 0;
  const reBoth = /(\[(?:XENO|System|ML|\/System|\/ML)[^\]]*\])|([\uFFF9-\uFFFC\uE000-\uE0FF])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  void cursor;
  while ((m = reBoth.exec(original))) {
    const before = stripTagsAll(original.slice(0, m.index));
    ratios.push(origPlain.length === 0 ? 0 : before.length / origPlain.length);
    last = m.index + m[0].length;
  }
  void last;
  // Map each ratio to a character index in stripped AI text and insert tag there.
  const slots = ratios.map(r => Math.round(r * stripped.length));
  // Sort tags by slot ascending while preserving original order tag-by-slot pairing.
  const pairs = origTags.map((tag, i) => ({ tag, slot: slots[i] }));
  pairs.sort((a, b) => a.slot - b.slot);
  let out = stripped;
  // Insert from right to left so earlier indices stay valid.
  for (let i = pairs.length - 1; i >= 0; i--) {
    const { tag, slot } = pairs[i];
    const pos = Math.max(0, Math.min(out.length, slot));
    out = out.slice(0, pos) + tag + out.slice(pos);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json() as ReqBody;
    if (!body?.entries?.length) {
      return new Response(JSON.stringify({ error: "لا توجد عناصر للمعالجة" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const engine = body.engine || "lovable";
    const DEEPSEEK_NAME_MAP: Record<string, string> = {
      "deepseek-chat": "deepseek-chat",
      "deepseek-reasoner": "deepseek-reasoner",
      "deepseek-v4-flash": "deepseek-chat",
      "deepseek-v4-pro": "deepseek-reasoner",
    };
    const GATEWAY_MAP: Record<string, string> = {
      "gemini-3-flash-preview": "google/gemini-3-flash-preview",
      "gemini-3-pro-preview":   "google/gemini-3-pro-preview",
      "gemini-2.5-flash":       "google/gemini-2.5-flash",
      "gemini-2.5-pro":         "google/gemini-2.5-pro",
      "gpt-5":                  "openai/gpt-5",
      "gpt-5-mini":             "openai/gpt-5-mini",
    };

    let content = "";
    let usedFallback: string | null = null;
    if (engine === "deepseek") {
      const apiKey = (body.providerApiKey && body.providerApiKey.trim()) || Deno.env.get("DEEPSEEK_API_KEY");
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "DeepSeek غير مُكوّن — أضف مفتاحك في الإعدادات أو DEEPSEEK_API_KEY في أسرار Lovable Cloud" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const model = DEEPSEEK_NAME_MAP[body.aiModel || "deepseek-v4-pro"] || "deepseek-reasoner";
      content = await callDeepSeek(buildPrompt(body.entries), model, apiKey);
    } else {
      const model = GATEWAY_MAP[body.aiModel || "gemini-3-flash-preview"] || "google/gemini-3-flash-preview";
      try {
        content = await callLovable(buildPrompt(body.entries), model);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Auto-fallback to direct Gemini when Lovable AI is out of credits or rate-limited.
        const isQuota = msg.startsWith("429:") || msg.startsWith("402:");
        const geminiKey = Deno.env.get("GEMINI_API_KEY");
        if (isQuota && geminiKey) {
          console.log(`[smart-tag-fix] Lovable AI ${msg.slice(0, 8)} — fallback to Gemini direct`);
          content = await callGeminiDirect(buildPrompt(body.entries), geminiKey);
          usedFallback = "gemini-direct";
        } else {
          throw e;
        }
      }
    }

    const parsed = parseJsonLoose(content);
    const out: Record<string, { text: string; safe: boolean; reason?: string; grafted?: boolean }> = {};
    const byKey = new Map(body.entries.map(e => [e.key, e]));

    for (const r of parsed.results || []) {
      const src = byKey.get(r?.key);
      if (!src || typeof r.text !== "string" || !r.text.trim()) continue;
      let cleaned = stripDiacritics(r.text);
      let safe = tagSignature(src.original) === tagSignature(cleaned);
      let grafted = false;
      // إصلاح ذاتي: إذا اختلّ تسلسل الرموز، نحاول زرع رموز الأصل في الاقتراح.
      if (!safe) {
        const repaired = graftOriginalTags(src.original, cleaned);
        if (repaired && tagSignature(src.original) === tagSignature(repaired)) {
          cleaned = repaired;
          safe = true;
          grafted = true;
        }
      }
      out[src.key] = {
        text: cleaned,
        safe,
        grafted,
        reason: safe
          ? (grafted ? "تمّ زرع رموز الأصل تلقائياً في النصّ المقترح" : undefined)
          : "تسلسل الرموز التقنية في الاقتراح لا يطابق الأصل — راجع يدوياً قبل القبول",
      };
    }

    return new Response(JSON.stringify({ results: out, fallback: usedFallback }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.startsWith("429:") ? 429 : msg.startsWith("402:") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
