import { describe, it, expect } from "vitest";
import { restoreTagsLocally } from "@/lib/xc3-tag-restoration";

describe("restoreTagsLocally – translated/damaged tag handling", () => {
  it("strips Arabic-translated \\[tag\\] and re-inserts original", () => {
    const original = "\\[Passive\\] Boosts activation rate";
    const translation = "\\[سلبي\\] يعزز معدل التفعيل";
    const result = restoreTagsLocally(original, translation);
    expect(result).toContain("\\[Passive\\]");
    expect(result).not.toContain("\\[سلبي\\]");
  });

  it("strips Arabic inside [brackets] when original has English tags", () => {
    const original = "[XENO]1 gems on weapons";
    const translation = "[زينو]1 الجواهر على الأسلحة";
    const result = restoreTagsLocally(original, translation);
    expect(result).toContain("[XENO]1");
    expect(result).not.toContain("[زينو]");
  });

  it("fixes reversed brackets then restores tags", () => {
    const original = "Use [ML:Dash 4] here";
    const translation = "استخدم ]ML:Dash 4[ هنا";
    const result = restoreTagsLocally(original, translation);
    expect(result).toContain("[ML:Dash 4]");
  });

  it("strips invisible chars before matching", () => {
    const original = "[ML:Name] test";
    const translation = "[\u200FML:Name] اختبار";
    const result = restoreTagsLocally(original, translation);
    expect(result).toContain("[ML:Name]");
  });

  it("handles multiple translated tags", () => {
    const original = "\\[Active\\] $2 chance [XENO]1 will lower";
    const translation = "\\[نشط\\] فرصة $2 [زينو]1 سيقلل";
    const result = restoreTagsLocally(original, translation);
    expect(result).toContain("\\[Active\\]");
    expect(result).toContain("[XENO]1");
    expect(result).not.toContain("\\[نشط\\]");
    expect(result).not.toContain("[زينو]");
  });

  it("does not strip Arabic brackets when original has no tags", () => {
    const original = "Hello world";
    const translation = "مرحبا [ملاحظة] بالعالم";
    const result = restoreTagsLocally(original, translation);
    // No original tags, so translation should be returned as-is
    expect(result).toBe(translation);
  });

  it("handles {translated:brace} tags", () => {
    const original = "Hello {player:name} world";
    const translation = "مرحبا {لاعب:اسم} بالعالم";
    const result = restoreTagsLocally(original, translation);
    expect(result).toContain("{player:name}");
    expect(result).not.toContain("{لاعب:اسم}");
  });
});
