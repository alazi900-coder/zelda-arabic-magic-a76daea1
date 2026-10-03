// Relays requests to Alborihi with the server-held ALBORIHI_API_KEY so the key never reaches the browser.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const BASE = 'https://alborihi-ai.com/api/public/dev/v1';

const AR: Record<number, string> = {
  401: 'مفتاح البريهي غير صحيح أو مفقود.',
  402: 'اشتراك البريهي غير نشط أو نفد الرصيد.',
  403: 'مفتاح البريهي بانتظار موافقة المشرف أو موقوف، أو النموذج غير مسموح في باقتك.',
  404: 'النموذج غير موجود في البريهي.',
  429: 'تجاوزت حد الطلبات في البريهي — انتظر قليلاً.',
  503: 'خدمة البريهي غير متاحة مؤقتاً.',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra } });
  const key = Deno.env.get('ALBORIHI_API_KEY');
  if (!key) return json({ error: 'مفتاح البريهي غير محفوظ في الخادم.' }, 500);

  let body: { action?: string; model?: unknown; messages?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'طلب غير صالح' }, 400); }

  let upstream: Response;
  if (body.action === 'models') {
    upstream = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${key}` } });
  } else if (body.action === 'chat' && typeof body.model === 'string' && Array.isArray(body.messages)) {
    upstream = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      signal: req.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: body.model, messages: body.messages, temperature: 0.2 }),
    });
  } else {
    return json({ error: 'طلب غير صالح' }, 400);
  }

  const text = await upstream.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!upstream.ok) {
    const upstreamMsg = (payload as { error?: { message?: string } } | null)?.error?.message;
    const retry = upstream.headers.get('Retry-After');
    return json(
      { error: `${AR[upstream.status] ?? `خطأ من البريهي (HTTP ${upstream.status}).`}${upstreamMsg ? ` — ${upstreamMsg}` : ''}` },
      upstream.status,
      retry ? { 'Retry-After': retry } : {},
    );
  }
  return json(payload);
});
