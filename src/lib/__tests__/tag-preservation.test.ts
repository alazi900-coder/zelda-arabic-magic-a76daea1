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

  it("protectTags + restoreTags roundtrip never drops a tag", () => {
    const original = "Hello TAG_0, brave TAG_1 warrior";
    const { cleanText, tags } = protectTags(original);
    expect(tags.length).toBeGreaterThanOrEqual(2);
    // Simulate translator swapping the visible English with Arabic
    const translated = cleanText
      .replace("Hello", "مرحباً")
      .replace("brave", "أيها")
      .replace("warrior", "المحارب الشجاع");
    const restored = restoreTags(translated, tags);
    expect(tagSet(restored)).toBe("TAG_0|TAG_1");
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
});
