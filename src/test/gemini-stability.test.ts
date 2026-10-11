import { describe, expect, it, vi } from "vitest";
import { callGeminiWithRecovery, extractGeminiText } from "../../supabase/functions/_shared/gemini-recovery";

const good = (parts: string[]) => new Response(JSON.stringify({
  candidates: [{ content: { parts: parts.map(text => ({ text })) }, finishReason: "STOP" }],
}), { status: 200, headers: { "Content-Type": "application/json" } });

const run = async (fetchStub: ReturnType<typeof vi.fn>, models = ["gemini-3.6-flash", "gemini-2.5-flash"]) => {
  return callGeminiWithRecovery({
    apiKey: "test-key",
    models,
    body: { contents: [{ parts: [{ text: "Translate safely" }] }] },
    fetchImpl: fetchStub as unknown as typeof fetch,
    wait: async () => undefined,
  });
};

describe("Gemini retry and model rotation", () => {
  it("reads text from all parts, not only the first one", () => {
    expect(extractGeminiText({
      candidates: [{ content: { parts: [{ text: "" }, { text: '{"K0":' }, { text: '"مرحبا"}' }] } }],
    })).toBe('{"K0":"مرحبا"}');
  });

  it("retries the same model once after a temporary 503", async () => {
    const fetchStub = vi.fn().mockResolvedValueOnce(new Response("busy", { status: 503 })).mockResolvedValueOnce(good(['{"K0":"مرحبا"}']));
    const result = await run(fetchStub);
    expect(result.response.status).toBe(200);
    expect(result.modelUsed).toBe("gemini-3.6-flash");
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(fetchStub.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("retries an intermittent network exception", async () => {
    const fetchStub = vi.fn().mockRejectedValueOnce(new TypeError("Network error")).mockResolvedValueOnce(good(['{"K0":"نعم"}']));
    const result = await run(fetchStub);
    expect(result.response.ok).toBe(true);
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it("rotates away from a 429 without confusing it with a server outage", async () => {
    const fetchStub = vi.fn().mockResolvedValueOnce(new Response("quota", { status: 429 })).mockResolvedValueOnce(good(['{"K0":"تم"}']));
    const result = await run(fetchStub);
    expect(result.modelUsed).toBe("gemini-2.5-flash");
    expect(fetchStub.mock.calls[1][0]).toContain("gemini-2.5-flash:generateContent");
  });

  it("keeps the true 429 if the fallback model is unavailable", async () => {
    const fetchStub = vi.fn().mockResolvedValueOnce(new Response("quota", { status: 429 })).mockResolvedValueOnce(new Response("retired", { status: 404 }));
    const result = await run(fetchStub);
    expect(result.response.status).toBe(429);
  });

  it("does not retry invalid API keys or 400 errors", async () => {
    for (const status of [400, 401, 403]) {
      const fetchStub = vi.fn().mockResolvedValue(new Response("error", { status }));
      const result = await run(fetchStub);
      expect(result.response.status).toBe(status);
      expect(fetchStub).toHaveBeenCalledTimes(1);
    }
  });

  it("tries another model for a retired 404", async () => {
    const fetchStub = vi.fn().mockResolvedValueOnce(new Response("missing", { status: 404 })).mockResolvedValueOnce(good(['{"K0":"حسنًا"}']));
    const result = await run(fetchStub);
    expect(result.modelUsed).toBe("gemini-2.5-flash");
  });

  it("retries an empty 200 result without saving an empty translation", async () => {
    const fetchStub = vi.fn().mockResolvedValueOnce(good([])).mockResolvedValueOnce(good(['{"K0":"عربي"}']));
    const result = await run(fetchStub, ["gemini-2.5-flash"]);
    expect(result.response.ok).toBe(true);
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it("rejects safety-blocked output without retrying it", async () => {
    const fetchStub = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: "SAFETY" }] }), { status: 200 }));
    const result = await run(fetchStub);
    expect(result.response.status).toBe(422);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("uses x-goog-api-key header rather than exposing keys in the URL", async () => {
    const fetchStub = vi.fn().mockResolvedValue(good(['{"K0":"أ"}']));
    await run(fetchStub);
    expect(fetchStub.mock.calls[0][0]).not.toContain("test-key");
    expect(fetchStub.mock.calls[0][1].headers["x-goog-api-key"]).toBe("test-key");
  });
});
