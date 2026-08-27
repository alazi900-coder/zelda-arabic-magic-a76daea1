/**
 * GMICLOUD direct-only transport: session API key → api.gmi-serving.com.
 * This module must never fall back to Gemini, Lovable AI, or an Edge Function.
 */

export const GMICLOUD_DIRECT_ENDPOINT = 'https://api.gmi-serving.com/v1/chat/completions';
export const GMICLOUD_DIRECT_MODEL = 'MiniMaxAI/MiniMax-M2.7';
export const GMICLOUD_DIRECT_MODELS = [
  'MiniMaxAI/MiniMax-M2.7',
  'MiniMaxAI/MiniMax-M3',
] as const;
export type GmiCloudDirectModel = (typeof GMICLOUD_DIRECT_MODELS)[number];

export interface GmiCloudJsonRequest {
  apiKey?: string;
  model?: string;
  system: string;
  user: string;
  temperature?: number;
  signal?: AbortSignal;
}

export interface GmiCloudEntry {
  key: string;
  original: string;
}

interface GmiCloudDirectRequest {
  apiKey?: string;
  model?: string;
  entries: GmiCloudEntry[];
  glossary?: string;
  extraInstructions?: string;
  game?: string;
  signal?: AbortSignal;
}

class GmiCloudDirectError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'GmiCloudDirectError';
  }
}

function safeJson(value: string): unknown {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('GMICLOUD لم يُرجع كائن JSON للترجمة.');
  return JSON.parse(trimmed.slice(start, end + 1));
}

function errorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const record = payload as { error?: { message?: string } | string; message?: string };
    if (typeof record.error === 'string') return record.error;
    if (record.error && typeof record.error.message === 'string') return record.error.message;
    if (typeof record.message === 'string') return record.message;
  }
  return `تعذر الاتصال بـ GMICLOUD (HTTP ${status}).`;
}

export function isGmiCloudDirectModel(model: string | undefined): model is GmiCloudDirectModel {
  return Boolean(model && GMICLOUD_DIRECT_MODELS.includes(model as GmiCloudDirectModel));
}

export function formatGmiCloudDirectModel(model: string | undefined): string {
  const resolved = model || GMICLOUD_DIRECT_MODEL;
  return resolved.replace('MiniMaxAI/', '').replace('MiniMax-', 'MiniMax ');
}

function resolveGmiCloudDirectModel(model: string | undefined, toolLabel: string): GmiCloudDirectModel {
  const resolved = model || GMICLOUD_DIRECT_MODEL;
  if (!isGmiCloudDirectModel(resolved)) {
    throw new GmiCloudDirectError(`نموذج GMICLOUD المختار غير متاح لـ${toolLabel} في هذه الجلسة.`, 400);
  }
  return resolved;
}

function isRetryableGmiStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function waitForRetry(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    const timer = globalThis.setTimeout(finish, milliseconds);
    if (!signal) return;
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function retryableConnectionError(error: unknown, signal?: AbortSignal): never | undefined {
  if (error instanceof DOMException && error.name === 'AbortError') throw error;
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (error instanceof TypeError) return;
  throw error;
}

interface GmiCloudCompletionRequest extends GmiCloudJsonRequest {
  toolLabel: string;
}

/**
 * نقطة الاتصال الوحيدة بطلبات MiniMax المباشرة داخل المحرر. تبقى هذه الدالة
 * على الاتصال بـ GMICLOUD فقط، وتشارك قواعد المفتاح والنموذج والإلغاء وإعادة المحاولة
 * بين الترجمة والتحسين والسياق والمقارنة.
 */
async function requestGmiCloudCompletion(request: GmiCloudCompletionRequest): Promise<{ content: string; model: GmiCloudDirectModel }> {
  if (!request.apiKey?.trim()) {
    throw new GmiCloudDirectError('يحتاج GMICLOUD مفتاح API في حقل GMICLOUD داخل المحرر.', 400);
  }
  const model = resolveGmiCloudDirectModel(request.model, request.toolLabel);

  let response: Response | undefined;
  let payload: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(GMICLOUD_DIRECT_ENDPOINT, {
        method: 'POST',
        signal: request.signal,
        headers: {
          Authorization: `Bearer ${request.apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: request.temperature ?? 0.2,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
        }),
      });
    } catch (error) {
      retryableConnectionError(error, request.signal);
      if (attempt === 2) {
        throw new GmiCloudDirectError('تعذر الاتصال بـ GMICLOUD بعد محاولات محدودة. أعد المحاولة لاحقاً.', 502);
      }
      await waitForRetry(700 * (attempt + 1), request.signal);
      continue;
    }

    const raw = await response.text();
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
    if (response.ok || !isRetryableGmiStatus(response.status) || attempt === 2) break;
    await waitForRetry(700 * (attempt + 1), request.signal);
  }
  if (!response) throw new GmiCloudDirectError('تعذر بدء طلب GMICLOUD.', 502);
  if (!response.ok) throw new GmiCloudDirectError(errorMessage(payload, response.status), response.status);

  const content = payload && typeof payload === 'object'
    ? (payload as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content
    : undefined;
  if (typeof content !== 'string') {
    throw new GmiCloudDirectError('استجابة GMICLOUD لا تحتوي نصاً صالحاً.', 502);
  }
  return { content, model };
}

/**
 * نقل JSON مباشر لأدوات المحرر. عند اختيار MiniMax لا يستدعي هذا المسار
 * Lovable أو Gemini أو أي دالة خلفية، ويستخدم مفتاح الجلسة فقط.
 */
export async function requestGmiCloudJson<T extends Record<string, unknown>>(request: GmiCloudJsonRequest): Promise<T> {
  const { content } = await requestGmiCloudCompletion({ ...request, toolLabel: 'هذه الأداة' });
  const parsed = safeJson(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new GmiCloudDirectError('استجابة GMICLOUD ليست كائن JSON صالحاً.', 502);
  }
  return parsed as T;
}

function buildSystemPrompt({ glossary, extraInstructions, game }: Omit<GmiCloudDirectRequest, 'apiKey' | 'entries' | 'signal'>): string {
  const glossaryRule = glossary?.trim()
    ? `\nGLOSSARY (apply only when relevant; do not translate its technical tokens):\n${glossary.trim()}`
    : '';
  const extraRule = extraInstructions?.trim() ? `\nPROJECT RULES:\n${extraInstructions.trim()}` : '';
  const gameRule = game ? `\nGAME CONTEXT: ${game}` : '';

  return `You are a professional video-game translator. Translate each English value to natural Arabic.
Return ONLY one valid JSON object whose keys are exactly the supplied keys and whose values are the Arabic translations.
Preserve every technical token, control code, placeholder, rich-text tag, variable, number, line break, and punctuation-bearing game code exactly and in the same relative position. Never add markdown or explanatory text.${gameRule}${glossaryRule}${extraRule}`;
}

export async function requestGmiCloudDirect(request: GmiCloudDirectRequest): Promise<Response> {
  try {
    if (!request.entries.length) {
      throw new GmiCloudDirectError('لا توجد نصوص لإرسالها إلى GMICLOUD.', 400);
    }

    const sourceByKey = Object.fromEntries(request.entries.map(({ key, original }) => [key, original]));
    const parsed = await requestGmiCloudJson<Record<string, unknown>>({
      apiKey: request.apiKey,
      model: request.model,
      system: buildSystemPrompt(request),
      user: JSON.stringify(sourceByKey),
      signal: request.signal,
    });
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new GmiCloudDirectError('استجابة GMICLOUD ليست خريطة ترجمات صالحة.', 502);
    }
    const translations: Record<string, string> = {};
    for (const { key } of request.entries) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === 'string') translations[key] = value;
    }
    if (Object.keys(translations).length === 0) {
      throw new GmiCloudDirectError('لم يُرجع GMICLOUD أي ترجمة قابلة للاستخدام.', 502);
    }

    return new Response(JSON.stringify({ translations, providerUsed: `GMICLOUD / ${formatGmiCloudDirectModel(request.model)} (direct)` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    const status = error instanceof GmiCloudDirectError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'تعذر الاتصال المباشر بـ GMICLOUD.';
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
