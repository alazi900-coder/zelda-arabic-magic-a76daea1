import { describe, expect, it } from "vitest";
import { DEFAULT_ENHANCE_SCAN_LIMIT, selectEnhanceScanRound } from "@/lib/enhance-scan-round";

describe("enhancement incremental scanning", () => {
  const entries = Array.from({ length: 2468 }, (_, i) => i);
  it("defaults to a small, complete round instead of scanning the entire ROM", () => {
    expect(DEFAULT_ENHANCE_SCAN_LIMIT).toBe(150);
    expect(selectEnhanceScanRound(entries, DEFAULT_ENHANCE_SCAN_LIMIT)).toEqual(entries.slice(0, 150));
  });
  it("allows a follow-up to take the next untouched entries", () => {
    const next = selectEnhanceScanRound(entries.slice(150), 150);
    expect(next).toEqual(entries.slice(150, 300));
  });
  it("handles short ranges and explicit full scans", () => {
    expect(selectEnhanceScanRound(entries.slice(2400), 150)).toEqual(entries.slice(2400));
    expect(selectEnhanceScanRound(entries, 100)).toHaveLength(100);
    expect(selectEnhanceScanRound(entries, 300)).toHaveLength(300);
    expect(selectEnhanceScanRound(entries, "all")).toEqual(entries);
  });
});
