// =============================================================================
// smart-tag-fix — إصلاح ذكي بالـ AI لترجمة عربية واحدة بحيث تتطابق رموزها
// التقنية وفواصل أسطرها مع النصّ الإنجليزي الأصلي مع الحفاظ التامّ على المعنى.
// يدعم Lovable AI Gateway (Gemini/GPT) و DeepSeek (V4 Pro/Flash).
// =============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { maskRisenTagPair, unmaskRisenTags } from "../_shared/risen-tag-mask.ts";
import { RISEN_FORGET_OTHER_GAME_RULE } from "../_shared/risen-persona-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SmartFixEntry { key: string; original: string; translation: string; }
interface ReqBody {
  entries: SmartFixEntry[];
  engine?: "lovable" | "deepseek" | "tokenrouter";
  aiModel?: string;          // gemini-3-flash-preview | gpt-5 | deepseek-v4-pro | deepseek-v4-flash …
  providerApiKey?: string;   // DeepSeek/TokenRouter key from UI settings (optional)
  game?: "xenoblade" | "risen" | "risen2";
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

function buildPrompt(entries: SmartFixEntry[], isRisen?: boolean): string {
  const items = entries.map((e, i) => {
    const oLines = countEffectiveLines(e.original);
    return `### ${i + 1} (key=${e.key}) — أسطر الأصل ≈ ${oLines}
[ENGLISH ORIGINAL]
${e.original}
[CURRENT ARABIC]
${e.translation}`;
  }).join("\n\n");

  const gameNameLabel = isRisen ? "Risen" : "Xenoblade Chronicles 1";
  const forgetOtherGame = isRisen ? `\n${RISEN_FORGET_OTHER_GAME_RULE}\n` : "";
  return `أنت مُصحِّح ترجمة عربية للعبة ${gameNameLabel}. لكل عنصر، أعد كتابة الترجمة العربية بحيث:
${forgetOtherGame}

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
  // DeepSeek V4: thinking mode is a request field, not a model name — V4 Pro
  // keeps the old "reasoner" (thinking) behavior, V4 Flash the old "chat" one.
  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      thinking: { type: model === "deepseek-v4-pro" ? "enabled" : "disabled" },
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "أنت مصحّح ترجمة عربية. أعِد JSON صالحاً فقط بالشكل المطلوب." },
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

async function callTokenRouter(prompt: string, apiKey: string): Promise<string> {
  const resp = await fetch("https://api.tokenrouter.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "z-ai/glm-5.2-free",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "أنت مصحّح ترجمة عربية. أعِد JSON صالحاً فقط بالشكل المطلوب." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (resp.status === 429) throw new Error("429: تم تجاوز حدّ الطلبات على TokenRouter");
  if (resp.status === 402) throw new Error("402: الرصيد غير كافٍ على TokenRouter");
  if (!resp.ok) throw new Error(`TokenRouter HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  if (data?.error) {
    const msg = typeof data.error === "string" ? data.error : (data.error.message || JSON.stringify(data.error));
    throw new Error(`TokenRouter: ${msg}`);
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

/** A letter character (Arabic, Latin, digit) where splitting mid-word is unsafe. */
const LETTER_RE = /[\p{L}\p{N}]/u;

/**
 * Find a safe insertion point near `target` in `text`.
 *  - "Safe" = position is at string edge, at whitespace/newline, or adjacent to
 *    an existing tag bracket — i.e. never between two letters of one word.
 *  - For hard-break tags ([XENO:n ], [System:PageBreak ]) we strongly prefer
 *    an existing newline within the window.
 *  - Returns -1 if no safe position is found within `window` characters.
 */
function findSafeSlot(text: string, target: number, isHardBreak: boolean, window = 25): number {
  const len = text.length;
  if (len === 0) return 0;
  const clamp = (n: number) => Math.max(0, Math.min(len, n));
  const isSafe = (pos: number) => {
    if (pos <= 0 || pos >= len) return true;
    const a = text[pos - 1];
    const b = text[pos];
    if (a === "\n" || b === "\n") return true;
    if (/\s/.test(a) || /\s/.test(b)) return true;
    // Adjacent to existing bracket tag is fine.
    if (a === "]" || b === "[") return true;
    // Both sides letters/digits → mid-word, unsafe.
    return !(LETTER_RE.test(a) && LETTER_RE.test(b));
  };
  // 1) Hard breaks: prefer newline within window.
  if (isHardBreak) {
    for (let d = 0; d <= window; d++) {
      for (const p of [clamp(target - d), clamp(target + d)]) {
        if (p > 0 && p < len && (text[p - 1] === "\n" || text[p] === "\n")) return p;
      }
    }
  }
  // 2) Generic safe boundary (whitespace / edge / tag-adjacent).
  if (isSafe(clamp(target))) return clamp(target);
  for (let d = 1; d <= window; d++) {
    const left = clamp(target - d);
    if (isSafe(left)) return left;
    const right = clamp(target + d);
    if (isSafe(right)) return right;
  }
  return -1;
}

/**
 * If AI returned the right Arabic content but tag count/order drifted, try to
 * graft the original tag sequence back. Returns null if any tag cannot be
 * placed at a safe boundary (mid-word) — caller falls back to manual review.
 */
function graftOriginalTags(original: string, aiText: string): string | null {
  const origTags = extractTags(original);
  if (origTags.length === 0) return aiText;
  const stripped = stripTagsAll(aiText).replace(/\s*\n\s*/g, "\n").trim();
  if (!stripped) return null;
  const origPlain = stripTagsAll(original);
  const ratios: number[] = [];
  const reBoth = /(\[(?:XENO|System|ML|\/System|\/ML)[^\]]*\])|([\uFFF9-\uFFFC\uE000-\uE0FF])/g;
  let m: RegExpExecArray | null;
  while ((m = reBoth.exec(original))) {
    const before = stripTagsAll(original.slice(0, m.index));
    ratios.push(origPlain.length === 0 ? 0 : before.length / origPlain.length);
  }
  const HARD_BREAK_RE = /^\[(?:XENO:n|System:PageBreak)\s*\]$/;
  const pairs = origTags.map((tag, i) => ({
    tag,
    target: Math.round(ratios[i] * stripped.length),
    hard: HARD_BREAK_RE.test(tag),
    order: i,
  }));
  // Pair tag-by-tag with its slot in original sequence order (no re-sorting by slot:
  // re-sorting could place an earlier-original tag after a later one in the output).
  // Compute safe positions in original order, then insert right-to-left.
  const placements: { tag: string; pos: number }[] = [];
  for (const p of pairs) {
    const pos = findSafeSlot(stripped, p.target, p.hard);
    if (pos < 0) return null; // unsafe — abort graft
    placements.push({ tag: p.tag, pos });
  }
  // Enforce non-decreasing positions to preserve original tag order.
  for (let i = 1; i < placements.length; i++) {
    if (placements[i].pos < placements[i - 1].pos) {
      placements[i].pos = placements[i - 1].pos;
    }
  }
  let out = stripped;
  for (let i = placements.length - 1; i >= 0; i--) {
    const { tag, pos } = placements[i];
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

    // Mask Risen tags before this function's own "rewrite the translation to fix
    // tags/lines" prompt — this function's tagSignature() safety net only knows
    // about XC3 PUA/bracket tags, not Risen's <Tag> format, so without masking
    // an AI-mangled <Exit> would slip through unnoticed.
    const isRisen = body.game === "risen" || body.game === "risen1" || body.game === "risen2";
    const risenTagsByKey = new Map<string, string[]>();
    const promptEntries: SmartFixEntry[] = isRisen
      ? body.entries.map((e) => {
          const { maskedA, maskedB, tags } = maskRisenTagPair(e.original, e.translation);
          risenTagsByKey.set(e.key, tags);
          return { ...e, original: maskedA, translation: maskedB };
        })
      : body.entries;

    const engine = body.engine || "lovable";
    // منذ V4 (2026-04-24) المعرّفان الحقيقيّان هما deepseek-v4-flash و
    // deepseek-v4-pro؛ الاسمان القديمان يُحذَفان 2026-07-24.
    const DEEPSEEK_NAME_MAP: Record<string, string> = {
      "deepseek-v4-flash": "deepseek-v4-flash",
      "deepseek-v4-pro": "deepseek-v4-pro",
      "deepseek-chat": "deepseek-v4-flash",
      "deepseek-reasoner": "deepseek-v4-pro",
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
      const model = DEEPSEEK_NAME_MAP[body.aiModel || "deepseek-v4-pro"] || "deepseek-v4-pro";
      content = await callDeepSeek(buildPrompt(promptEntries, isRisen), model, apiKey);
    } else if (engine === "tokenrouter") {
      const apiKey = (body.providerApiKey && body.providerApiKey.trim()) || Deno.env.get("TOKENROUTER_API_KEY");
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "TokenRouter غير مُكوّن — أضف مفتاحك في الإعدادات" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      content = await callTokenRouter(buildPrompt(promptEntries, isRisen), apiKey);
    } else {
      const model = GATEWAY_MAP[body.aiModel || "gemini-3-flash-preview"] || "google/gemini-3-flash-preview";
      try {
        content = await callLovable(buildPrompt(promptEntries, isRisen), model);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Auto-fallback to direct Gemini when Lovable AI is out of credits or rate-limited.
        const isQuota = msg.startsWith("429:") || msg.startsWith("402:");
        const geminiKey = Deno.env.get("GEMINI_API_KEY");
        if (isQuota && geminiKey) {
          console.log(`[smart-tag-fix] Lovable AI ${msg.slice(0, 8)} — fallback to Gemini direct`);
          content = await callGeminiDirect(buildPrompt(promptEntries, isRisen), geminiKey);
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
      const risenTags = risenTagsByKey.get(src.key);
      const restoredText = risenTags ? unmaskRisenTags(r.text, risenTags) : r.text;
      let cleaned = stripDiacritics(restoredText);
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
