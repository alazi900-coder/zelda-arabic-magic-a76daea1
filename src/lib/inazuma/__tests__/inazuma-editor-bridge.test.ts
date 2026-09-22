import { describe, expect, it } from "vitest";
import { restoreInazumaTranslations, INAZUMA_FILE_RE } from "../inazuma-editor-bridge";
import { categorizeInazumaEntry, INAZUMA_CATEGORIES } from "../inazuma-categories";
import { resolveGameParam } from "@/lib/game-param";
import { detectIssues } from "@/lib/diagnostic-detect";
import type { ExtractedEntry } from "@/components/editor/types";

const entry = (msbtFile: string, index = 0, original = "Hello"): ExtractedEntry => ({
  msbtFile,
  index,
  label: original,
  original,
  maxBytes: 0,
});

describe("Inazuma editor bridge", () => {
  it("keeps only the translations whose rows still exist", () => {
    const entries = [entry("inazuma/evet", 1), entry("inazuma/unitbase", 2)];
    const restored = restoreInazumaTranslations(entries, {
      "inazuma/evet:1": "مرحباً",
      "inazuma/mcht:99": "سطر اختفى",
    });
    expect(restored).toEqual({ "inazuma/evet:1": "مرحباً" });
  });

  it("claims its own file prefix", () => {
    expect(INAZUMA_FILE_RE.test("inazuma/evet")).toBe(true);
    expect(INAZUMA_FILE_RE.test("platinum/msg")).toBe(false);
  });
});

describe("Inazuma categories", () => {
  it("files each source under its own category", () => {
    expect(categorizeInazumaEntry(entry("inazuma/evet"))).toBe("iz-dialogue");
    expect(categorizeInazumaEntry(entry("inazuma/mcht"))).toBe("iz-match");
    expect(categorizeInazumaEntry(entry("inazuma/unitbase"))).toBe("iz-players");
  });

  it("only produces categories the filter bar knows", () => {
    const ids = new Set(INAZUMA_CATEGORIES.map((c) => c.id));
    for (const file of ["inazuma/evet", "inazuma/mcht", "inazuma/unitbase", "inazuma/other"]) {
      expect(ids.has(categorizeInazumaEntry(entry(file)))).toBe(true);
    }
  });
});

describe("Inazuma wiring", () => {
  it("routes its rows to its own AI prompt lore", () => {
    expect(resolveGameParam("inazuma/evet")).toBe("inazuma");
  });

  it("makes the deep diagnostic flag a dropped engine token", () => {
    const issues = detectIssues(
      { msbtFile: "inazuma/evet", index: 3, label: "x", maxBytes: 0, original: "Ready?\\fLet's go, %1F!" },
      "مستعد؟ هيا بنا!"
    );
    expect(issues.some((i) => i.category === "inazuma_tag_mismatch" && i.severity === "critical")).toBe(true);
  });

  it("passes a translation that kept them", () => {
    const issues = detectIssues(
      { msbtFile: "inazuma/evet", index: 3, label: "x", maxBytes: 0, original: "Ready?\\fLet's go, %1F!" },
      "مستعد؟\\fهيا بنا يا %1F!"
    );
    expect(issues.some((i) => i.category === "inazuma_tag_mismatch")).toBe(false);
  });

  it("calls a dropped line break a split, not a broken token", () => {
    // Every other game in this editor reports a translation that ran two
    // lines together as "يحتاج تقسيم" and offers to split it. This one used
    // to call the same thing a missing tag and offer the English back.
    // `original` carries a real newline here, the same as extractInazumaEntries
    // hands the rest of the editor -- the cartridge's own literal `\n` never
    // reaches this layer.
    const issues = detectIssues(
      { msbtFile: "inazuma/evet", index: 4, label: "x", maxBytes: 0, original: "You got the manual for\n%s!" },
      "حصلت على دليل %s!"
    );
    expect(issues.some((i) => i.category === "under_split")).toBe(true);
    expect(issues.some((i) => i.category === "inazuma_tag_mismatch")).toBe(false);
  });

  it("still calls a dropped value slot a broken token", () => {
    const issues = detectIssues(
      { msbtFile: "inazuma/evet", index: 5, label: "x", maxBytes: 0, original: "Obtained: %s" },
      "تم الحصول عليه"
    );
    expect(issues.some((i) => i.category === "inazuma_tag_mismatch")).toBe(true);
    expect(issues.some((i) => i.category === "under_split")).toBe(false);
  });
});
