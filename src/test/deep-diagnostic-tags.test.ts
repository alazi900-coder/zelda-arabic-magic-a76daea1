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

  it("detects technical symbol mismatches even when the counts still match", () => {
    const entry = makeEntry(`رمز \uE001 تقني`.replace("\\uE001", "\uE001"));
    const issues = detectIssues(entry, `رمز \uE002 تقني`.replace("\\uE002", "\uE002"));
    const mismatch = issues.find(issue => issue.category === "technical_mismatch");

    expect(mismatch).toBeDefined();
    expect(mismatch?.message).toContain("U+E001");
    expect(mismatch?.message).toContain("U+E002");
  });

  it("detects [XENO:n ] not followed by newline", () => {
    const entry = makeEntry("Hello[XENO:n ]\nworld");
    const issues = detectIssues(entry, "مرحبا[XENO:n ]بالعالم");
    const xenoN = issues.find(i => i.category === "xeno_n_no_newline");
    expect(xenoN).toBeDefined();
    expect(xenoN?.message).toContain("[XENO:n ]");
  });

  it("does not flag [XENO:n ] when followed by newline", () => {
    const entry = makeEntry("Hello[XENO:n ]\nworld");
    const issues = detectIssues(entry, "مرحبا[XENO:n ]\nبالعالم");
    expect(issues.find(i => i.category === "xeno_n_no_newline")).toBeUndefined();
  });

  it("uses the GTA IV runtime-token guard instead of generic XC3 diagnostics", () => {
    const entry = { ...makeEntry("~r~ Hello ~n~"), msbtFile: "gtaiv/MAIN" };
    const issues = detectIssues(entry, "~g~ مرحبا ~n~");
    const categories = issues.map(issue => issue.category);

    expect(categories).toContain("gtaiv_runtime_token_mismatch");
    expect(categories).not.toContain("technical_mismatch");
    expect(categories).not.toContain("tag_order_mismatch");
    expect(categories).not.toContain("missing_rlm_isolation");
  });

  it("accepts matching GTA IV tokens and identifies missing or lone tokens as critical", () => {
    const entry = { ...makeEntry("~r~ Hello ~n~"), msbtFile: "gtaiv/MAIN" };
    expect(detectIssues(entry, "~r~ مرحبا ~n~").map(issue => issue.category))
      .not.toContain("gtaiv_runtime_token_mismatch");

    const missing = detectIssues(entry, "~r~ مرحبا").find(issue => issue.category === "gtaiv_runtime_token_mismatch");
    expect(missing?.severity).toBe("critical");
    expect(missing?.message).toContain("عدد رموز وقت التشغيل تغير");

    const lone = detectIssues({ ...makeEntry("Hello"), msbtFile: "gtaiv/MAIN" }, "مرحبا ~")
      .find(issue => issue.category === "gtaiv_runtime_token_mismatch");
    expect(lone?.message).toContain("رمز ~ منفرد");
  });
});
