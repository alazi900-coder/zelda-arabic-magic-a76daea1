import { describe, it, expect } from "vitest";
import { extractTags, categoryMatches, formatReport, type ExtractorEntry } from "@/lib/tag-extractor";

describe("tag-extractor: paired_tags aggregation", () => {
  it("aggregates occurrences of the same tag pair skeleton even when inner text differs each time", async () => {
    const entries: ExtractorEntry[] = [
      { msbtFile: "a.msbt", original: "[System:Ruby]Aegis[/System:Ruby]" },
      { msbtFile: "b.msbt", original: "[System:Ruby]Alrest[/System:Ruby]" },
      { msbtFile: "c.msbt", original: "[System:Ruby]Mechonis[/System:Ruby]" },
    ];
    const report = await extractTags(entries);
    const map = report.categories.paired_tags;
    expect(map.size).toBe(1);
    const [, occ] = [...map.entries()][0];
    expect(occ.count).toBe(3);
    expect(occ.files.size).toBe(3);
  });
});

describe("tag-extractor: cross-category double counting", () => {
  it("does not count the same paired-tag span again under bracket_tags", async () => {
    const entries: ExtractorEntry[] = [
      { msbtFile: "a.msbt", original: "[System:FAT]hi[/System:FAT]" },
    ];
    const report = await extractTags(entries);
    expect(report.categories.paired_tags.size).toBe(1);
    expect(report.categories.bracket_tags.size).toBe(0);
  });

  it("still reports a standalone bracket tag that is NOT part of a pair", async () => {
    const entries: ExtractorEntry[] = [
      { msbtFile: "a.msbt", original: "Hello [XENO:1] world" },
    ];
    const report = await extractTags(entries);
    expect(report.categories.paired_tags.size).toBe(0);
    expect(report.categories.bracket_tags.size).toBe(1);
  });

  it("does not report standalone uppercase words as technical tags", async () => {
    const entries: ExtractorEntry[] = [
      { msbtFile: "a.msbt", original: "NEW GAME — EXP HAS INCREASED" },
    ];
    const report = await extractTags(entries);
    expect(Object.keys(report.categories)).not.toContain("uppercase_tokens");
    expect(Object.values(report.categories).every((category) => category.size === 0)).toBe(true);
  });

  it("keeps a nested HTML tag visible even when it is inside a paired bracket tag", async () => {
    const entries: ExtractorEntry[] = [
      { msbtFile: "a.msbt", original: "[System:Ruby]<h>Hero</h>[/System:Ruby]" },
    ];
    const report = await extractTags(entries);
    expect(report.categories.paired_tags.size).toBe(1);
    expect([...report.categories.html_like.keys()]).toEqual(["<h>", "</h>"]);
  });
});

describe("tag-extractor: precision and report context", () => {
  it("does not treat prose enclosed in braces as a runtime variable", async () => {
    const entries: ExtractorEntry[] = [
      { msbtFile: "a.msbt", original: "Narration { this is a note, not a variable }" },
    ];
    const report = await extractTags(entries);
    expect(report.categories.curly_vars.size).toBe(0);
  });

  it("reports #0..#5 controls and includes their exact location in the export", async () => {
    const entries: ExtractorEntry[] = [
      { msbtFile: "menu.msbt", original: "Before #3 After" },
    ];
    const report = await extractTags(entries);
    const occurrence = report.categories.hash_controls.get("#3");
    expect(occurrence?.count).toBe(1);
    expect(occurrence?.examples[0]).toEqual({ file: "menu.msbt", context: "Before ⟦#3⟧ After" });
    expect(formatReport(report)).toContain("سبب الحماية");
    expect(formatReport(report)).toContain("context (menu.msbt): Before ⟦#3⟧ After");
    expect(formatReport(report)).not.toContain("Xenoblade Technical Tag Report");
  });
});

describe("tag-extractor: pua_chars range", () => {
  it("matches U+E000..U+E0FF (the actual protected range), matching xc3-tag-protection.ts", async () => {
    const inProtectedRange = String.fromCodePoint(0xe050);
    const entries: ExtractorEntry[] = [
      { msbtFile: "a.msbt", original: `icon ${inProtectedRange} here` },
    ];
    const report = await extractTags(entries);
    expect(report.categories.pua_chars.size).toBe(1);
  });

  it("does NOT match PUA-A characters above U+E0FF (outside the real protection range)", async () => {
    const outsideRange = String.fromCodePoint(0xf000);
    const entries: ExtractorEntry[] = [
      { msbtFile: "a.msbt", original: `icon ${outsideRange} here` },
    ];
    const report = await extractTags(entries);
    expect(report.categories.pua_chars.size).toBe(0);
  });
});

describe("tag-extractor: escape_seq ambiguity", () => {
  it("does not swallow a literal newline-escape followed by digits as a bogus hex escape", async () => {
    const entries: ExtractorEntry[] = [
      { msbtFile: "a.msbt", original: "line1\\n12line2" },
    ];
    const report = await extractTags(entries);
    const tokens = [...report.categories.escape_seq.keys()];
    expect(tokens).toContain("\\n");
    expect(tokens).not.toContain("\\n12");
  });

  it("still recognizes real hex escapes \\xNN and \\uNNNN", async () => {
    const entries: ExtractorEntry[] = [
      { msbtFile: "a.msbt", original: "\\x1B and \\u00E9" },
    ];
    const report = await extractTags(entries);
    const tokens = [...report.categories.escape_seq.keys()];
    expect(tokens).toContain("\\x1B");
    expect(tokens).toContain("\\u00E9");
  });
});

describe("tag-extractor: categoryMatches (used to wire filter chips to the editor)", () => {
  it("returns true only for entries actually matching the given category", () => {
    expect(categoryMatches("percent_vars", "You have %s items")).toBe(true);
    expect(categoryMatches("percent_vars", "You have items")).toBe(false);
    expect(categoryMatches("bracket_tags", "[XENO:1] hi")).toBe(true);
    expect(categoryMatches("dollar_vars", "hi $player")).toBe(true);
    expect(categoryMatches("hash_controls", "Break #5 now")).toBe(true);
  });

  it("is safe to call repeatedly (global-regex lastIndex doesn't leak state across calls)", () => {
    expect(categoryMatches("percent_vars", "a %s b")).toBe(true);
    expect(categoryMatches("percent_vars", "a %s b")).toBe(true);
    expect(categoryMatches("percent_vars", "a %s b")).toBe(true);
  });
});

describe("tag-extractor: basic sanity", () => {
  it("scans a mixed entry and finds one hit per category present", async () => {
    const entries: ExtractorEntry[] = [
      {
        msbtFile: "sys.msbt",
        original: "Hi {player}, you got %d gold. See <b>bold</b>. Cost: $5. \\x1B reset. FAT stat.",
      },
    ];
    const report = await extractTags(entries);
    expect(report.categories.curly_vars.size).toBe(1);
    expect(report.categories.percent_vars.size).toBe(1);
    expect(report.categories.html_like.size).toBeGreaterThan(0);
    expect(report.categories.dollar_vars.size).toBe(1);
    expect(report.categories.escape_seq.size).toBe(1);
  });

  it("never throws on empty/undefined originals and reports scannedEntries correctly", async () => {
    const entries: ExtractorEntry[] = [
      { msbtFile: "a.msbt", original: "" },
      { msbtFile: "b.msbt", original: "plain text" },
    ];
    const report = await extractTags(entries);
    expect(report.totalEntries).toBe(2);
    expect(report.scannedEntries).toBe(1);
  });
});
