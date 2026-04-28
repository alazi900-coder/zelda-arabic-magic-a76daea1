/**
 * Tests for the shared batch-quality types & helpers (`src/lib/batch-quality.ts`).
 * These guard the contract used by both the edge function (producer) and the
 * BatchQualityModal UI (consumer).
 */
import { describe, it, expect } from "vitest";
import {
  emptyCumulative,
  type BatchQualityStats,
  type CumulativeQuality,
  type BatchQualityError,
} from "@/lib/batch-quality";

describe("emptyCumulative", () => {
  it("returns all-zero counters and empty errors array", () => {
    const c = emptyCumulative();
    expect(c).toEqual({
      batches: 0,
      total: 0,
      withArabic: 0,
      placeholdersOk: 0,
      newlineStripped: 0,
      errors: [],
    });
  });

  it("returns a fresh object each call (no shared reference)", () => {
    const a = emptyCumulative();
    const b = emptyCumulative();
    a.batches = 5;
    a.errors.push({ key: "K", reason: "x" });
    expect(b.batches).toBe(0);
    expect(b.errors).toEqual([]);
  });
});

describe("BatchQualityStats / CumulativeQuality shape", () => {
  it("accepts a well-formed BatchQualityStats", () => {
    const stats: BatchQualityStats = {
      total: 10,
      returned: 10,
      validJson: true,
      withArabic: 9,
      placeholdersOk: 8,
      newlineStripped: 3,
      errors: [{ key: "K1", reason: "no-arabic", sample: "hello" }],
    };
    expect(stats.total).toBe(10);
    expect(stats.errors[0].sample).toBe("hello");
  });

  it("BatchQualityError.sample is optional", () => {
    const e: BatchQualityError = { key: "K", reason: "missing" };
    expect(e.sample).toBeUndefined();
  });

  it("cumulative can accumulate from multiple batches", () => {
    const c: CumulativeQuality = emptyCumulative();
    const batch: BatchQualityStats = {
      total: 5, returned: 5, validJson: true,
      withArabic: 5, placeholdersOk: 4, newlineStripped: 1, errors: [],
    };
    // simulate the merge the editor performs
    c.batches += 1;
    c.total += batch.total;
    c.withArabic += batch.withArabic;
    c.placeholdersOk += batch.placeholdersOk;
    c.newlineStripped += batch.newlineStripped;
    expect(c).toEqual({
      batches: 1, total: 5, withArabic: 5,
      placeholdersOk: 4, newlineStripped: 1, errors: [],
    });
  });
});
