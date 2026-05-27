// =============================================================================
// improve-line-splits — يعيد توزيع فواصل الأسطر في ترجمة عربية لتطابق هيكل الأصل.
// يدعم: Lovable AI Gateway (Gemini/GPT)، Google Gemini API مباشر، Google Translate.
// =============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ReqEntry { key: string; originalEn: string; currentAr: string; }
interface ReqBody {
  engine: "lovable" | "gemini-direct" | "google-translate" | "deepseek" | "local";
  model?: string;
  apiKey?: string;
  entries: ReqEntry[];
}

/** يبني توجيه AI صارم لإعادة التقسيم فقط بدون تغيير المحتوى. */
function buildPrompt(entries: ReqEntry[]): string {
  const items = entries.map((e, i) => {
    const oLines = e.originalEn.split(/\r?\n/).filter(l => l.trim()).length;
    return `### ${i + 1} (key=${e.key}) — الأصل عدد أسطره ${oLines}
[ENGLISH ORIGINAL]
${e.originalEn}
[CURRENT ARABIC]
${e.currentAr}`;
  }).join("\n\n");
  return `أنت محرّر تنسيق نصوص عربية. أعد فقط توزيع فواصل الأسطر (\\n) في النصّ العربيّ لكلّ عنصر بحيث يكون التقسيم طبيعياً ومتوازناً ومطابقاً قدر الإمكان لعدد الأسطر في الأصل الإنجليزي.

قواعد لا يجوز كسرها:
- لا تغيّر أيّ كلمة عربية: نفس الحروف، نفس الكلمات، نفس الترتيب.
- لا تحذف أو تُضِف رموزاً تقنية في النطاق U+E000..U+E0FF أو U+FFF9..U+FFFC.
- لا تبدأ سطراً جديداً بحرف عطف/جر مفرد (و، ف، ل، ب، في، من، إلى، على، عن، مع).
- اجعل عدد أسطر الترجمة مساوياً لعدد أسطر الأصل قدر الإمكان.
- إذا كان الأصل سطراً واحداً اجعل الترجمة سطراً واحداً.

أعد النتيجة باستخدام أداة \`return_splits\` فقط.

العناصر:
${items}`;
}

async function callLovable(entries: ReqEntry[], model: string): Promise<Record<string, string>> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY غير مُهيّأ.");
  const tool = {
    type: "function",
    function: {
      name: "return_splits",
      description: "Return improved Arabic with corrected line breaks per key.",
      parameters: {
        type: "object",
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              properties: { key: { type: "string" }, text: { type: "string" } },
              required: ["key", "text"],
              additionalProperties: false,
            },
          },
        },
        required: ["results"],
        additionalProperties: false,
      },
    },
  };
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: buildPrompt(entries) }],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "return_splits" } },
    }),
  });
  if (resp.status === 429) throw new Error("429: Rate limit");
  if (resp.status === 402) throw new Error("402: Out of credits");
  if (!resp.ok) throw new Error(`Lovable AI ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error("لا توجد استجابة منظَّمة من المحرّك.");
  const args = JSON.parse(call.function.arguments);
  const out: Record<string, string> = {};
  for (const r of args.results || []) {
    if (r?.key && typeof r.text === "string") out[r.key] = r.text;
  }
  return out;
}

async function callGeminiDirect(entries: ReqEntry[], apiKey: string): Promise<Record<string, string>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const prompt = buildPrompt(entries) + `\n\nأعد JSON فقط بهذا الشكل: {"results":[{"key":"...","text":"..."}]}`;
  const resp = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  if (resp.status === 429) throw new Error("429: Gemini rate limit");
  if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const parsed = JSON.parse(text);
  const out: Record<string, string> = {};
  for (const r of parsed.results || []) {
    if (r?.key && typeof r.text === "string") out[r.key] = r.text;
  }
  return out;
}

/** Round-trip via Google Translate: translate Arabic→English line-aligned to original lines, then map back.
 *  بسيط: نُجبر العربية على أن يكون عدد أسطرها مساوياً لأسطر الأصل عبر ترجمة كلّ سطر مستقلاً ثم لصق العربية مقابل كلّ سطر إنجليزي. */
async function callGoogleTranslate(entries: ReqEntry[], apiKey: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const e of entries) {
    const oLines = e.originalEn.split(/\r?\n/).filter(l => l.trim());
    if (oLines.length <= 1) { out[e.key] = e.currentAr.replace(/\s*\n+\s*/g, " ").trim(); continue; }
    // ترجم كلّ سطر من الأصل إلى العربية، ثم استعمل أطوال النواتج كأوزان لإعادة تقسيم النصّ العربي الموجود.
    const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
    const resp = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: oLines, source: "en", target: "ar", format: "text" }),
    });
    if (!resp.ok) throw new Error(`Google Translate ${resp.status}`);
    const data = await resp.json();
    const arPerLine: string[] = (data?.data?.translations || []).map((t: { translatedText: string }) => t.translatedText);
    const weights = arPerLine.map(s => Math.max(1, s.length));
    const totalW = weights.reduce((a, b) => a + b, 0);
    const joined = e.currentAr.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();
    const totalLen = joined.length;
    let acc = 0;
    const cuts: number[] = [];
    for (let i = 0; i < weights.length - 1; i++) {
      acc += weights[i];
      const target = Math.round((acc / totalW) * totalLen);
      // ابحث عن أقرب مسافة
      let pos = -1;
      for (let d = 0; d < 30; d++) {
        if (joined[target + d] === " ") { pos = target + d; break; }
        if (joined[target - d] === " ") { pos = target - d; break; }
      }
      if (pos > 0) cuts.push(pos);
    }
    cuts.sort((a, b) => a - b);
    let result = ""; let prev = 0;
    for (const c of cuts) { result += joined.slice(prev, c) + "\n"; prev = c + 1; }
    result += joined.slice(prev);
    out[e.key] = result;
  }
  return out;
}

async function callDeepSeek(entries: ReqEntry[], model: string, apiKey: string): Promise<Record<string, string>> {
  const prompt = buildPrompt(entries) + `\n\nأعد JSON صالحاً فقط بالشكل: {"results":[{"key":"...","text":"..."}]}`;
  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "أنت مُحرّر تنسيق نصوص عربية. أعِد JSON صالحاً فقط بالشكل المطلوب." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (resp.status === 429) throw new Error("429: DeepSeek rate limit");
  if (resp.status === 402) throw new Error("402: DeepSeek credits");
  if (!resp.ok) throw new Error(`DeepSeek ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content || "{}";
  let parsed: { results?: Array<{ key: string; text: string }> } = {};
  try { parsed = JSON.parse(text); } catch { /* try to extract */
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
  }
  const out: Record<string, string> = {};
  for (const r of parsed.results || []) {
    if (r?.key && typeof r.text === "string") out[r.key] = r.text;
  }
  return out;
}

