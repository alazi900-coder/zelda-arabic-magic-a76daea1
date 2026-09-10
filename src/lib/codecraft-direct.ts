/**
 * CodeCraft direct-only transport: the translator's own key → codecraftapi.com.
 *
 * Why direct rather than through the Edge Function: the CodeCraft branch lives
 * in `translate-entries`, but a deployed function lags behind the repository,
 * and while it lags every CodeCraft request falls through that function's final
 * `else` onto the Gemini path — which then fails naming a model nobody chose.
 * Going straight from the browser removes the deploy from the loop entirely.
 * The browser can reach CodeCraft: the model picker already fetches /v1/models
 * from the same origin with the same key.
 *
 * Shaped after gmicloud-direct.ts, deliberately as its own module: GMICLOUD
 * works and is not worth disturbing to share code with a second provider.
 * This one must never fall back to Gemini, Lovable AI, or an Edge Function.
 */
import {
  maskPokemonXpTechnicalTokens,
  POKEMON_XP_TOKEN_RULE,
  unmaskPokemonXpTechnicalTokens,
  validatePokemonXpTechnicalTokens,
} from '@/lib/pokemon-xp/pokemon-xp-rules';

export const CODECRAFT_DIRECT_ENDPOINT = 'https://codecraftapi.com/v1/chat/completions';
/** Only covers a first run before the account's live catalogue has been fetched. */
export const CODECRAFT_DEFAULT_MODEL = 'claude-opus-5';

export interface CodeCraftEntry {
  key: string;
  original: string;
}

export interface CodeCraftDirectRequest {
  apiKey?: string;
  model?: string;
  entries: CodeCraftEntry[];
  glossary?: string;
  extraInstructions?: string;
  game?: string;
  signal?: AbortSignal;
}

class CodeCraftDirectError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'CodeCraftDirectError';
  }
}

function safeJson(value: string): unknown {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('CodeCraft لم يُرجع كائن JSON للترجمة.');
  return JSON.parse(trimmed.slice(start, end + 1));
}

function errorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const record = payload as { error?: { message?: string } | string; message?: string };
    if (typeof record.error === 'string') return record.error;
    if (record.error && typeof record.error.message === 'string') return record.error.message;
    if (typeof record.message === 'string') return record.message;
  }
  return `تعذر الاتصال بـ CodeCraft (HTTP ${status}).`;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function waitForRetry(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function buildSystemPrompt({ glossary, extraInstructions, game }: Omit<CodeCraftDirectRequest, 'apiKey' | 'entries' | 'signal'>): string {
  const glossaryRule = glossary?.trim()
    ? `\nGLOSSARY (apply only when relevant; do not translate its technical tokens):\n${glossary.trim()}`
    : '';
  const extraRule = extraInstructions?.trim() ? `\nPROJECT RULES:\n${extraInstructions.trim()}` : '';
  const gameRule = game ? `\nGAME CONTEXT: ${game}` : '';
  const pokemonXpRule = game === 'pokemon-xp' ? `\nPOKÉMON ESSENTIALS CONTRACT:\n${POKEMON_XP_TOKEN_RULE}` : '';

  return `You are a professional video-game translator. Translate each English value to natural Arabic.
Return ONLY one valid JSON object whose keys are exactly the supplied keys and whose values are the Arabic translations.
Preserve every technical token, control code, placeholder, rich-text tag, variable, number, line break, and punctuation-bearing game code exactly and in the same relative position. Never add markdown or explanatory text.${gameRule}${pokemonXpRule}${glossaryRule}${extraRule}`;
}

/**
 * The model name is whatever the translator picked from their own account's
 * catalogue — CodeCraft is a router and its list changes, so nothing is
 * validated against a frozen allow-list here. A wrong name comes back as
 * CodeCraft's own error naming that model, which is the useful failure.
 */
async function requestCompletion(request: CodeCraftDirectRequest & { system: string; user: string }): Promise<string> {
  if (!request.apiKey?.trim()) {
    throw new CodeCraftDirectError('يحتاج CodeCraft مفتاح API — الصقه في حقل CodeCraft داخل المحرر.', 400);
  }
  const model = request.model?.trim() || CODECRAFT_DEFAULT_MODEL;

  let response: Response | undefined;
  let payload: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(CODECRAFT_DIRECT_ENDPOINT, {
        method: 'POST',
        signal: request.signal,
        headers: {
          Authorization: `Bearer ${request.apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
        }),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!(error instanceof TypeError)) throw error;
      if (attempt === 2) {
        // A TypeError here is the browser refusing a response it could not
        // read, not necessarily an unreachable host. The case seen in
        // practice: CodeCraft answers the completion with a gateway error
        // page, which — unlike its own JSON errors — carries no CORS header,
        // so the browser discards it and the real status never arrives. Since
        // the model list is a different route and keeps working, a plain
        // "connection failed" points the translator at their network when the
        // problem is on the provider's side, so say what it usually means.
        throw new CodeCraftDirectError(
          'لم يصل ردٌّ مقروء من CodeCraft بعد ثلاث محاولات. الغالب أنه ردّ بصفحة خطأ من بوّابته (502) لا تحمل ترويسة CORS فرفضها المتصفّح، لا أن الاتصال منقطع — فزرّ «جلب النماذج» يستعمل مساراً آخر وقد ينجح رغم ذلك. تحقّق من رصيد حسابك وحالة الخدمة في لوحة CodeCraft، أو استعمل مزوّداً آخر مؤقتاً.',
          502,
        );
      }
      await waitForRetry(700 * (attempt + 1), request.signal);
      continue;
    }

    const raw = await response.text();
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
    if (response.ok || !isRetryableStatus(response.status) || attempt === 2) break;
    await waitForRetry(700 * (attempt + 1), request.signal);
  }
  if (!response) throw new CodeCraftDirectError('تعذر بدء طلب CodeCraft.', 502);
  if (!response.ok) throw new CodeCraftDirectError(errorMessage(payload, response.status), response.status);

  const content = payload && typeof payload === 'object'
    ? (payload as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content
    : undefined;
  if (typeof content !== 'string') {
    throw new CodeCraftDirectError('استجابة CodeCraft لا تحتوي نصاً صالحاً.', 502);
  }
  return content;
}

/**
 * The account's live catalogue. CodeCraft is a router, so the list is per-key
 * and changes; every panel that lets the translator pick a model reads it from
 * here rather than carrying names that go 404 the day one is retired.
 */
export async function fetchCodeCraftModels(apiKey: string | undefined, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch('https://codecraftapi.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey || ''}` },
    signal,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorMessage(body, res.status));
  const ids = ((body as { data?: Array<{ id?: string }> } | null)?.data || [])
    .map((m) => m?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) throw new Error('لم يُرجع الحساب أي نموذج متاح');
  return ids;
}

export interface CodeCraftJsonRequest {
  apiKey?: string;
  model?: string;
  system: string;
  user: string;
  signal?: AbortSignal;
}

/**
 * Direct JSON transport for the editor tools that want a shaped object rather
 * than a translations map — enhance, context suggestions, engine comparison.
 * Like the translation path it never reaches an Edge Function, so none of them
 * depend on a deploy.
 */
export async function requestCodeCraftJson<T extends Record<string, unknown>>(request: CodeCraftJsonRequest): Promise<T> {
  const content = await requestCompletion({ ...request, entries: [] });
  const parsed = safeJson(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CodeCraftDirectError('استجابة CodeCraft ليست كائن JSON صالحاً.', 502);
  }
  return parsed as T;
}

/** Returns a Response so the caller can treat it exactly like the Edge Function's. */
export async function requestCodeCraftDirect(request: CodeCraftDirectRequest): Promise<Response> {
  try {
    if (!request.entries.length) {
      throw new CodeCraftDirectError('لا توجد نصوص لإرسالها إلى CodeCraft.', 400);
    }

    const pokemonXpMasks = request.game === 'pokemon-xp'
      ? new Map(request.entries.map(({ key, original }) => [key, maskPokemonXpTechnicalTokens(original)]))
      : null;
    const sourceByKey = Object.fromEntries(request.entries.map(({ key, original }) => {
      const mask = pokemonXpMasks?.get(key);
      return [key, mask ? mask.text : original];
    }));

    const content = await requestCompletion({
      ...request,
      system: buildSystemPrompt(request),
      user: JSON.stringify(sourceByKey),
    });
    const parsed = safeJson(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new CodeCraftDirectError('استجابة CodeCraft ليست خريطة ترجمات صالحة.', 502);
    }

    const translations: Record<string, string> = {};
    for (const { key, original } of request.entries) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value !== 'string') continue;
      const mask = pokemonXpMasks?.get(key);
      const restored = mask ? unmaskPokemonXpTechnicalTokens(value, mask.tokens) : value;
      if (!mask || validatePokemonXpTechnicalTokens(original, restored).valid) translations[key] = restored;
    }
    if (Object.keys(translations).length === 0) {
      throw new CodeCraftDirectError('لم يُرجع CodeCraft أي ترجمة قابلة للاستخدام.', 502);
    }

    return new Response(JSON.stringify({
      translations,
      providerUsed: `CodeCraft / ${request.model?.trim() || CODECRAFT_DEFAULT_MODEL} (direct)`,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    const status = error instanceof CodeCraftDirectError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'تعذر الاتصال المباشر بـ CodeCraft.';
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { 'Content-Type': 'application/json' },
    });
  }
}
