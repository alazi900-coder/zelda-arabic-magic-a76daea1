import { describe, it, expect } from "vitest";
import {
  diagnoseLineSplit,
  proposeBetterSplit,
  scanLineSplitQuality,
  SCORE_THRESHOLD,
} from "@/lib/line-split-quality";

describe("diagnoseLineSplit", () => {
  it("returns clean score when translation matches original structure", () => {
    const orig = "First line.\nSecond line.";
    const tr = "السطر الأوّل.\nالسطر الثاني.";
    const d = diagnoseLineSplit(orig, tr);
    expect(d.score).toBeLessThan(SCORE_THRESHOLD);
  });

  it("flags line-count mismatch", () => {
    const orig = "Line A.\nLine B.\nLine C.";
    const tr = "السطر أ. السطر ب. السطر ج.";
    const d = diagnoseLineSplit(orig, tr);
    expect(d.causes).toContain("line-count-mismatch");
    expect(d.score).toBeGreaterThanOrEqual(SCORE_THRESHOLD);
  });

  it("flags very short orphan lines", () => {
    const orig = "Press A to confirm and proceed forward.\nPress B to cancel.";
    const tr = "اضغط A للتأكيد والمتابعة\nماذا\nاضغط B للإلغاء";
    const d = diagnoseLineSplit(orig, tr);
    expect(d.causes).toContain("very-short-line");
  });

  it("flags broken phrase when next line starts with conjunction", () => {
    const orig = "Hello there my friend, how are you doing today?";
    const tr = "مرحباً يا صديقي كيف حالك\nو كيف يومك اليوم";
    const d = diagnoseLineSplit(orig, tr);
    expect(d.causes).toContain("broken-phrase");
  });
});

describe("proposeBetterSplit", () => {
  it("collapses to a single line when original is one line", () => {
    const out = proposeBetterSplit("Hello world", "مرحبا\nبالعالم");
    expect(out).toBe("مرحبا بالعالم");
  });

  it("produces matching number of lines as original", () => {
    const orig = "First sentence here.\nSecond sentence here.";
    const tr = "الجملة الأولى هنا. الجملة الثانية هنا.";
    const out = proposeBetterSplit(orig, tr);
    expect(out.split("\n").length).toBe(2);
  });

  it("does not start a new line with و", () => {
    const orig = "A B C D.\nE F G H.";
    const tr = "أ ب ج د و هـ ز ح ط";
    const out = proposeBetterSplit(orig, tr);
    const lines = out.split("\n");
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i].trim().split(/\s+/)[0]).not.toBe("و");
    }
  });

  it("preserves PUA tags through split", () => {
    const orig = "Press \uE001 to start.\nGo now.";
    const tr = "اضغط \uE001 للبدء اذهب الآن";
    const out = proposeBetterSplit(orig, tr);
    expect(out).toContain("\uE001");
  });
});

describe("scanLineSplitQuality", () => {
  it("flags entries with bad splits and produces proposals", () => {
    const entries = [
      { msbtFile: "F.msbt", index: 0, label: "x", original: "Hello there.\nGoodbye now." },
      { msbtFile: "F.msbt", index: 1, label: "y", original: "Clean line one.\nClean line two." },
    ];
    const translations = {
      "F.msbt:0": "مرحباً يا صديقي كيف حالك إلى اللقاء الآن", // سطر واحد، الأصل سطران
      "F.msbt:1": "السطر النظيف الأوّل.\nالسطر النظيف الثاني.", // متطابق
    };
    const res = scanLineSplitQuality(entries, translations);
    expect(res.scanned).toBe(2);
    expect(res.flagged).toBe(1);
    expect(res.issues[0].key).toBe("F.msbt:0");
    expect(res.issues[0].proposed).not.toBe(translations["F.msbt:0"]);
  });

  it("ignores empty translations", () => {
    const entries = [{ msbtFile: "F.msbt", index: 0, label: "x", original: "A\nB" }];
    const res = scanLineSplitQuality(entries, { "F.msbt:0": "" });
    expect(res.scanned).toBe(0);
    expect(res.flagged).toBe(0);
  });
});
