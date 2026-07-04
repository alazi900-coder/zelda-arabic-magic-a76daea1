import { describe, it, expect } from "vitest";
import { hasRisenTags, extractRisenTags, diffRisenTags, restoreRisenTags } from "@/lib/risen-tag-guard";

describe("extractRisenTags / hasRisenTags", () => {
  it("detects bracket button tags like <Exit> and <MeleeWeapon>", () => {
    expect(extractRisenTags("Press <Exit> to leave")).toEqual(["<Exit>"]);
    expect(hasRisenTags("Equip your <MeleeWeapon> now")).toBe(true);
  });

  it("detects $(name)-style parenthesized variables", () => {
    expect(extractRisenTags("Hello $(name), you have $(value) gold")).toEqual(["$(name)", "$(value)"]);
  });

  it("detects bare engine tokens (XXX, SGN, SGT, SGPT, SGL) as whole words only", () => {
    expect(extractRisenTags("Save slot: SGN")).toEqual(["SGN"]);
    expect(extractRisenTags("XXX SGT SGPT SGL")).toEqual(["XXX", "SGT", "SGPT", "SGL"]);
  });

  it("does NOT treat a plain word like EXIT (no brackets, not in the bare-token list) as a tag", () => {
    expect(hasRisenTags("Please EXIT the building before it collapses")).toBe(false);
    expect(hasRisenTags("You should exit now")).toBe(false);
  });

  it("detects MM/HH/DD only in the known duration-template context", () => {
    expect(extractRisenTags("MM minutes, HH hours, DD days")).toEqual(["MM", "HH", "DD"]);
  });

  it("does not match MM/HH/DD outside that context (avoids false positives in dialogue)", () => {
    expect(hasRisenTags("MM is a mysterious merchant")).toBe(false);
    expect(hasRisenTags("HH? What kind of name is that")).toBe(false);
  });
});

describe("diffRisenTags", () => {
  it("flags a missing $(name) tag", () => {
    const diff = diffRisenTags("Hello $(name), welcome", "مرحباً، أهلاً بك");
    expect(diff.exactTagMatch).toBe(false);
    expect(diff.missingTags).toEqual(["$(name)"]);
  });

  it("reports exact match when the tag is preserved as-is", () => {
    const diff = diffRisenTags("Hello $(name)", "مرحباً $(name)");
    expect(diff.exactTagMatch).toBe(true);
    expect(diff.missingTags).toEqual([]);
  });
});

describe("restoreRisenTags — safe append only, never guesses/deletes", () => {
  it("appends a missing $(name) tag and marks needsReview", () => {
    const result = restoreRisenTags("Hello $(name)", "مرحباً");
    expect(result.changed).toBe(true);
    expect(result.needsReview).toBe(true);
    expect(result.text).toContain("$(name)");
    expect(result.text.startsWith("مرحباً")).toBe(true);
  });

  it("when SGN was translated instead of preserved, appends it and flags for review without deleting the translated word", () => {
    // Real observed case: <Exit> → "خروج" (tag translated instead of kept).
    // Same mechanics apply to a bare token like SGN standing in for translated text.
    const original = "SGN";
    const translation = "تم الحفظ"; // translator wrote a full sentence instead of keeping SGN
    const result = restoreRisenTags(original, translation);
    expect(result.changed).toBe(true);
    expect(result.needsReview).toBe(true);
    // Must NOT attempt to locate/delete "تم الحفظ" — just append the tag.
    expect(result.text).toBe("تم الحفظ SGN");
  });

  it("does nothing when no tag is missing", () => {
    const result = restoreRisenTags("Press <Exit>", "اضغط <Exit>");
    expect(result.changed).toBe(false);
    expect(result.needsReview).toBe(false);
    expect(result.text).toBe("اضغط <Exit>");
  });
});