/** ضمان عدم تغيير الرموز التقنية والكلمات. لو فشل الفحص، أعد الترجمة الأصلية. */
function safeguard(orig: string, candidate: string): string {
  if (!candidate) return orig;
  const PUA = /[-￹-￼]/g;
  // 1. نفس النص بدون Tags وبدون مسافات
  const normO = orig.replace(PUA, "").replace(/\s+/g, " ").trim();
  const normC = candidate.replace(PUA, "").replace(/\s+/g, " ").trim();
  if (normO !== normC) return orig;
  // 2. نفس الـ Tags بنفس الترتيب
  const tagsO = (orig.match(PUA) ?? []).join("");
  const tagsC = (candidate.match(PUA) ?? []).join("");
  if (tagsO !== tagsC) return orig;
  // 3. كل Tag في نفس موضعها (الحرف السابق والتالي غير المسافة)
  const tagCtx = (s: string): string => {
    const out: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      if ((code >= 0xe000 && code <= 0xe0ff) || (code >= 0xfff9 && code <= 0xfffc)) {
        let prev = "";
        for (let j = i - 1; j >= 0; j--) { if (!/\s/.test(s[j])) { prev = s[j]; break; } }
        let next = "";
        for (let j = i + 1; j < s.length; j++) { if (!/\s/.test(s[j])) { next = s[j]; break; } }
        out.push(`${prev}${s[i]}${next}`);
      }
    }
    return out.join("|");
  };
  if (tagCtx(orig) !== tagCtx(candidate)) return orig;
  return candidate;
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
    let raw: Record<string, string> = {};
    if (body.engine === "lovable") {
      try {
        raw = await callLovable(body.entries, body.model || "google/gemini-3-flash-preview");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Fallback تلقائي إلى Gemini المباشر عند نفاد رصيد Lovable أو تجاوز الحد
        const geminiKey = Deno.env.get("GEMINI_API_KEY");
        if ((msg.startsWith("402:") || msg.startsWith("429:")) && geminiKey) {
          raw = await callGeminiDirect(body.entries, geminiKey);
        } else {
          throw err;
        }
      }
    } else if (body.engine === "gemini-direct") {
      const key = body.apiKey || Deno.env.get("GEMINI_API_KEY");
      if (!key) throw new Error("apiKey مطلوب");
      raw = await callGeminiDirect(body.entries, key);
    } else if (body.engine === "google-translate") {
      if (!body.apiKey) throw new Error("apiKey مطلوب");
      raw = await callGoogleTranslate(body.entries, body.apiKey);
    } else if (body.engine === "deepseek") {
      const key = body.apiKey || Deno.env.get("DEEPSEEK_API_KEY");
      if (!key) throw new Error("مفتاح DeepSeek مطلوب");
      raw = await callDeepSeek(body.entries, body.model || "deepseek-reasoner", key);
    } else {
      return new Response(JSON.stringify({ error: "محرّك غير مدعوم في هذه النقطة." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const results: Record<string, string> = {};
    for (const e of body.entries) {
      const cand = raw[e.key];
      if (cand) results[e.key] = safeguard(e.currentAr, cand);
    }
    return new Response(JSON.stringify({ results }), {
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
