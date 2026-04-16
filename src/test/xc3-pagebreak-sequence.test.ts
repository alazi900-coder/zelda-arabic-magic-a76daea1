import { describe, expect, it } from "vitest";
import { repairTranslationTagsForBuild, checkTagSequenceMatch } from "@/lib/xc3-build-tag-guard";

describe("XC3 PageBreak + XENO:n + XENO:wait sequence integrity", () => {
  // Real text from the Discord report screenshot — uses real \n (newline), not literal "\\n"
  const ORIGINAL =
    "Hello there.[XENO:wait wait=key ][System:PageBreak ]Hmm, what should I make for[XENO:n ]\ndinner? Such a tough choice.[XENO:wait wait=key ][System:PageBreak ]Maybe cabbage parcels?[XENO:n ]\nThey're my speciality, you know![XENO:wait wait=key ][XENO:del del=this ]";

  it("detects when [System:PageBreak] is moved out of order in translation", () => {
    const badTranslation =
      "مرحبًا.[XENO:wait wait=key ]همم، ماذا أُحضّر[XENO:n ]\nللعشاء؟[System:PageBreak ] خيار صعب.[XENO:wait wait=key ]ربما لفائف ملفوف؟[System:PageBreak ][XENO:n ]\nإنها تخصصي، كما تعلم![XENO:wait wait=key ][XENO:del del=this ]";

    const sequenceOk = checkTagSequenceMatch(ORIGINAL, badTranslation);
    expect(sequenceOk).toBe(false);
  });

  it("repair fn restores sequence for shuffled PageBreak/XENO:n/XENO:wait", () => {
    const badTranslation =
      "مرحبًا.[XENO:wait wait=key ]همم، ماذا أُحضّر[XENO:n ]\nللعشاء؟[System:PageBreak ] خيار صعب.[XENO:wait wait=key ]ربما لفائف ملفوف؟[System:PageBreak ][XENO:n ]\nإنها تخصصي، كما تعلم![XENO:wait wait=key ][XENO:del del=this ]";

    const result = repairTranslationTagsForBuild(ORIGINAL, badTranslation);
    expect(result.exactTagMatch).toBe(true);
    expect(result.sequenceMatch).toBe(true);
    expect(result.missingClosingTags).toBe(false);
    expect(result.missingControlOrPua).toBe(false);
  });

  it("auto-restores missing PageBreak/XENO:n tags from original", () => {
    const badTranslation =
      "مرحبًا.[XENO:wait wait=key ]همم، ماذا أُحضّر للعشاء؟[XENO:wait wait=key ]ربما لفائف ملفوف؟[XENO:wait wait=key ][XENO:del del=this ]";
    const result = repairTranslationTagsForBuild(ORIGINAL, badTranslation);
    expect(result.exactTagMatch).toBe(true);
    expect(result.text).toContain("[System:PageBreak ]");
    expect(result.text).toContain("[XENO:n ]");
  });

  it("preserves [XENO:n ] + newline adjacency after reorder", () => {
    const badTranslation =
      "مرحبًا.[XENO:wait wait=key ]همم[XENO:n ]\nللعشاء؟[System:PageBreak ] صعب.[XENO:wait wait=key ]ملفوف؟[System:PageBreak ][XENO:n ]\nتخصصي![XENO:wait wait=key ][XENO:del del=this ]";

    const result = repairTranslationTagsForBuild(ORIGINAL, badTranslation);
    expect(result.exactTagMatch).toBe(true);
    // Every [XENO:n ] in the result must still be followed by \n (newline char)
    const xenoMatches = [...result.text.matchAll(/\[XENO:n\s*\]([\s\S]?)/g)];
    expect(xenoMatches.length).toBeGreaterThan(0);
    for (const m of xenoMatches) {
      expect(m[1]).toBe("\n");
    }
  });

  it("preserves [XENO:n ]\\n even when reorderTagsToMatchOriginal triggers", () => {
    // Translation where XENO:n appears BEFORE PageBreak (wrong order) and \n is intact
    const badTranslation =
      "مرحبًا.[XENO:n ]\n[System:PageBreak ][XENO:wait wait=key ]همم[XENO:n ]\n[System:PageBreak ][XENO:wait wait=key ]ملفوف[XENO:wait wait=key ][XENO:del del=this ]";

    const result = repairTranslationTagsForBuild(ORIGINAL, badTranslation);
    // XENO:n must always have \n following it after reorder
    const allXenoNIdx = [...result.text.matchAll(/\[XENO:n\s*\]/g)].map(m => m.index! + m[0].length);
    for (const idx of allXenoNIdx) {
      expect(result.text[idx]).toBe("\n");
    }
  });
});
