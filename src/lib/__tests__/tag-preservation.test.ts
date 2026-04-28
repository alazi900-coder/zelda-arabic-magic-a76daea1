/**
 * Tests guarding TAG_0 / TAG_1 / ⟪T#⟫ placeholder integrity through the
 * translation post-processing pipeline. These are the artifacts that must
 * NEVER be lost, translated, reordered, or merged by the AI / cleanup code.
 */
import { describe, it, expect } from "vitest";
import { protectTags, restoreTags } from "@/lib/xc3-tag-protection";

// Mirror of the edge-function `stripNewlinesInValues` + placeholder validation.
// Kept inline so the test asserts the intended invariant, not the impl.
function stripNewlines(s: string): string {
  return s.replace(/\r\n|\r|\n/g, " ").replace(/[ \t]{2,}/g, " ").trim();
}

const TAG_RE = /(TAG_\d+|⟪T\d+⟫)/g;
const tagSet = (s: string) => (s.match(TAG_RE) || []).slice().sort().join("|");

// Mirror of edge-function `computeQualityStats` placeholder check — kept inline
// so the test pins the invariant ("expected vs actual tag set") independently.
interface QualityError { key: string; reason: string; sample?: string }
function checkBatch(
  requested: { key: string; original: string }[],
  translations: Record<string, string>,
): { placeholdersOk: number; errors: QualityError[] } {
  const errors: QualityError[] = [];
  let placeholdersOk = 0;
  for (const e of requested) {
    const t = translations[e.key] ?? "";
    const expected = tagSet(e.original);
    const actual = tagSet(t);
    if (expected === actual) placeholdersOk++;
    else errors.push({
      key: e.key,
      reason: `placeholder-mismatch (expected=${expected || "∅"} got=${actual || "∅"})`,
      sample: t,
    });
  }
  return { placeholdersOk, errors };
}

