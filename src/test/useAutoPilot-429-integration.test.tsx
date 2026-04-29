/**
 * Integration test: useAutoPilot hook + AutoPilotPanel UI under 429 storms.
 *
 * Verifies the FULL stack (real hook → real fetch loop → real React state):
 *   - When the edge function returns 429 several times then succeeds, the hook
 *     keeps retrying without giving up.
 *   - UI state (`running`, `phase`, `progress`, `logs`, `report`) advances
 *     correctly and never freezes.
 *   - The final `report.fromAI` reflects all entries successfully translated.
 *   - `report.failed === 0` proves no entry was abandoned due to 429.
 *
 * We mock `fetch` so the request to `translate-entries` returns:
 *   call 1 → 429
 *   call 2 → 429
 *   call 3 → 429
 *   call 4 → 200 with full translations
 * The hook should retry the SAME batch and end with success.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAutoPilot } from "@/hooks/useAutoPilot";
import type { EditorState, ExtractedEntry } from "@/components/editor/types";

// Mock the toast hook (it pulls in side effects we don't need here).
vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
}));

// Mock the supabase-edge helpers so no real network env is required.
vi.mock("@/lib/supabase-edge", () => ({
  getEdgeFunctionUrl: (name: string) => `https://test.local/${name}`,
  getSupabaseHeaders: () => ({ "Content-Type": "application/json" }),
}));

function makeEntry(i: number): ExtractedEntry {
  return {
    msbtFile: "test.msbt",
    index: i,
    label: `lbl_${i}`,
    original: `Hello world ${i}`,
    maxBytes: 100,
  };
}

function makeState(n: number): EditorState {
  return {
    entries: Array.from({ length: n }, (_, i) => makeEntry(i)),
    translations: {},
  };
}

const baseProps = {
  activeGlossary: "",
  parseGlossaryMap: () => new Map<string, string>(),
  translationProvider: "lovable",
  userGeminiKey: "",
  userDeepSeekKey: "",
  userGroqKey: "",
  userCerebrasKey: "",
  userOpenRouterKey: "",
  myMemoryEmail: "",
  rebalanceNewlines: false,
  npcMaxLines: 3,
  aiModel: "gemini-2.5-flash",
  addAiRequest: vi.fn(),
  addMyMemoryChars: vi.fn(),
  qualityStats: { damagedTagKeys: new Set<string>() },
  filteredEntries: [] as ExtractedEntry[],
  customPromptInstructions: "",
};

/**
 * Build a stateful fetch mock that fails the first N calls with 429
 * then returns successful translations for every batch.
 */
