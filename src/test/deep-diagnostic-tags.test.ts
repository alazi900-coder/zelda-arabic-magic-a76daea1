import { describe, expect, it } from "vitest";
import { detectIssues } from "@/components/editor/DeepDiagnosticPanel";
import type { ExtractedEntry } from "@/components/editor/types";

function makeEntry(original: string): ExtractedEntry {
  return {
    msbtFile: "test_file",
    index: 1,
    label: "name",
    original,
    maxBytes: 0,
  } as ExtractedEntry;
}

describe("Deep diagnostic translated tag deduping", () => {
  it("reports translated tags without duplicating them as missing tags", () => {
    const entry = makeEntry("\\[Passive\\] Boosts activation rate");
    const issues = detectIssues(entry, "\\[سلبي\\] يعزز معدل التفعيل");
    const categories = issues.map(issue => issue.category);

    expect(categories).toContain("translated_tags");
    expect(categories).not.toContain("tag_mismatch");
  });

  it("keeps a missing-tag warning when another original tag is actually absent", () => {
    const entry = makeEntry("\\[Active\\] $2 chance [XENO]1 will lower");
    const issues = detectIssues(entry, "\\[نشط\\] فرصة $2 سيقلل");
    const categories = issues.map(issue => issue.category);
    const missing = issues.find(issue => issue.category === "tag_mismatch");

    expect(categories).toContain("translated_tags");
    expect(categories).toContain("tag_mismatch");
    expect(missing?.message).toContain("[XENO]1");
  });

  it("treats translated brace tags as translated instead of missing", () => {
    const entry = makeEntry("Hello {player:name} world");
    const issues = detectIssues(entry, "مرحبا {لاعب:اسم} بالعالم");
    const categories = issues.map(issue => issue.category);

    expect(categories).toContain("translated_tags");
    expect(categories).not.toContain("tag_mismatch");
  });
});