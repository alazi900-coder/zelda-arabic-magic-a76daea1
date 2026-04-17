import { describe, expect, it } from "vitest";
import {
  packRebalanceBatch,
  unpackRebalanceBatch,
  packRebalanceResults,
  unpackRebalanceResults,
  packDetectBatch,
  unpackDetectBatch,
  packIssueBatch,
  unpackIssueBatch,
  severityToCode,
  codeToSeverity,
} from "@/lib/worker-codec";

describe("worker-codec round-trip", () => {
  it("preserves rebalance batches with arabic + tags + newlines", () => {
    const records = [
      { key: "file.bdat:0", original: "Hello world", translation: "مرحباً يا عالم", englishLineCount: 1 },
      { key: "file.bdat:1", original: "[XENO:n ]\nLine", translation: "[XENO:n ]\nسطر", englishLineCount: 2 },
      { key: "edge:2", original: "", translation: "", englishLineCount: 0 },
    ];
    const packed = packRebalanceBatch(records);
    expect(packed.buffer).toBeInstanceOf(ArrayBuffer);
    expect(packed.count).toBe(3);
    const out = unpackRebalanceBatch(packed.buffer);
    expect(out).toEqual(records);
  });

  it("preserves rebalance results", () => {
    const results = [
      { key: "a:1", fixed: "نص مُصلَح" },
      { key: "b:2", fixed: "[XENO:n ]\nأخرى" },
    ];
    const packed = packRebalanceResults(results);
    const out = unpackRebalanceResults(packed.buffer);
    expect(out).toEqual(results);
  });

  it("preserves detect batches including maxBytes and labels", () => {
    const records = [
      { msbtFile: "menu.bdat", index: "0", label: "Title", original: "Start", translation: "ابدأ", maxBytes: 32 },
      { msbtFile: "scn.bdat", index: "42", label: "Cinematic 42", original: "Run!", translation: "اهرب!", maxBytes: 0 },
    ];
    const packed = packDetectBatch(records);
    const out = unpackDetectBatch(packed.buffer);
    expect(out).toEqual(records);
  });

  it("preserves diagnostic issues with severity codes", () => {
    const issues = [
      { key: "a:1", label: "L", original: "O", translation: "T", severity: 0 as const, category: "control_chars", message: "msg" },
      { key: "b:2", label: "L2", original: "O2", translation: "T2", severity: 1 as const, category: "tag_mismatch", message: "msg2" },
      { key: "c:3", label: "L3", original: "O3", translation: "T3", severity: 2 as const, category: "identical_to_original", message: "msg3" },
    ];
    const packed = packIssueBatch(issues);
    const out = unpackIssueBatch(packed.buffer);
    expect(out).toEqual(issues);
  });

  it("severity code mapping is bidirectional", () => {
    for (const s of ["critical", "warning", "info"] as const) {
      expect(codeToSeverity(severityToCode(s))).toBe(s);
    }
  });

  it("handles empty batches", () => {
    expect(unpackRebalanceBatch(packRebalanceBatch([]).buffer)).toEqual([]);
    expect(unpackDetectBatch(packDetectBatch([]).buffer)).toEqual([]);
    expect(unpackIssueBatch(packIssueBatch([]).buffer)).toEqual([]);
  });

  it("handles 4-byte UTF-8 (emoji + surrogate pairs)", () => {
    const records = [
      { key: "emoji", original: "🎮 game 🎯", translation: "لعبة 🚀✨", englishLineCount: 1 },
    ];
    const out = unpackRebalanceBatch(packRebalanceBatch(records).buffer);
    expect(out).toEqual(records);
  });
});
