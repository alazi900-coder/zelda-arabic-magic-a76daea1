import { describe, expect, it } from "vitest";
import { detectIssues } from "@/components/editor/DeepDiagnosticPanel";
import type { ExtractedEntry } from "@/components/editor/types";

function xenobladeEntry(original: string): ExtractedEntry {
  return { msbtFile: "system.msbt", index: 1, label: "name", original, maxBytes: 0 } as ExtractedEntry;
}

function risenEntry(original: string): ExtractedEntry {
  return { msbtFile: "infos.tab", index: 1, label: "name", original, maxBytes: 0 } as ExtractedEntry;
}

describe("Deep diagnostic — format specifier (%s/%d/%i/%f) detection", () => {
  it("flags a missing %s as critical", () => {
    const entry = xenobladeEntry("You have %s items");
    const issues = detectIssues(entry, "لديك أغراض");
    const issue = issues.find((i) => i.category === "format_specifier_mismatch");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("critical");
    expect(issue?.message).toContain("%s");
  });

  it("flags an extra %d not present in the original", () => {
    const entry = xenobladeEntry("You win");
    const issues = detectIssues(entry, "لقد فزت %d");
    const issue = issues.find((i) => i.category === "format_specifier_mismatch");
    expect(issue).toBeDefined();
    expect(issue?.message).toContain("زائد");
  });

  it("flags REORDERED specifiers (same set, swapped sequence) distinctly from a count mismatch", () => {
    const entry = xenobladeEntry("You have %i gold and %s items");
    const issues = detectIssues(entry, "لديك %s ذهب و%i غرضاً");
    const categories = issues.map((i) => i.category);
    expect(categories).toContain("format_specifier_reordered");
    expect(categories).not.toContain("format_specifier_mismatch");
    const issue = issues.find((i) => i.category === "format_specifier_reordered");
    expect(issue?.severity).toBe("critical");
  });

  it("does not flag anything when specifiers survive identically", () => {
    const entry = xenobladeEntry("You have %i gold and %s items");
    const issues = detectIssues(entry, "لديك %i ذهباً و%s غرضاً");
    const categories = issues.map((i) => i.category);
    expect(categories).not.toContain("format_specifier_mismatch");
    expect(categories).not.toContain("format_specifier_reordered");
  });

  it("does nothing when the original has no format specifiers at all", () => {
    const entry = xenobladeEntry("Hello there");
    const issues = detectIssues(entry, "مرحباً");
    const categories = issues.map((i) => i.category);
    expect(categories).not.toContain("format_specifier_mismatch");
    expect(categories).not.toContain("format_specifier_reordered");
  });

  it("applies equally to Risen (.tab) entries — the check is game-agnostic", () => {
    const entry = risenEntry("You found %i gold");
    const issues = detectIssues(entry, "وجدت ذهباً");
    const issue = issues.find((i) => i.category === "format_specifier_mismatch");
    expect(issue).toBeDefined();
  });
});
