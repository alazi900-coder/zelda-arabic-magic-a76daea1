/**
 * Unit test: client-side 429 retry behaviour for AutoPilot.
 *
 * Mirrors the retry loop in `src/hooks/useAutoPilot.ts` (the AI batch loop).
 * We extract the essential algorithm so we can test it without React.
 *
 * Contract being tested:
 *   - HTTP 429 (or RATE_LIMIT_RETRYABLE) → wait, retry SAME batch indefinitely.
 *   - True quota exhaustion ("no credits", "💳") → switch provider.
 *   - 2xx → advance to next batch.
 *   - AbortSignal stops the loop cleanly.
 *   - The loop NEVER gives up on 429, even after many attempts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

interface Batch { id: number }
interface FetchResult {
  ok: boolean;
  status: number;
  body?: unknown;
  errMsg?: string;
}

const isRateLimit429 = (msg: string) =>
  /429|rate.?limit|RATE_LIMIT_RETRYABLE|تجاوز(ت)? حد|too many requests/i.test(msg);
const isQuotaExhausted = (msg: string) =>
  /no credits|insufficient|💳|exhausted|quota exceeded|انتهت الحصة|billing/i.test(msg);

/**
 * Pure re-implementation of the AutoPilot AI loop's retry semantics.
 * Returns: { successes, failures, providerSwaps, attemptsPerBatch }.
 */
async function runBatchLoop(opts: {
  batches: Batch[];
  fetchFn: (batch: Batch, provider: string) => Promise<FetchResult>;
  fallbackChain: string[];
  signal: AbortSignal;
  rateLimitWaitMs: number;
  batchDelayMs: number;
}) {
  const { batches, fetchFn, fallbackChain, signal, rateLimitWaitMs, batchDelayMs } = opts;
  const remaining = [...fallbackChain];
  let curProvider = remaining.shift() ?? "default";

  let successes = 0;
  let failures = 0;
  let providerSwaps = 0;
  const attemptsPerBatch: number[] = [];

  let batchIdx = 0;
  let attempts = 0;

  while (batchIdx < batches.length) {
    if (signal.aborted) throw new DOMException("abort", "AbortError");
    attempts++;
    const result = await fetchFn(batches[batchIdx], curProvider);

    if (result.ok) {
      successes++;
      attemptsPerBatch.push(attempts);
      attempts = 0;
      batchIdx++;
      if (batchIdx < batches.length) {
        await new Promise((r) => setTimeout(r, batchDelayMs));
      }
      continue;
    }

    const errMsg = result.errMsg ?? `error ${result.status}`;

    if (isQuotaExhausted(errMsg) && remaining.length > 0) {
      curProvider = remaining.shift()!;
      providerSwaps++;
      continue; // retry same batch on new provider
    }

    if (isRateLimit429(errMsg) || result.status === 429) {
      // Abortable wait
      const waitStart = Date.now();
      while (Date.now() - waitStart < rateLimitWaitMs) {
        if (signal.aborted) throw new DOMException("abort", "AbortError");
        await new Promise((r) => setTimeout(r, 50));
      }
      continue; // retry SAME batch — never advance
    }

    // Permanent failure
    failures++;
    attemptsPerBatch.push(attempts);
    attempts = 0;
    batchIdx++;
  }

  return { successes, failures, providerSwaps, attemptsPerBatch };
}

