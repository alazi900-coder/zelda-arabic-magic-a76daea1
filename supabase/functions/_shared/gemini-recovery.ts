/**
 * Shared, bounded Google Gemini transport for translation and proofreading.
 * Keeps the chosen model first; retries only transient errors, then optionally
 * tries explicitly listed Gemini alternatives. Never falls back to a paid
 * provider: the caller alone decides whether paid routing is permitted.
 */
export interface GeminiCallOptions {
  apiKey: string;
  models: string[];
  body: unknown;
  fetchImpl?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  maxElapsedMs?: number;
  now?: () => number;
}

export interface GeminiCallResult {
  response: Response;
  modelUsed: string;
  attempts: number;
}

export function extractGeminiText(data: unknown): string {
  const candidates = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown; thought?: boolean }> } }> } | null)?.candidates;
  if (!Array.isArray(candidates)) return "";
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) continue;
    // Gemini thinking models can include thought parts alongside the answer.
    // Their contents are not the translation JSON and must never be concatenated.
    const text = parts.map(part => !part?.thought && typeof part?.text === "string" ? part.text : "").join("");
    if (text.trim()) return text;
  }
  return "";
}

function responseError(message: string, status = 502): Response {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { "Content-Type": "application/json" },
  });
}

export async function callGeminiWithRecovery(options: GeminiCallOptions): Promise<GeminiCallResult> {
  const {
    apiKey, body, fetchImpl = fetch, wait = ms => new Promise<void>(r => setTimeout(r, ms)),
    timeoutMs = 25_000, maxElapsedMs = 78_000, now = Date.now,
  } = options;
  const models = [...new Set(options.models.filter(m => /^gemini-[a-z0-9.-]+$/.test(m)))];
  if (!apiKey || !models.length) {
    return { response: responseError("مفتاح Gemini أو النموذج غير صالح", 400), modelUsed: "", attempts: 0 };
  }

  const started = now();
  let attempts = 0;
  let lastResponse: Response = responseError("تعذّر الاتصال بخدمة Gemini");
  let previousModel = models[0];

  for (const model of models) {
    previousModel = model;
    for (let repeat = 0; repeat < 2; repeat++) {
      const remaining = maxElapsedMs - (now() - started);
      if (remaining < 2000) return { response: lastResponse, modelUsed: model, attempts };
      attempts++;
      let response: Response;
      // Do not rely on AbortSignal.timeout: several Android browsers and the
      // app's jsdom test environment do not implement that static method.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
      try {
        response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        console.warn("[gemini] transient network/timeout error", model, (error as Error)?.name);
        lastResponse = responseError("تعذّر الاتصال بخادم Gemini أو انتهت مهلة الاستجابة (502)");
        if (repeat === 0 && remaining > 2500) {
          await wait(600);
          continue;
        }
        break;
      } finally {
        clearTimeout(timeout);
      }

      if (response.ok) {
        const data = await response.clone().json().catch(() => null);
        if (extractGeminiText(data)) return { response, modelUsed: model, attempts };
        const reason = (data as { candidates?: Array<{ finishReason?: string }>; promptFeedback?: { blockReason?: string } } | null);
        const blockReason = reason?.promptFeedback?.blockReason || reason?.candidates?.[0]?.finishReason;
        if (blockReason === "SAFETY" || blockReason === "PROHIBITED_CONTENT" || blockReason === "BLOCKLIST") {
          return {
            response: responseError(`رفض Gemini إنشاء النص بسبب سياسة المحتوى (${blockReason})`, 422),
            modelUsed: model, attempts,
          };
        }
        lastResponse = responseError(`أعاد Gemini رداً فارغاً أو غير قابل للقراءة (${blockReason || "empty"}). أعد المحاولة`);
      } else {
        // Authentication, invalid request and safety errors are not transient.
        if ([400, 401, 403].includes(response.status)) {
          return { response, modelUsed: model, attempts };
        }
        if (response.status === 404) {
          // Retired or unavailable model: do not spend another request on it.
          if (lastResponse.status === 502 && attempts <= 1) lastResponse = response;
          break;
        }
        if (response.status === 429) {
          // Usually a model-specific quota; rotate promptly rather than sleeping
          // inside a short-lived edge function and consuming more daily quota.
          lastResponse = response;
          break;
        }
        if (![500, 502, 503, 504].includes(response.status)) {
          return { response, modelUsed: model, attempts };
        }
        lastResponse = response;
      }
      if (repeat === 0 && maxElapsedMs - (now() - started) > 2000) {
        await wait(700);
      }
    }
  }
  return { response: lastResponse, modelUsed: previousModel, attempts };
}