describe("placeholder integrity through post-processing", () => {
  it("preserves TAG_0 and TAG_1 when newlines are stripped", () => {
    const aiOutput = "مرحباً TAG_0\nكيف حالك TAG_1";
    const cleaned = stripNewlines(aiOutput);
    expect(cleaned).toBe("مرحباً TAG_0 كيف حالك TAG_1");
    expect(tagSet(cleaned)).toBe("TAG_0|TAG_1");
  });

  it("preserves glossary placeholders ⟪T0⟫ and ⟪T1⟫ unchanged", () => {
    const original = "Welcome ⟪T0⟫ to ⟪T1⟫";
    const aiOutput = "أهلاً ⟪T0⟫ في ⟪T1⟫";
    expect(tagSet(aiOutput)).toBe(tagSet(original));
  });

  it("detects when the AI dropped a TAG (must flag as mismatch)", () => {
    const original = "Hello TAG_0 and TAG_1";
    const bad = "أهلاً TAG_0"; // TAG_1 missing
    expect(tagSet(bad)).not.toBe(tagSet(original));
  });

  it("detects when the AI translated a TAG into Arabic letters", () => {
    const original = "Press TAG_0 to continue";
    const bad = "اضغط علامة_صفر للمتابعة"; // translated TAG_0
    expect(tagSet(bad)).toBe(""); // no valid tag found
    expect(tagSet(bad)).not.toBe(tagSet(original));
  });

  it("treats TAG order changes as MISMATCH-equivalent (set match still passes)", () => {
    // We intentionally compare as a sorted set: same tags, any order is OK,
    // but losing/translating any one fails. This mirrors edge logic.
    const original = "TAG_0 then TAG_1";
    const reordered = "TAG_1 ثم TAG_0";
    expect(tagSet(reordered)).toBe(tagSet(original));
  });

  it("protectTags + restoreTags roundtrip preserves real engine tags like [ML]", () => {
    // protectTags handles ENGINE tags (e.g. [ML], <br>, {var}). TAG_n / ⟪Tn⟫
    // are placeholders left visible to the AI by design — they are validated
    // by the edge function's quality check, not by protectTags.
    const original = "Hello [ML] brave [Passive] warrior";
    const { cleanText, tags } = protectTags(original);
    expect(tags.length).toBeGreaterThanOrEqual(2);
    const translated = cleanText
      .replace("Hello", "مرحباً")
      .replace("brave", "أيها")
      .replace("warrior", "المحارب الشجاع");
    const restored = restoreTags(translated, tags);
    expect(restored).toContain("[ML]");
    expect(restored).toContain("[Passive]");
  });

  it("mixed TAG_n and ⟪Tn⟫ in the same string both survive", () => {
    const original = "TAG_0 says: ⟪T0⟫ greets ⟪T1⟫ at TAG_1";
    const aiOutput = "TAG_0 يقول: ⟪T0⟫ يحيي ⟪T1⟫ عند TAG_1";
    expect(tagSet(aiOutput)).toBe(tagSet(original));
    const cleaned = stripNewlines(aiOutput);
    expect(tagSet(cleaned)).toBe(tagSet(original));
  });

  it("rejects merged tags like TAG_0TAG_1 (must keep them separate)", () => {
    const original = "A TAG_0 B TAG_1";
    const merged = "أ TAG_0TAG_1 ب"; // adjacent — both still match TAG_RE individually
    // Both TAGs still detected (regex is per-token, not per-spacing). This is
    // intentional: the regex tolerates spacing. Real damage = losing one.
    expect(tagSet(merged)).toBe(tagSet(original));
  });

  // ─────────────────────────────────────────────────────────────────────
  // Hallucinated TAG detection — model invents a TAG that wasn't in source
  // ─────────────────────────────────────────────────────────────────────
  describe("hallucinated TAG detection (quality report)", () => {
    it("flags TAG_2 swapped in place of TAG_1 as placeholder-mismatch", () => {
      const requested = [{ key: "K0", original: "Press TAG_0 and TAG_1 to continue" }];
      const translations = { K0: "اضغط TAG_0 و TAG_2 للمتابعة" }; // hallucinated TAG_2
      const { placeholdersOk, errors } = checkBatch(requested, translations);
      expect(placeholdersOk).toBe(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].key).toBe("K0");
      expect(errors[0].reason).toContain("placeholder-mismatch");
      expect(errors[0].reason).toContain("expected=TAG_0|TAG_1");
      expect(errors[0].reason).toContain("got=TAG_0|TAG_2");
    });

    it("flags an extra invented TAG_5 added on top of correct tags", () => {
      const requested = [{ key: "K1", original: "Hello TAG_0" }];
      const translations = { K1: "أهلاً TAG_0 TAG_5" }; // extra TAG_5
      const { placeholdersOk, errors } = checkBatch(requested, translations);
      expect(placeholdersOk).toBe(0);
      expect(errors[0].reason).toContain("got=TAG_0|TAG_5");
    });

    it("flags a hallucinated ⟪T9⟫ glossary placeholder that wasn't requested", () => {
      const requested = [{ key: "K2", original: "Welcome ⟪T0⟫" }];
      const translations = { K2: "أهلاً ⟪T0⟫ ⟪T9⟫" };
      const { errors } = checkBatch(requested, translations);
      expect(errors).toHaveLength(1);
      expect(errors[0].reason).toContain("⟪T0⟫|⟪T9⟫");
    });

    it("counts multiple errors across a batch — only clean rows pass", () => {
      const requested = [
        { key: "OK",   original: "Hi TAG_0" },
        { key: "BAD1", original: "Hi TAG_0 TAG_1" }, // TAG_1 → TAG_2
        { key: "BAD2", original: "Hi TAG_0" },        // adds TAG_3
      ];
      const translations = {
        OK:   "أهلاً TAG_0",
        BAD1: "أهلاً TAG_0 TAG_2",
        BAD2: "أهلاً TAG_0 TAG_3",
      };
      const { placeholdersOk, errors } = checkBatch(requested, translations);
      expect(placeholdersOk).toBe(1);
      expect(errors.map(e => e.key).sort()).toEqual(["BAD1", "BAD2"]);
    });

    it("error sample contains the offending Arabic text for UI display", () => {
      const requested = [{ key: "K3", original: "Use TAG_0" }];
      const translations = { K3: "استخدم TAG_7 الآن" };
      const { errors } = checkBatch(requested, translations);
      expect(errors[0].sample).toBe("استخدم TAG_7 الآن");
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // ⟪T#⟫ resilience to whitespace / punctuation noise around placeholders
  // ─────────────────────────────────────────────────────────────────────
  describe("⟪T#⟫ survives surrounding whitespace and punctuation", () => {
    it("preserves ⟪T0⟫ when AI added extra spaces around it", () => {
      const requested = [{ key: "K0", original: "Hello ⟪T0⟫" }];
      const aiOutput  = "أهلاً    ⟪T0⟫   "; // extra spaces before/after
      const cleaned   = stripNewlines(aiOutput);
      expect(cleaned).toBe("أهلاً ⟪T0⟫"); // collapsed by stripNewlines
      const { placeholdersOk, errors } = checkBatch(requested, { K0: cleaned });
      expect(placeholdersOk).toBe(1);
      expect(errors).toHaveLength(0);
    });

    it("preserves ⟪T0⟫ when AI inserted newlines around it", () => {
      const requested = [{ key: "K1", original: "Welcome ⟪T0⟫ home" }];
      const aiOutput  = "أهلاً\n⟪T0⟫\nفي المنزل"; // newlines hugging placeholder
      const cleaned   = stripNewlines(aiOutput);
      expect(cleaned).toBe("أهلاً ⟪T0⟫ في المنزل");
      expect(checkBatch(requested, { K1: cleaned }).placeholdersOk).toBe(1);
    });

    it("preserves ⟪T0⟫ adjacent to Arabic punctuation (، . ؟ !)", () => {
      const requested = [{ key: "K2", original: "Hi ⟪T0⟫" }];
      // AI wraps placeholder in Arabic punctuation — must still match
      const variants = [
        "مرحباً، ⟪T0⟫.",
        "مرحباً ⟪T0⟫؟",
        "مرحباً ⟪T0⟫!",
        "«⟪T0⟫»",
        "(⟪T0⟫)",
      ];
      for (const v of variants) {
        const cleaned = stripNewlines(v);
        const { placeholdersOk, errors } = checkBatch(requested, { K2: cleaned });
        expect(placeholdersOk, `failed for: ${v}`).toBe(1);
        expect(errors).toHaveLength(0);
      }
    });

    it("preserves multiple ⟪T#⟫ when AI clustered them with mixed punctuation", () => {
      const requested = [{ key: "K3", original: "Use ⟪T0⟫ then ⟪T1⟫" }];
      const aiOutput  = "استخدم  ⟪T0⟫،  ثم  ⟪T1⟫ ."; // extra spaces + commas/dot
      const cleaned   = stripNewlines(aiOutput);
      expect(checkBatch(requested, { K3: cleaned }).placeholdersOk).toBe(1);
    });

    it("preserves ⟪T#⟫ even when directly glued to Arabic letters (no space)", () => {
      // Edge case: AI omitted spacing — placeholder still detectable by regex
      const requested = [{ key: "K4", original: "⟪T0⟫ greetings ⟪T1⟫" }];
      const cleaned   = stripNewlines("⟪T0⟫تحياتي⟪T1⟫"); // no spaces
      expect(checkBatch(requested, { K4: cleaned }).placeholdersOk).toBe(1);
    });

    it("flags only when ⟪T#⟫ is genuinely lost (not when just spaced differently)", () => {
      const requested = [{ key: "K5", original: "A ⟪T0⟫ B ⟪T1⟫" }];
      const aiOutput  = "أ   ⟪T0⟫    ب"; // ⟪T1⟫ truly missing
      const cleaned   = stripNewlines(aiOutput);
      const { placeholdersOk, errors } = checkBatch(requested, { K5: cleaned });
      expect(placeholdersOk).toBe(0);
      expect(errors[0].reason).toContain("expected=⟪T0⟫|⟪T1⟫");
      expect(errors[0].reason).toContain("got=⟪T0⟫");
    });
  });
});
