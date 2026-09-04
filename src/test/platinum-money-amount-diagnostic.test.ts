import { describe, expect, it } from "vitest";
import { detectIssues } from "@/components/editor/DeepDiagnosticPanel";
import type { ExtractedEntry } from "@/components/editor/types";

function platEntry(original: string): ExtractedEntry {
  return {
    msbtFile: "platinum/veilstone_store_b1f",
    index: 1,
    label: "price",
    original,
    maxBytes: 0,
  } as ExtractedEntry;
}

/**
 * `$200` isn't a game tag — it's a visible price the translator writes out
 * like any other word — but its digits still have to survive translation
 * unchanged, and a plain `$\d+` check only watches the first digit group.
 */
describe("Platinum grouped money amounts", () => {
  it("catches a rewritten thousands group that a bare $N check would miss", () => {
    const entry = platEntry("They’re $1,000 each.");
    const issues = detectIssues(entry, "سعرها $1000 لكل واحدة");
    const categories = issues.map((issue) => issue.category);
    expect(categories).toContain("missing_vars");
  });

  it("passes a translation that keeps the full amount intact", () => {
    const entry = platEntry("They’re $1,000 each.");
    const issues = detectIssues(entry, "سعرها $1,000 لكل واحدة");
    const categories = issues.map((issue) => issue.category);
    expect(categories).not.toContain("missing_vars");
    expect(categories).not.toContain("corrupted_vars");
  });

  it("still catches an amount dropped entirely", () => {
    const entry = platEntry("They’re $1,000 each.");
    const issues = detectIssues(entry, "سعرها رخيص لكل واحدة");
    const categories = issues.map((issue) => issue.category);
    expect(categories).toContain("missing_vars");
  });
});
