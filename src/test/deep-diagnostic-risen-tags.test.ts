import { describe, expect, it } from "vitest";
import { detectIssues } from "@/components/editor/DeepDiagnosticPanel";
import { restoreRisenTags } from "@/lib/risen-tag-guard";
import type { ExtractedEntry } from "@/components/editor/types";

function risenEntry(original: string): ExtractedEntry {
  return { msbtFile: "infos.tab", index: 1, label: "name", original, maxBytes: 0 } as ExtractedEntry;
}

function xenobladeEntry(original: string): ExtractedEntry {
  return { msbtFile: "system.msbt", index: 1, label: "name", original, maxBytes: 0 } as ExtractedEntry;
}

describe("Deep diagnostic — Risen 1 tag detection", () => {
  it("flags a Risen entry whose <Tag> was translated away", () => {
    const entry = risenEntry("Press <Exit> to leave.");
    const issues = detectIssues(entry, "اضغط خروج للمغادرة.");
    const categories = issues.map((i) => i.category);
    expect(categories).toContain("risen_tag_mismatch");
    const issue = issues.find((i) => i.category === "risen_tag_mismatch");
    expect(issue?.message).toContain("<Exit>");
    expect(issue?.severity).toBe("critical");
  });

  it("does not flag a Risen entry that kept its tag intact", () => {
    const entry = risenEntry("Press <Exit> to leave.");
    const issues = detectIssues(entry, "اضغط <Exit> للمغادرة.");
    expect(issues.map((i) => i.category)).not.toContain("risen_tag_mismatch");
  });

  it("does not flag entries with no Risen tags at all", () => {
    const entry = risenEntry("A simple line of dialogue.");
    const issues = detectIssues(entry, "سطر حوار بسيط.");
    expect(issues.map((i) => i.category)).not.toContain("risen_tag_mismatch");
  });

  it("never routes a Risen tag loss through the XC3 technical_mismatch category (which restores the full English original)", () => {
    const entry = risenEntry("Press <Exit> to leave.");
    const issues = detectIssues(entry, "اضغط خروج للمغادرة.");
    expect(issues.map((i) => i.category)).not.toContain("technical_mismatch");
  });

  it("does not run Risen detection on non-Risen (Xenoblade) entries even if they happen to contain angle brackets", () => {
    const entry = xenobladeEntry("Press <Exit> to leave.");
    const issues = detectIssues(entry, "اضغط خروج للمغادرة.");
    expect(issues.map((i) => i.category)).not.toContain("risen_tag_mismatch");
  });
});

describe("Deep diagnostic — Risen tag fix safety (restoreRisenTags)", () => {
  it("appends the missing tag without deleting any translated word", () => {
    const original = "Press <Exit> to leave.";
    const translation = "اضغط خروج للمغادرة.";
    const repaired = restoreRisenTags(original, translation);
    expect(repaired.changed).toBe(true);
    expect(repaired.text).toContain("اضغط خروج للمغادرة.");
    expect(repaired.text).toContain("<Exit>");
    expect(repaired.text).not.toBe(original);
  });

  it("never wipes the translation back to the English original the way RESTORE_ORIGINAL_CATEGORIES would", () => {
    const original = "Press <Exit> to leave.";
    const translation = "اضغط خروج للمغادرة.";
    const repaired = restoreRisenTags(original, translation);
    expect(repaired.text).not.toBe(original);
  });
});
