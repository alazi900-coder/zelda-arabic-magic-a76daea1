import { describe, it, expect } from "vitest";
import { countMissingTagNewlines, fixTagNewlines } from "@/lib/tag-newline-anchor";
import { detectIssues } from "@/lib/diagnostic-detect";

/** The line from the screenshot, as the scanner reads it out of the ROM. */
const EMERALD =
  "Hiya! Are you maybe…\nA rookie TRAINER?{fb}\nDo you know what POKéMON TRAINERS\n" +
  "do when they reach a new town?{fb}\nThey first check what kind of GYM\nis in the town.";

describe("a line break that belongs right after a tag", () => {
  it("finds the one the translator's line is missing", () => {
    // Five breaks in the original and five in the translation — the count is no
    // help at all. The first {fb} is the one that runs straight on.
    const translation =
      "مرحباً! هل أنت ربما... مدرب\nمبتدئ؟{fb} هل تعرف ماذا يفعل\nمدربو البوكيمون عندما\n" +
      "يصلون إلى مدينة جديدة؟{fb}\nيتحققون أولاً من نوع\nالصالة الموجودة في المدينة.";
    expect(translation.split("\n")).toHaveLength(6);
    expect(EMERALD.split("\n")).toHaveLength(6);
    expect(countMissingTagNewlines(EMERALD, translation)).toBe(1);
  });

  it("puts it back, and starts the new line on a word", () => {
    const translation = "مبتدئ؟{fb} هل تعرف";
    expect(fixTagNewlines("A rookie TRAINER?{fb}\nDo you know", translation)).toBe(
      "مبتدئ؟{fb}\nهل تعرف"
    );
  });

  it("touches nothing else — no rebalancing, no other break moved", () => {
    const original = "one{fb}\ntwo\nthree{fb}\nfour";
    const translation = "واحد{fb} اثنان\nثلاثة{fb}\nأربعة";
    const fixed = fixTagNewlines(original, translation);
    expect(fixed).toBe("واحد{fb}\nاثنان\nثلاثة{fb}\nأربعة");
    // and running it again changes nothing
    expect(fixTagNewlines(original, fixed)).toBe(fixed);
  });

  it("leaves a tag alone when the original does not break after it", () => {
    // 171 of Emerald's 7,241 {fb} codes have no line break behind them.
    const original = "look{fb} at this";
    const translation = "انظر{fb} إلى هذا";
    expect(countMissingTagNewlines(original, translation)).toBe(0);
    expect(fixTagNewlines(original, translation)).toBe(translation);
  });

  it("works on any tag, not only Pokémon's", () => {
    const original = "Take it.[XENO:n ]\nIt is yours.";
    const translation = "خذها.[XENO:n ] إنها لك.";
    expect(countMissingTagNewlines(original, translation)).toBe(1);
    expect(fixTagNewlines(original, translation)).toBe("خذها.[XENO:n ]\nإنها لك.");
  });

  it("ignores tags the translation does not have", () => {
    // A translation whose tags do not line up has a different problem, and the
    // build reports that one. This must not add breaks in the wrong places.
    const original = "a{fb}\nb{fb}\nc";
    const translation = "أ{fb} ب ج";
    expect(countMissingTagNewlines(original, translation)).toBe(1);
    expect(fixTagNewlines(original, translation)).toBe("أ{fb}\nب ج");
  });

  it("does nothing to a line with no tags at all", () => {
    expect(countMissingTagNewlines("one\ntwo", "واحد اثنان")).toBe(0);
    expect(fixTagNewlines("one\ntwo", "واحد اثنان")).toBe("واحد اثنان");
  });
});

describe("the deep diagnostic reports it", () => {
  const entry = { key: "pkm_rom:100", msbtFile: "pkm_rom", index: 100, original: EMERALD };

  it("raises it when the break after a tag is gone", () => {
    const translation =
      "مرحباً! هل أنت ربما... مدرب\nمبتدئ؟{fb} هل تعرف ماذا يفعل\nمدربو البوكيمون عندما\n" +
      "يصلون إلى مدينة جديدة؟{fb}\nيتحققون أولاً من نوع\nالصالة الموجودة في المدينة.";
    const issues = detectIssues(entry, translation);
    expect(issues.find((i) => i.category === "tag_newline_missing")).toBeDefined();
  });

  it("stays quiet once the breaks are where the original put them", () => {
    const translation =
      "مرحباً! هل أنت ربما...\nمدرب مبتدئ؟{fb}\nهل تعرف ماذا يفعل\n" +
      "مدربو البوكيمون؟{fb}\nيتحققون من نوع\nالصالة في المدينة.";
    const issues = detectIssues(entry, translation);
    expect(issues.find((i) => i.category === "tag_newline_missing")).toBeUndefined();
  });
});
