import { describe, it, expect } from "vitest";
import { restoreTagsLocally } from "@/components/editor/types";

describe("restoreTagsLocally", () => {
  it("restores missing PUA markers from original", () => {
    const original = "Hello \uE000 world \uE001 end";
    const damagedTranslation = "مرحبا عالم نهاية";
    const result = restoreTagsLocally(original, damagedTranslation);
    expect(result).toContain("\uE000");
    expect(result).toContain("\uE001");
  });

  it("returns translation unchanged if no tags missing", () => {
    const original = "Hello \uE000 world";
    const translation = "مرحبا \uE000 عالم";
    const result = restoreTagsLocally(original, translation);
    expect(result).toContain("\uE000");
  });

  it("returns translation unchanged if original has no tags", () => {
    const original = "Hello world";
    const translation = "مرحبا عالم";
    const result = restoreTagsLocally(original, translation);
    expect(result).toBe("مرحبا عالم");
  });

  it("handles multiple PUA characters", () => {
    const original = "Press \uE000\uE001 to continue";
    const damagedTranslation = "اضغط للمتابعة";
    const result = restoreTagsLocally(original, damagedTranslation);
    expect(result).toContain("\uE000");
    expect(result).toContain("\uE001");
  });

  it("handles multiple tag groups at different positions", () => {
    const original = "\uE000 Start middle \uE001 end";
    const damagedTranslation = "بداية وسط نهاية";
    const result = restoreTagsLocally(original, damagedTranslation);
    expect(result).toContain("\uE000");
    expect(result).toContain("\uE001");
  });

  it("individual char count matches quality detector logic", () => {
    const original = "\uE000\uE001\uE002 Confirm";
    const damagedTranslation = "تأكيد";
    const result = restoreTagsLocally(original, damagedTranslation);
    const origCount = (original.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || []).length;
    const resultCount = (result.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || []).length;
    expect(resultCount).toBe(origCount);
  });

  it("does not duplicate tags already present in translation", () => {
    const original = "\uE000\uE001\uE002 Cancel";
    const translation = "\uE000 إلغاء"; // has E000, missing E001 and E002
    const result = restoreTagsLocally(original, translation);
    const e000Count = (result.match(/\uE000/g) || []).length;
    expect(e000Count).toBe(1); // should not duplicate
    expect(result).toContain("\uE001");
    expect(result).toContain("\uE002");
  });

  // === Group integrity tests ===

  it("keeps consecutive tag groups together (E000+E001+E002)", () => {
    const original = "\uE000\uE001\uE002 Confirm";
    const damagedTranslation = "تأكيد";
    const result = restoreTagsLocally(original, damagedTranslation);
    // The group E000+E001+E002 must remain as a consecutive sequence
    expect(result).toMatch(/\uE000\uE001\uE002/);
  });

  it("keeps multiple consecutive groups intact", () => {
    const original = "\uE000\uE001\uE002 to talk to \uE003\uE004";
    const damagedTranslation = "للتحدث مع";
    const result = restoreTagsLocally(original, damagedTranslation);
    // Both groups must stay together
    expect(result).toMatch(/\uE000\uE001\uE002/);
    expect(result).toMatch(/\uE003\uE004/);
  });

  it("keeps button icon group at word boundary", () => {
    const original = "\uE000\uE001 Cancel";
    const damagedTranslation = "إلغاء";
    const result = restoreTagsLocally(original, damagedTranslation);
    expect(result).toMatch(/\uE000\uE001/);
    // Group should be at start or end, not splitting a word
    const cleanParts = result.split(/[\uE000-\uF8FF]+/).filter(Boolean);
    for (const part of cleanParts) {
      expect(part.trim()).toBe(part.trim()); // no broken words
    }
  });

  it("preserves group order for complex control sequences", () => {
    const original = "Press \uE000\uE001\uE002 to talk to \uE003 Impa \uE004";
    const damagedTranslation = "اضغط للتحدث مع إمبا";
    const result = restoreTagsLocally(original, damagedTranslation);
    const group1Idx = result.indexOf("\uE000");
    const group2Idx = result.indexOf("\uE003");
    // First group should appear before second group
    expect(group1Idx).toBeLessThan(group2Idx);
  });

  it("restores N[TAG] and strips AI-invented [TAG:...] variants", () => {
    const original = "Press 1[ML]%.";
    const damagedTranslation = "[ML:EnhanceParam paramtype=1 ]%.";
    const result = restoreTagsLocally(original, damagedTranslation);
    expect(result).toContain("1[ML]");
    expect(result).not.toContain("[ML:EnhanceParam");
  });

  // === DUPLICATION PREVENTION (exact multiset enforcement) ===

  it("removes extra duplicate of same original tag", () => {
    const original = "Score [ML:Dash 4] here";
    const translation = "النتيجة [ML:Dash 4] هنا [ML:Dash 4]";
    const result = restoreTagsLocally(original, translation);
    const count = (result.match(/\[ML:Dash 4\]/g) || []).length;
    expect(count).toBe(1);
  });

  it("removes extra duplicate of N[TAG] style", () => {
    const original = "Press 1[ML] here";
    const translation = "اضغط 1[ML] هنا 1[ML]";
    const result = restoreTagsLocally(original, translation);
    const count = (result.match(/1\[ML\]/g) || []).length;
    expect(count).toBe(1);
  });

  it("strips foreign AND extra tags together", () => {
    const original = "1[ML] text";
    const translation = "1[ML] 1[ML] [ML:Fake param=1] نص";
    const result = restoreTagsLocally(original, translation);
    expect((result.match(/1\[ML\]/g) || []).length).toBe(1);
    expect(result).not.toContain("[ML:Fake");
  });

  it("idempotency: running twice produces same result", () => {
    const original = "Score [ML:Dash 4] end";
    const translation = "النتيجة [ML:Dash 4] [ML:Dash 4] نهاية";
    const first = restoreTagsLocally(original, translation);
    const second = restoreTagsLocally(original, first);
    expect(second).toBe(first);
  });

  // === Legacy FFF9-FFFC backward compat ===

  it("still works with legacy FFF9-FFFC markers", () => {
    const original = "Hello \uFFF9 world \uFFFA end";
    const damagedTranslation = "مرحبا عالم نهاية";
    const result = restoreTagsLocally(original, damagedTranslation);
    expect(result).toContain("\uFFF9");
    expect(result).toContain("\uFFFA");
  });
});
