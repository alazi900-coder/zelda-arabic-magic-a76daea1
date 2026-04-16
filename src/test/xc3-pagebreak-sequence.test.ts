import { describe, expect, it } from "vitest";
import { repairTranslationTagsForBuild, checkTagSequenceMatch } from "@/lib/xc3-build-tag-guard";

describe("XC3 PageBreak + XENO:n + XENO:wait sequence integrity", () => {
  // The exact text from the Discord report screenshot (entry $id: 1, style: 126)
  const ORIGINAL =
    "Hello there.[XENO:wait wait=key ][System:PageBreak ]Hmm, what should I make for[XENO:n ]\\ndinner? Such a tough choice.[XENO:wait wait=key ][System:PageBreak ]Maybe cabbage parcels?[XENO:n ]\\nThey're my speciality, you know![XENO:wait wait=key ][XENO:del del=this ]";

  it("detects when [System:PageBreak] is moved out of order in translation", () => {
    // Translation with PageBreak placed AFTER the dinner question instead of before
    const badTranslation =
      "مرحبًا.[XENO:wait wait=key ]همم، ماذا أُحضّر[XENO:n ]\\nللعشاء؟[System:PageBreak ] خيار صعب.[XENO:wait wait=key ]ربما لفائف ملفوف؟[System:PageBreak ][XENO:n ]\\nإنها تخصصي، كما تعلم![XENO:wait wait=key ][XENO:del del=this ]";

    const sequenceOk = checkTagSequenceMatch(ORIGINAL, badTranslation);
    expect(sequenceOk).toBe(false);
  });

  it("repair fn restores sequence for shuffled PageBreak/XENO:n/XENO:wait", () => {
    const badTranslation =
      "مرحبًا.[XENO:wait wait=key ]همم، ماذا أُحضّر[XENO:n ]\\nللعشاء؟[System:PageBreak ] خيار صعب.[XENO:wait wait=key ]ربما لفائف ملفوف؟[System:PageBreak ][XENO:n ]\\nإنها تخصصي، كما تعلم![XENO:wait wait=key ][XENO:del del=this ]";

    const result = repairTranslationTagsForBuild(ORIGINAL, badTranslation);
    expect(result.exactTagMatch).toBe(true);
    expect(result.sequenceMatch).toBe(true);
    expect(result.missingClosingTags).toBe(false);
    expect(result.missingControlOrPua).toBe(false);
  });

  it("fails (multiset mismatch) when PageBreak is missing entirely", () => {
    const badTranslation =
      "مرحبًا.[XENO:wait wait=key ]همم، ماذا أُحضّر للعشاء؟[XENO:wait wait=key ]ربما لفائف ملفوف؟[XENO:wait wait=key ][XENO:del del=this ]";
    const result = repairTranslationTagsForBuild(ORIGINAL, badTranslation);
    // PageBreak and XENO:n are missing — should NOT pass exactTagMatch
    expect(result.exactTagMatch).toBe(false);
  });

  it("preserves [XENO:n ]\\n adjacency after reorder (no XENO:n stripped from newline)", () => {
    const badTranslation =
      "مرحبًا.[XENO:wait wait=key ]همم[XENO:n ]\\nللعشاء؟[System:PageBreak ] صعب.[XENO:wait wait=key ]ملفوف؟[System:PageBreak ][XENO:n ]\\nتخصصي![XENO:wait wait=key ][XENO:del del=this ]";

    const result = repairTranslationTagsForBuild(ORIGINAL, badTranslation);
    expect(result.exactTagMatch).toBe(true);
    // Every [XENO:n ] in the result must still be followed by \n
    const xenoMatches = [...result.text.matchAll(/\[XENO:n\s*\]([\s\S]?)/g)];
    for (const m of xenoMatches) {
      expect(m[1]).toBe("\\");
    }
  });
});