function makeFlakyFetch(failuresBeforeSuccess: number) {
  let calls = 0;
  const callLog: { status: number; bodyKeys: string[] }[] = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    calls++;
    const body = JSON.parse(init.body as string);
    const entries = body.entries as { key: string; original: string }[];
    const bodyKeys = entries.map((e) => e.key);

    if (calls <= failuresBeforeSuccess) {
      callLog.push({ status: 429, bodyKeys });
      return new Response(
        JSON.stringify({ error: "429 too many requests" }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }

    // Success: translate every requested key
    const translations: Record<string, string> = {};
    for (const e of entries) translations[e.key] = `ترجمة ${e.original}`;
    callLog.push({ status: 200, bodyKeys });
    return new Response(
      JSON.stringify({ translations, providerUsed: "lovable" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  return { fetchMock, callLog, getCalls: () => calls };
}

describe("useAutoPilot — 429 integration (hook + UI state)", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("keeps retrying through 3 × 429 then succeeds; UI never freezes; report is correct", async () => {
    const { fetchMock, callLog } = makeFlakyFetch(3);
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    let editorState: EditorState | null = makeState(5);
    const setState: React.Dispatch<React.SetStateAction<EditorState | null>> = (updater) => {
      editorState = typeof updater === "function" ? (updater as (p: EditorState | null) => EditorState | null)(editorState) : updater;
    };

    const { result } = renderHook(() =>
      useAutoPilot({
        ...baseProps,
        state: editorState,
        setState,
      }),
    );

    // Initial UI state
    expect(result.current.running).toBe(false);
    expect(result.current.report).toBeNull();

    // Kick off in 'smart' mode
    let runPromise: Promise<void>;
    act(() => {
      runPromise = result.current.run("smart");
    });

    // UI should flip to running quickly
    await waitFor(() => expect(result.current.running).toBe(true), { timeout: 2000 });

    // Drive timers forward: 3 retries × 60s wait + processing time
    // We tick in small chunks so the promise queue can drain between waits.
    for (let i = 0; i < 250; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      if (!result.current.running) break;
    }

    // Wait for the run() promise to fully resolve
    await act(async () => { await runPromise!; });

    // ── ASSERTIONS ───────────────────────────────────────────────
    // 1. Run terminated cleanly
    expect(result.current.running).toBe(false);

    // 2. fetch was called exactly 4 times (3 × 429 + 1 success) on the SAME batch
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(callLog.filter((c) => c.status === 429)).toHaveLength(3);
    expect(callLog.filter((c) => c.status === 200)).toHaveLength(1);

    // 3. All 4 attempts were the SAME batch keys (no skipping forward)
    const firstKeys = callLog[0].bodyKeys.join(",");
    for (const c of callLog) expect(c.bodyKeys.join(",")).toBe(firstKeys);

    // 4. Report shows 5 successful translations, 0 failed
    expect(result.current.report).not.toBeNull();
    expect(result.current.report!.fromAI).toBe(5);
    expect(result.current.report!.failed).toBe(0);

    // 5. State was updated with the actual translations
    expect(editorState!.translations["test.msbt:0"]).toContain("ترجمة Hello world 0");
    expect(Object.keys(editorState!.translations)).toHaveLength(5);

    // 6. Logs contain at least one rate-limit warning (proves UI surfaced it)
    const warnLogs = result.current.logs.filter((l) => l.type === "warning");
    expect(warnLogs.some((l) => /تجاوز حد|محاولة/.test(l.message))).toBe(true);

    // 7. Final phase is "complete" (phaseIndex moved past AI phase)
    expect(result.current.phaseIndex).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it("survives a long 429 storm (10 consecutive failures) and still completes", async () => {
    const { fetchMock } = makeFlakyFetch(10);
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    let editorState: EditorState | null = makeState(3);
    const setState: React.Dispatch<React.SetStateAction<EditorState | null>> = (updater) => {
      editorState = typeof updater === "function" ? (updater as (p: EditorState | null) => EditorState | null)(editorState) : updater;
    };

    const { result } = renderHook(() =>
      useAutoPilot({ ...baseProps, state: editorState, setState }),
    );

    let runPromise: Promise<void>;
    act(() => { runPromise = result.current.run("smart"); });

    await waitFor(() => expect(result.current.running).toBe(true), { timeout: 2000 });

    // 10 retries × 60s wait ≈ 600s + overhead. Tick generously.
    for (let i = 0; i < 700; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      if (!result.current.running) break;
    }

    await act(async () => { await runPromise!; });

    expect(result.current.running).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(11); // 10 × 429 + 1 success
    expect(result.current.report!.fromAI).toBe(3);
    expect(result.current.report!.failed).toBe(0);
  }, 90_000);

  it("user-initiated stop during 429 wait halts the run cleanly", async () => {
    // Always return 429 — user must stop manually
    const fetchMock = vi.fn(async () =>
      new Response('{"error":"429"}', { status: 429, headers: { "Content-Type": "application/json" } }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    let editorState: EditorState | null = makeState(2);
    const setState: React.Dispatch<React.SetStateAction<EditorState | null>> = (updater) => {
      editorState = typeof updater === "function" ? (updater as (p: EditorState | null) => EditorState | null)(editorState) : updater;
    };

    const { result } = renderHook(() =>
      useAutoPilot({ ...baseProps, state: editorState, setState }),
    );

    let runPromise: Promise<void>;
    act(() => { runPromise = result.current.run("smart"); });

    await waitFor(() => expect(result.current.running).toBe(true), { timeout: 2000 });

    // Let it hit 429 at least twice
    for (let i = 0; i < 130; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      if (fetchMock.mock.calls.length >= 2) break;
    }

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);

    // Stop the run
    act(() => { result.current.stop(); });

    // Drain the abortable wait loop
    for (let i = 0; i < 30; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      if (!result.current.running) break;
    }

    await act(async () => { await runPromise!; });

    expect(result.current.running).toBe(false);
    // A report is set even on abort, but no entries were translated
    expect(result.current.report?.fromAI ?? 0).toBe(0);
    // Log shows manual stop
    expect(result.current.logs.some((l) => /أوقفت|موقوف/.test(l.message))).toBe(true);
  }, 60_000);
});
