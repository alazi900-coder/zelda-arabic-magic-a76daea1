import { describe, expect, it } from "vitest";
import { repairTranslationTagsForBuild } from "@/lib/xc3-build-tag-guard";

describe("repairTranslationTagsForBuild", () => {
  it("restores 1[XENO:n] before build and marks it safe", () => {
    const result = repairTranslationTagsForBuild(
      "\\[Passive\\] Increases tension by $1 1[XENO:n] when battle starts.",
      "\\[سلبي\\] يزيد التوتر بمقدار $1 عندما تبدأ المعركة.",
    );

    expect(result.text).toContain("\\[Passive\\]");
    expect(result.text).toContain("1[XENO:n]");
    expect(result.exactTagMatch).toBe(true);
    expect(result.missingClosingTags).toBe(false);
    expect(result.missingControlOrPua).toBe(false);
  });

  it("treats 2010[ML:icon ...] as one protected technical unit at build time", () => {
    const result = repairTranslationTagsForBuild(
      "2010[ML:icon icon=copyright] Nintendo",
      "نينتندو",
    );

    expect(result.text).toContain("2010[ML:icon icon=copyright]");
    expect(result.exactTagMatch).toBe(true);
  });

  it("marks invented English tags as unsafe when the original had none", () => {
    const result = repairTranslationTagsForBuild(
      "Hello world",
      "مرحبا [Passive] بالعالم",
    );

    expect(result.exactTagMatch).toBe(false);
  });
  });

  it("fixes دولار1 back to $1", () => {
    const result = repairTranslationTagsForBuild(
      "\\[Passive\\] Increases tension by $1 1[XENO:n] when battle starts.",
      "\\[سلبي\\] يزيد التوتر بمقدار دولار1 عندما تبدأ المعركة.",
    );
    expect(result.text).toContain("$1");
    expect(result.text).not.toContain("دولار");
  });

  it("fixes 1.$ back to $1", () => {
    const result = repairTranslationTagsForBuild(
      "Deals $1 damage",
      "يسبب 1.$ ضرر",
    );
    expect(result.text).toContain("$1");
    expect(result.text).not.toContain("1.$");
  });

  it("fixes $.1 back to $1", () => {
    const result = repairTranslationTagsForBuild(
      "Heals $1 HP",
      "يشفي $.1 نقطة صحة",
    );
    expect(result.text).toContain("$1");
  });

  it("fixes 1 دولار back to $1", () => {
    const result = repairTranslationTagsForBuild(
      "Boosts by $1 percent",
      "يزيد بنسبة 1 دولار بالمئة",
    );
    expect(result.text).toContain("$1");
    expect(result.text).not.toContain("دولار");
  });

  it("does not fix $N when original has no $N vars", () => {
    const result = repairTranslationTagsForBuild(
      "Hello world",
      "مرحبا دولار1 بالعالم",
    );
    expect(result.text).toContain("دولار1");
  });