import { describe, it, expect } from "vitest";
import { countEffectiveLines } from "@/lib/text-tokens";

/**
 * Regression coverage for countEffectiveLines — used by:
 *   - diagnostic-detect.ts (newline_mismatch / excessive_lines)
 *   - useEditorCleanup.ts (line sync, NPC, unified split)
 *   - useEditorTranslation.ts (autoSyncLines after AI translation)
 *   - LineBalancePanel.tsx (bulk rebalance scan)
 *   - DeepDiagnosticPanel.tsx (rebalance fix)
 *
 * Critical: [XENO:n ] and [System:PageBreak ] are HARD line breaks in the
 * XC3 engine and MUST count as line terminators. Counting only \n caused
 * thousands of false "excessive lines" warnings.
 */
describe("countEffectiveLines", () => {
  it("counts a single line", () => {
    expect(countEffectiveLines("Hello world")).toBe(1);
  });

  it("counts \\n-separated lines", () => {
    expect(countEffectiveLines("A\nB")).toBe(2);
    expect(countEffectiveLines("A\nB\nC")).toBe(3);
  });

  it("counts [XENO:n ] as a hard break", () => {
    expect(countEffectiveLines("A[XENO:n ]B")).toBe(2);
    expect(countEffectiveLines("A[XENO:n ]B[XENO:n ]C")).toBe(3);
  });

  it("does NOT double-count [XENO:n ] followed by \\n", () => {
    // The engine inserts the \n after the tag — it's the same break.
    expect(countEffectiveLines("A[XENO:n ]\nB")).toBe(2);
    expect(countEffectiveLines("A[XENO:n ]\nB[XENO:n ]\nC")).toBe(3);
  });

  it("counts [System:PageBreak ] as a hard break", () => {
    expect(countEffectiveLines("A[System:PageBreak ]B")).toBe(2);
    expect(countEffectiveLines("A[System:PageBreak ]\nB")).toBe(2);
  });

  it("handles empty string", () => {
    expect(countEffectiveLines("")).toBe(0);
  });

  it("counts a real cutscene line correctly", () => {
    const text = "Hello there.[XENO:n ]\nHow are you today?[XENO:n ]\nGoodbye.";
    expect(countEffectiveLines(text)).toBe(3);
  });

  it("ignores soft tags like [ML:icon] (those are inline, not line breaks)", () => {
    expect(countEffectiveLines("Press [ML:icon icon=btn_a ] to confirm")).toBe(1);
  });

  it("agrees with split('\\n').length on text with no hard breaks", () => {
    const text = "line1\nline2\nline3";
    expect(countEffectiveLines(text)).toBe(text.split("\n").length);
  });
});
