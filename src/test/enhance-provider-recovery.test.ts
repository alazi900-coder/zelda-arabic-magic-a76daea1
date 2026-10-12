import { afterEach, describe, expect, it, vi } from "vitest";
import {
  relevantReviewGlossary, isReviewRateLimit, waitForReviewCooldown,
} from "@/lib/enhance-provider-recovery";

describe("Cerebras and Alborihi review recovery", () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("keeps only glossary terms present in the current review batch", () => {
    const dictionary = [
      "Felix → فيليكس", "Garet | غاريت", "Sheba\tشيبا",
      "Venus = الزهرة", "Piers: بييرز", "Kraden → كرادن",
      "---- unrelated header ----",
    ].join("\n");
    expect(relevantReviewGlossary(dictionary, [
      { original: "Felix met Sheba", translation: "فيليكس قابل شيبا" },
    ])).toBe("Felix → فيليكس\nSheba\tشيبا");
    expect(relevantReviewGlossary(dictionary, [
      { original: "none", translation: "لا شيء" },
    ])).toBe("");
    expect(relevantReviewGlossary(dictionary, [])).toBe("");
  });

  it("does not send an entire short unrelated glossary and caps relevant glossary size", () => {
    const unrelated = Array.from({ length: 5 }, (_, i) => "Missing" + i + " → غائب").join("\n");
    expect(relevantReviewGlossary(unrelated, [{ original: "Hello", translation: "مرحبا" }])).toBe("");
    const huge = Array.from({ length: 200 }, (_, i) => "Test → " + String(i).repeat(60)).join("\n");
    const filtered = relevantReviewGlossary(huge, [{ original: "Test", translation: "اختبار" }]);
    expect(filtered.length).toBeLessThanOrEqual(3500);
    expect(filtered).toContain("Test → ");
  });

  it("detects HTTP 429 and TPM quotas, never confuses exhausted paid credits with quota delay", () => {
    expect(isReviewRateLimit({ context: { status: 429 } })).toBe(true);
    expect(isReviewRateLimit({ status: 429 })).toBe(true);
    expect(isReviewRateLimit("تم تجاوز حدّ الطلبات على Cerebras (429)")).toBe(true);
    expect(isReviewRateLimit("tokens per minute rate limit")).toBe(true);
    expect(isReviewRateLimit("الرصيد غير كافٍ على Lovable Gateway (402)")).toBe(false);
    expect(isReviewRateLimit({ context: { status: 402 } })).toBe(false);
  });

  it("waits precisely until the cooldown ends", async () => {
    vi.useFakeTimers();
    const ctl = new AbortController();
    const done = vi.fn();
    const promise = waitForReviewCooldown(30000, ctl.signal).then(done);
    await vi.advanceTimersByTimeAsync(29999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(done).toHaveBeenCalledOnce();
  });

  it("stops the 30-second wait immediately on user cancellation", async () => {
    vi.useFakeTimers();
    const ctl = new AbortController();
    const waiting = waitForReviewCooldown(30000, ctl.signal);
    const check = expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    ctl.abort();
    await check;
    expect(vi.getTimerCount()).toBe(0);
    await expect(waitForReviewCooldown(30000, ctl.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
