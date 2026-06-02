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

  it("does NOT inject extra \\n after [XENO:n ] when translator already wrote it", () => {
    const badTranslation =
      "مرحبًا.[XENO:wait wait=key ]همم[XENO:n ]\nللعشاء؟[System:PageBreak ] صعب.[XENO:wait wait=key ]ملفوف؟[System:PageBreak ][XENO:n ]\nتخصصي![XENO:wait wait=key ][XENO:del del=this ]";

    const result = repairTranslationTagsForBuild(ORIGINAL, badTranslation);
    expect(result.exactTagMatch).toBe(true);
    // Same number of newlines as the translator wrote (no forced injection).
    const inputNewlines = (badTranslation.match(/\n/g) || []).length;
    const outputNewlines = (result.text.match(/\n/g) || []).length;
    expect(outputNewlines).toBe(inputNewlines);
  });

  it("does NOT force-add \\n after [XENO:n ] when translator omitted it", () => {
    // Translator deliberately wrote [XENO:n ] with no following \n.
    // The XC3 engine treats [XENO:n ] itself as a hard break, so we must
    // respect the translator's whitespace and not inject a phantom newline
    // (which previously caused empty lines and shifted line order in-game).
    const badTranslation =
      "مرحبًا.[XENO:n ][System:PageBreak ][XENO:wait wait=key ]همم[XENO:n ][System:PageBreak ][XENO:wait wait=key ]ملفوف[XENO:wait wait=key ][XENO:del del=this ]";

    const result = repairTranslationTagsForBuild(ORIGINAL, badTranslation);
    // No \n should have been injected by the build pipeline.
    expect(result.text.includes("\n")).toBe(false);
  });
});
