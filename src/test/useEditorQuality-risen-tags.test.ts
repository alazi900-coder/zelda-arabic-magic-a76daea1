import { describe, it, expect } from "vitest";
import { computeEntryResult } from "@/hooks/useEditorQuality";
import type { ExtractedEntry } from "@/components/editor/types";

function risenEntry(original: string): ExtractedEntry {
  return { msbtFile: "infos.tab", index: 0, label: "", original, maxBytes: 0 };
}

describe("computeEntryResult — Risen missing-tag detection (diffRisenTags)", () => {
  it("flags a Risen entry whose <Tag> was translated away (historical corruption)", () => {
    const entry = risenEntry("Press <Exit> to leave.");
    const result = computeEntryResult(entry, "اضغط خروج للمغادرة.", "risen-dialogue");
    expect(result.qMissingTags).toBe(true);
  });

  it("does not flag a Risen entry that kept its <Tag> intact", () => {
    const entry = risenEntry("Press <Exit> to leave.");
    const result = computeEntryResult(entry, "اضغط <Exit> للمغادرة.", "risen-dialogue");
    expect(result.qMissingTags).toBe(false);
  });

  it("does not flag a Risen entry with no tags in the original at all", () => {
    const entry = risenEntry("A simple line of dialogue.");
    const result = computeEntryResult(entry, "سطر حوار بسيط.", "risen-dialogue");
    expect(result.qMissingTags).toBe(false);
  });

  it("still uses XC3 bracket-tag detection for non-Risen entries", () => {
    const entry: ExtractedEntry = { msbtFile: "system.msbt", index: 0, label: "", original: "Press [ML:A] to leave.", maxBytes: 0 };
    const result = computeEntryResult(entry, "اضغط للمغادرة.", "system");
    expect(result.qMissingTags).toBe(true);
  });
});
