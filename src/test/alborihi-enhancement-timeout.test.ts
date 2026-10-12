import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAlborihiJson } from "@/lib/alborihi-direct";

vi.mock("@/lib/supabase-edge", () => ({
  getEdgeFunctionUrl: () => "https://example.test/functions/v1/alborihi-proxy",
  getSupabaseHeaders: () => ({ "Content-Type": "application/json" }),
}));

describe("Alborihi enhancement transport deadline", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("accepts valid JSON review results", async () => {
    const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"suggestions":[]}' } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fn);
    const data = await requestAlborihiJson({
      model: "gemini-3.6-flash", system: "review", user: "one text", timeoutMs: 500,
    });
    expect(data).toEqual({ suggestions: [] });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not send a second billable QA request on HTTP 429", async () => {
    const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 }));
    vi.stubGlobal("fetch", fn);
    await expect(requestAlborihiJson({
      system: "review", user: "one text", timeoutMs: 500,
    })).rejects.toThrow("Too many requests");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stops a hanging QA request with a visible deadline error", async () => {
    vi.useFakeTimers();
    const fn = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fn);
    const request = requestAlborihiJson({
      system: "review", user: "one text", timeoutMs: 1000,
    });
    const caught = expect(request).rejects.toThrow("انتهت مهلة البريهي");
    await vi.advanceTimersByTimeAsync(1000);
    await caught;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a user stop interrupts without pretending it was a provider timeout", async () => {
    const controller = new AbortController();
    const fn = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fn);
    const request = requestAlborihiJson({
      system: "review", user: "one text", signal: controller.signal, timeoutMs: 90000,
    });
    const caught = expect(request).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await caught;
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
