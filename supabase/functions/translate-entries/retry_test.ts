/**
 * Edge Function test: 429 retry semantics inside `callLovableAI`.
 *
 * We cannot easily import the giant index.ts, so we re-implement the EXACT
 * 429 loop from the deployed code (lines ~1699-1758 of index.ts) and verify:
 *   - Multiple consecutive 429s → keep waiting & retrying (no give-up).
 *   - Eventually returns success when upstream recovers.
 *   - Bails with RATE_LIMIT_RETRYABLE if it can't fit another wait+request
 *     inside the edge-function 140s wall-clock budget (so client can retry).
 *   - 5xx → also surfaced as RATE_LIMIT_RETRYABLE (not a hard failure).
 *   - 402 → hard failure (no infinite loop on real quota).
 *
 * Run with:  deno test --allow-net --allow-env supabase/functions/translate-entries/retry_test.ts
 */
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

// --- Re-implementation of the deployed loop (must mirror index.ts) ---
async function callLovableAIWithRetry(opts: {
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
  waitMs: number;
  maxElapsedMs: number;
  nowFn?: () => number;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<{ ok: true; attempts: number } | never> {
  const { fetchImpl, waitMs, maxElapsedMs, nowFn = Date.now, sleepFn } = opts;
  const sleep = sleepFn ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const startedAt = nowFn();
  let attempt = 0;

  while (true) {
    attempt++;
    const response = await fetchImpl("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    if (response.ok) {
      await response.text(); // consume body
      return { ok: true, attempts: attempt };
    }

    await response.text();

    if (response.status === 402) {
      throw new Error("💳 رصيد Lovable AI غير كافٍ");
    }

    if (response.status === 429) {
      const elapsed = nowFn() - startedAt;
      if (elapsed + waitMs + 5_000 > maxElapsedMs) {
        throw new Error("⏳ RATE_LIMIT_RETRYABLE: rate limited — client should retry");
      }
      await sleep(waitMs);
      continue;
    }

    if (response.status >= 500 && response.status < 600) {
      throw new Error(`⏳ RATE_LIMIT_RETRYABLE: upstream ${response.status}`);
    }

    throw new Error(`Lovable AI error: ${response.status}`);
  }
}

// Helper: build a fetch mock that returns a queued sequence of statuses.
function makeFetchMock(statuses: number[]) {
  let i = 0;
  const calls: number[] = [];
  const fetchImpl = (_url: string, _init: RequestInit) => {
    const status = statuses[Math.min(i, statuses.length - 1)];
    calls.push(status);
    i++;
    return Promise.resolve(new Response(status === 200 ? '{"ok":true}' : "err", { status }));
  };
  return { fetchImpl, calls };
}

Deno.test("429 then 200: retries once and succeeds", async () => {
  const { fetchImpl, calls } = makeFetchMock([429, 200]);
  const result = await callLovableAIWithRetry({
    fetchImpl,
    waitMs: 10,
    maxElapsedMs: 140_000,
  });
  assertEquals(result.ok, true);
  assertEquals(result.attempts, 2);
  assertEquals(calls, [429, 200]);
});

Deno.test("Many consecutive 429s: keeps retrying (no premature give-up)", async () => {
  // 8 consecutive 429s then success. Old code gave up after 4.
  const { fetchImpl, calls } = makeFetchMock([429, 429, 429, 429, 429, 429, 429, 429, 200]);
  const result = await callLovableAIWithRetry({
    fetchImpl,
    waitMs: 5,
    maxElapsedMs: 140_000,
  });
  assertEquals(result.ok, true);
  assertEquals(result.attempts, 9);
  assertEquals(calls.length, 9);
});

Deno.test("429 with no time budget left: bails with RATE_LIMIT_RETRYABLE for client", async () => {
  // Simulate clock that jumps forward so the budget check trips after 1 attempt.
  let now = 0;
  const { fetchImpl } = makeFetchMock([429, 429, 429]);
  await assertRejects(
    () => callLovableAIWithRetry({
      fetchImpl,
      waitMs: 60_000,
      maxElapsedMs: 140_000,
      nowFn: () => {
        const t = now;
        now += 100_000; // every call advances 100s → budget exhausted on 2nd check
        return t;
      },
      sleepFn: () => Promise.resolve(),
    }),
    Error,
    "RATE_LIMIT_RETRYABLE",
  );
});

Deno.test("5xx upstream: surfaced as RATE_LIMIT_RETRYABLE (client retries)", async () => {
  const { fetchImpl } = makeFetchMock([503]);
  await assertRejects(
    () => callLovableAIWithRetry({ fetchImpl, waitMs: 5, maxElapsedMs: 140_000 }),
    Error,
    "RATE_LIMIT_RETRYABLE",
  );
});

Deno.test("402: hard failure — no infinite retry on real billing issues", async () => {
  const { fetchImpl, calls } = makeFetchMock([402]);
  await assertRejects(
    () => callLovableAIWithRetry({ fetchImpl, waitMs: 5, maxElapsedMs: 140_000 }),
    Error,
    "💳",
  );
  assertEquals(calls.length, 1); // only ONE attempt, no retry
});

Deno.test("Mixed 429 → 503 → 200: pure 429s retry, 5xx bails (client recovers)", async () => {
  const { fetchImpl, calls } = makeFetchMock([429, 429, 503]);
  await assertRejects(
    () => callLovableAIWithRetry({ fetchImpl, waitMs: 5, maxElapsedMs: 140_000 }),
    Error,
    "RATE_LIMIT_RETRYABLE: upstream 503",
  );
  assertEquals(calls, [429, 429, 503]);
});
