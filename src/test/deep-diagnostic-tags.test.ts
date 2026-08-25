import { describe, expect, it } from "vitest";
import { detectIssues } from "@/components/editor/DeepDiagnosticPanel";
import type { ExtractedEntry } from "@/components/editor/types";
import { repairGtaIvDollarAmountSequence } from "@/lib/gtaiv/gxt-format";

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

  it("flags a GTA IV ~n~ that has not been expanded to an editor line", () => {
    const entry = { ...makeEntry("Hello ~n~ world"), msbtFile: "gtaiv/MAIN" };

    expect(detectIssues(entry, "مرحبا ~n~ بالعالم").map(issue => issue.category))
      .toContain("gtaiv_line_break_display");
    expect(detectIssues(entry, "مرحبا ~n~\nبالعالم").map(issue => issue.category))
      .not.toContain("gtaiv_line_break_display");
  });

  it("accepts matching GTA IV tokens and identifies missing or lone tokens as critical", () => {
    const entry = { ...makeEntry("~r~ Hello ~n~"), msbtFile: "gtaiv/MAIN" };
    expect(detectIssues(entry, "~r~ مرحبا ~n~").map(issue => issue.category))
      .not.toContain("gtaiv_runtime_token_mismatch");

    const missing = detectIssues(entry, "~r~ مرحبا").find(issue => issue.category === "gtaiv_runtime_token_mismatch");
    expect(missing?.severity).toBe("critical");
    expect(missing?.message).toMatch(/عدد رموز وقت التشغيل تغير|ترتيب أو قيمة رمز وقت التشغيل تغيرت/);

    const lone = detectIssues({ ...makeEntry("Hello"), msbtFile: "gtaiv/MAIN" }, "مرحبا ~")
      .find(issue => issue.category === "gtaiv_runtime_token_mismatch");
    expect(lone?.message).toContain("رمز ~ منفرد");
  });

  it("detects changed or reordered GTA IV dollar amounts without generic dollar-variable diagnostics", () => {
    const entry = { ...makeEntry("Pay $100 then $20m"), msbtFile: "gtaiv/MAIN" };
    expect(detectIssues(entry, "ادفع $100 ثم $20m").map(issue => issue.category))
      .not.toContain("gtaiv_dollar_amount_mismatch");

    const changed = detectIssues(entry, "ادفع $200 ثم $20m");
    const changedAmount = changed.find(issue => issue.category === "gtaiv_dollar_amount_mismatch");
    expect(changedAmount?.severity).toBe("critical");
    expect(changed.map(issue => issue.category)).not.toContain("missing_vars");
    expect(changed.map(issue => issue.category)).not.toContain("corrupted_vars");

    const reordered = detectIssues(entry, "ادفع $20m ثم $100")
      .find(issue => issue.category === "gtaiv_dollar_amount_mismatch");
    expect(reordered?.message).toContain("ترتيب");
  });

  it("surfaces equivalent GTA IV dollar spellings for safe canonical repair", () => {
    const entry = { ...makeEntry("Pay $700"), msbtFile: "gtaiv/MAIN" };
    const equivalent = detectIssues(entry, "ادفع ٧٠٠ دولار")
      .find(issue => issue.category === "gtaiv_dollar_amount_mismatch");
    expect(equivalent?.severity).toBe("critical");
    expect(equivalent?.message).toContain("صيغة");
    expect(repairGtaIvDollarAmountSequence(entry.original, "ادفع ٧٠٠ دولار"))
      .toMatchObject({ text: "ادفع $700", changed: true, safe: true });

    const wrongValue = detectIssues(entry, "ادفع ٧٠١ دولار")
      .find(issue => issue.category === "gtaiv_dollar_amount_mismatch");
    expect(wrongValue?.severity).toBe("critical");
    expect(repairGtaIvDollarAmountSequence(entry.original, "ادفع ٧٠١ دولار"))
      .toMatchObject({ text: "ادفع ٧٠١ دولار", changed: false, safe: false });
  });

  it("surfaces an explicit Arabic million wording for safe GTA IV canonical repair", () => {
    const entry = { ...makeEntry("Prize: $10m"), msbtFile: "gtaiv/MAIN" };
    const equivalent = detectIssues(entry, "الجائزة: 10 ملايين دولار")
      .find(issue => issue.category === "gtaiv_dollar_amount_mismatch");
    expect(equivalent?.severity).toBe("critical");
    expect(equivalent?.message).toContain("صيغة");
    expect(repairGtaIvDollarAmountSequence(entry.original, "الجائزة: 10 ملايين دولار"))
      .toMatchObject({ text: "الجائزة: $10m", changed: true, safe: true });

    expect(repairGtaIvDollarAmountSequence(entry.original, "الجائزة: 11 ملايين دولار"))
      .toMatchObject({ text: "الجائزة: 11 ملايين دولار", changed: false, safe: false });
  });
});