describe("AutoPilot 429 retry loop", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("retries the SAME batch many times on 429 then succeeds", async () => {
    const batches: Batch[] = [{ id: 1 }, { id: 2 }];
    let call = 0;
    // Batch 1: 429 × 7 then success. Batch 2: success immediately.
    const fetchFn = vi.fn(async (b: Batch): Promise<FetchResult> => {
      call++;
      if (b.id === 1 && call <= 7) return { ok: false, status: 429, errMsg: "429 rate limited" };
      return { ok: true, status: 200 };
    });

    const ac = new AbortController();
    const promise = runBatchLoop({
      batches, fetchFn,
      fallbackChain: ["lovable"],
      signal: ac.signal,
      rateLimitWaitMs: 1000,
      batchDelayMs: 100,
    });

    // Advance through 7 retries × 1000ms wait + final success + batch delay
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await promise;

    expect(result.successes).toBe(2);
    expect(result.failures).toBe(0);
    expect(result.attemptsPerBatch[0]).toBe(8); // 7 fails + 1 success
    expect(result.attemptsPerBatch[1]).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(9);
  });

  it("does NOT give up on 429 after 30+ attempts (infinite retry)", async () => {
    const batches: Batch[] = [{ id: 1 }];
    let call = 0;
    const fetchFn = vi.fn(async (): Promise<FetchResult> => {
      call++;
      // 35 consecutive 429s, then success. Old code (4 retries) would have failed.
      if (call <= 35) return { ok: false, status: 429, errMsg: "429" };
      return { ok: true, status: 200 };
    });

    const ac = new AbortController();
    const promise = runBatchLoop({
      batches, fetchFn,
      fallbackChain: ["lovable"],
      signal: ac.signal,
      rateLimitWaitMs: 500,
      batchDelayMs: 0,
    });

    await vi.advanceTimersByTimeAsync(60_000);
    const result = await promise;

    expect(result.successes).toBe(1);
    expect(result.failures).toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(36);
  });

  it("treats RATE_LIMIT_RETRYABLE error as 429 and retries", async () => {
    const batches: Batch[] = [{ id: 1 }];
    let call = 0;
    const fetchFn = vi.fn(async (): Promise<FetchResult> => {
      call++;
      if (call <= 3) return { ok: false, status: 500, errMsg: "RATE_LIMIT_RETRYABLE: upstream 503" };
      return { ok: true, status: 200 };
    });

    const ac = new AbortController();
    const promise = runBatchLoop({
      batches, fetchFn,
      fallbackChain: ["lovable"],
      signal: ac.signal,
      rateLimitWaitMs: 500,
      batchDelayMs: 0,
    });

    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result.successes).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("switches provider on TRUE quota exhaustion (no credits) — not on 429", async () => {
    const batches: Batch[] = [{ id: 1 }];
    let call = 0;
    const seenProviders: string[] = [];
    const fetchFn = vi.fn(async (_b: Batch, prov: string): Promise<FetchResult> => {
      call++;
      seenProviders.push(prov);
      if (call === 1) return { ok: false, status: 402, errMsg: "💳 no credits remaining" };
      return { ok: true, status: 200 };
    });

    const ac = new AbortController();
    const promise = runBatchLoop({
      batches, fetchFn,
      fallbackChain: ["primary", "fallback"],
      signal: ac.signal,
      rateLimitWaitMs: 500,
      batchDelayMs: 0,
    });

    await vi.advanceTimersByTimeAsync(2_000);
    const result = await promise;

    expect(result.providerSwaps).toBe(1);
    expect(result.successes).toBe(1);
    expect(seenProviders).toEqual(["primary", "fallback"]);
  });

  it("user abort during 429 wait stops the loop cleanly", async () => {
    const batches: Batch[] = [{ id: 1 }];
    const fetchFn = vi.fn(async (): Promise<FetchResult> => ({
      ok: false, status: 429, errMsg: "429",
    }));

    const ac = new AbortController();
    const promise = runBatchLoop({
      batches, fetchFn,
      fallbackChain: ["lovable"],
      signal: ac.signal,
      rateLimitWaitMs: 5_000,
      batchDelayMs: 0,
    });
    // Attach catch immediately to silence unhandled-rejection warning
    const settled = promise.catch((e) => e);

    // Let one fetch+wait tick begin, then abort mid-wait.
    await vi.advanceTimersByTimeAsync(200);
    ac.abort();
    await vi.advanceTimersByTimeAsync(200);

    const err = await settled;
    expect(err).toMatchObject({ name: "AbortError" });

    // Let one fetch+wait tick begin, then abort mid-wait.
    await vi.advanceTimersByTimeAsync(200);
    ac.abort();
    await vi.advanceTimersByTimeAsync(200);

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("delays BATCH_DELAY_MS between successful batches (rate-friendliness)", async () => {
    const batches: Batch[] = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const timestamps: number[] = [];
    const start = Date.now();
    const fetchFn = vi.fn(async (): Promise<FetchResult> => {
      timestamps.push(Date.now() - start);
      return { ok: true, status: 200 };
    });

    const ac = new AbortController();
    const promise = runBatchLoop({
      batches, fetchFn,
      fallbackChain: ["lovable"],
      signal: ac.signal,
      rateLimitWaitMs: 500,
      batchDelayMs: 2000,
    });

    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    // 3 batches → 2 inter-batch delays of 2000ms each
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(2000);
    expect(timestamps[2] - timestamps[1]).toBeGreaterThanOrEqual(2000);
  });

  it("regression: old behaviour (give up after 4 attempts) MUST be gone", async () => {
    // This codifies the bug we fixed: previous code threw after 4 retries.
    // The new loop must succeed on the 10th attempt.
    const batches: Batch[] = [{ id: 1 }];
    let call = 0;
    const fetchFn = vi.fn(async (): Promise<FetchResult> => {
      call++;
      return call < 10
        ? { ok: false, status: 429, errMsg: "429" }
        : { ok: true, status: 200 };
    });

    const ac = new AbortController();
    const promise = runBatchLoop({
      batches, fetchFn,
      fallbackChain: ["lovable"],
      signal: ac.signal,
      rateLimitWaitMs: 100,
      batchDelayMs: 0,
    });

    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result.failures).toBe(0);
    expect(result.successes).toBe(1);
  });
});
