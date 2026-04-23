// Fetches the live list of free OpenRouter models.
// Public endpoint — no auth needed; doesn't use any secret keys.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Curated descriptions/badges in Arabic for known providers
function describeModel(id: string, name: string, ctx: number): { label: string; desc: string; badge: string } {
  const lower = id.toLowerCase();
  let badge = "🆓";
  if (lower.includes("glm")) badge = "🆕";
  else if (lower.includes("gemma")) badge = "✨";
  else if (lower.includes("llama")) badge = "🦙";
  else if (lower.includes("phi")) badge = "⚡";
  else if (lower.includes("qwen")) badge = "🐉";
  else if (lower.includes("mistral") || lower.includes("dolphin")) badge = "🌊";
  else if (lower.includes("nemotron") || lower.includes("nvidia")) badge = "💚";
  else if (lower.includes("deepseek")) badge = "🐋";
  else if (lower.includes("openai") || lower.includes("gpt")) badge = "🧠";
  else if (lower.includes("minimax")) badge = "⚙️";
  else if (lower.includes("liquid") || lower.includes("lfm")) badge = "💧";

  // Provider tag for description
  const provider = id.split("/")[0] || "";
  const ctxK = ctx >= 1000 ? `${Math.round(ctx / 1000)}K` : `${ctx}`;
  const cleanName = name.replace(/\s*\(free\)\s*$/i, "").trim();

  return {
    label: cleanName || id,
    desc: `${provider} — سياق ${ctxK}`,
    badge,
  };
}

// Models known to be poor for Arabic translation — exclude
const EXCLUDE_PATTERNS = [
  /coder/i,        // code-only models
  /ocr/i,          // OCR-only
  /image/i,        // image gen
  /lyria/i,        // music
  /uncensored/i,   // skip risky
  /1\.2b/i,        // too small for translation quality
  /1b/i,           // too small
  /3b/i,           // too small for translation
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const resp = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { "Accept": "application/json" },
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `OpenRouter API ${resp.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await resp.json();
    const all: any[] = json?.data || [];

    // Filter: only :free variants
    const freeModels = all.filter((m) => {
      const id = m?.id || "";
      if (!id.endsWith(":free")) return false;
      // exclude unsuitable
      for (const re of EXCLUDE_PATTERNS) if (re.test(id)) return false;
      // require minimum context length (avoid tiny models)
      const ctx = m?.context_length || 0;
      if (ctx < 8000) return false;
      return true;
    });

    // Map and sort: prefer larger context first, then alphabetical
    const mapped = freeModels.map((m) => {
      const ctx = m?.context_length || 0;
      const info = describeModel(m.id, m?.name || m.id, ctx);
      return { id: m.id, label: info.label, desc: info.desc, badge: info.badge, ctx };
    }).sort((a, b) => b.ctx - a.ctx);

    // Limit to top 12 to keep UI clean
    const limited = mapped.slice(0, 12).map(({ ctx, ...rest }) => rest);

    return new Response(JSON.stringify({
      models: limited,
      count: limited.length,
      fetchedAt: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
