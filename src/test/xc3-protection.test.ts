import { describe, it, expect } from "vitest";
import { protectTags, restoreTags } from "@/lib/xc3-tag-protection";
import { restoreTagsLocally } from "@/lib/xc3-tag-restoration";

describe("XC3 Tag Protection", () => {
  it("should protect PUA icons and restore them after translation", () => {
    const text = "Press \uE000 to confirm";
    const { cleanText, tags } = protectTags(text);
    expect(cleanText).toBe("Press TAG_0 to confirm");
    expect(tags).toHaveLength(1);
    expect(tags[0].original).toBe("\uE000");
    const restored = restoreTags("اضغط TAG_0 للتأكيد", tags);
    expect(restored).toBe("اضغط \uE000 للتأكيد");
  });

  it("should treat consecutive PUA sequences as atomic blocks", () => {
    const text = "Use \uE000\uE001\uE002 here";
    const { cleanText, tags } = protectTags(text);
    expect(cleanText).toBe("Use TAG_0 here");
    expect(tags).toHaveLength(1);
    expect(tags[0].original).toBe("\uE000\uE001\uE002");
  });

  it("should protect [Format:Value] tags", () => {
    const text = "[Color:Red]danger[Color:White]";
    const { cleanText, tags } = protectTags(text);
    expect(cleanText).toBe("TAG_0dangerTAG_1");
    expect(tags).toHaveLength(2);
    expect(tags[0].original).toBe("[Color:Red]");
    expect(tags[1].original).toBe("[Color:White]");
  });

  it("should protect {variable} placeholders", () => {
    const text = "Hello {player_name}, you have {item_count} items";
    const { cleanText, tags } = protectTags(text);
    expect(cleanText).toContain("TAG_0");
    expect(cleanText).toContain("TAG_1");
    expect(tags).toHaveLength(2);
    const restored = restoreTags("مرحبا TAG_0 لديك TAG_1 عناصر", tags);
    expect(restored).toContain("{player_name}");
    expect(restored).toContain("{item_count}");
  });

  it("should detect missing tags in translation via restoreTagsLocally", () => {
    const original = "\uE000 Press to start \uE001";
    const translation = "اضغط للبدء";
    const fixed = restoreTagsLocally(original, translation);
    expect(fixed).toContain("\uE000");
    expect(fixed).toContain("\uE001");
  });

  it("should not modify translation when all tags present", () => {
    const original = "\uE000 text \uE001";
    const translation = "\uE000 نص \uE001";
    const result = restoreTagsLocally(original, translation);
    expect(result).toBe(translation);
  });

  it("should restore missing PUA icons at word boundaries", () => {
    const original = "Hello \uE000 world \uE001 end";
    const translation = "مرحبا عالم نهاية";
    const fixed = restoreTagsLocally(original, translation);
    expect(fixed).toContain("\uE000");
    expect(fixed).toContain("\uE001");
  });

  it("should handle text with no tags", () => {
    const text = "Simple text without tags";
    const { cleanText, tags } = protectTags(text);
    expect(cleanText).toBe(text);
    expect(tags).toHaveLength(0);
  });

  it("should protect Unicode special markers", () => {
    const text = "Text \uFFF9 with \uFFFA marker";
    const { cleanText, tags } = protectTags(text);
    expect(tags.length).toBeGreaterThanOrEqual(2);
    expect(cleanText).not.toContain("\uFFF9");
    expect(cleanText).not.toContain("\uFFFA");
  });

  it("should handle mixed tag types", () => {
    const text = "\uE000 [Color:Red] {name} \uFFF9";
    const { cleanText, tags } = protectTags(text);
    expect(tags).toHaveLength(4);
    const restored = restoreTags("TAG_0 TAG_1 TAG_2 TAG_3", tags);
    expect(restored).toContain("\uE000");
    expect(restored).toContain("[Color:Red]");
    expect(restored).toContain("{name}");
    expect(restored).toContain("\uFFF9");
  });

  it("should protect game abbreviations like EXP, CP, SP", () => {
    const text = "You gained 500 EXP and 30 SP";
    const { cleanText, tags } = protectTags(text);
    expect(cleanText).not.toContain("EXP");
    expect(cleanText).not.toContain(" SP");
    expect(tags.length).toBeGreaterThanOrEqual(2);
    const restored = restoreTags(cleanText.replace("500", "٥٠٠").replace("30", "٣٠"), tags);
    expect(restored).toContain("EXP");
    expect(restored).toContain("SP");
  });

  it("should protect HP and CP abbreviations", () => {
    const text = "HP: 1000 CP: 50";
    const { cleanText, tags } = protectTags(text);
    expect(cleanText).not.toContain("HP");
    expect(cleanText).not.toContain("CP");
  });

  it("should not protect abbreviations inside words", () => {
    const text = "experience points";
    const { cleanText, tags } = protectTags(text);
    expect(cleanText).toBe(text);
    expect(tags).toHaveLength(0);
  });

  it("should NOT protect descriptive parentheses following ML tags - they are translatable", () => {
    const text = "[ML:undisp ](Crowd noise of children)";
    const { cleanText, tags } = protectTags(text);
    expect(tags).toHaveLength(1);
    expect(tags[0].original).toBe("[ML:undisp ]");
    expect(cleanText).toBe("TAG_0(Crowd noise of children)");
  });

  it("should NOT protect standalone descriptive parentheses - they are translatable", () => {
    const text = "Hello (Sound effect) world";
    const { cleanText, tags } = protectTags(text);
    expect(tags).toHaveLength(0);
    expect(cleanText).toBe("Hello (Sound effect) world");
  });

  it("should protect [ML:undisp ] with trailing space", () => {
    const text = "[ML:undisp ]Some text[ML:Feeling ]";
    const { cleanText, tags } = protectTags(text);
    expect(tags).toHaveLength(2);
    expect(tags[0].original).toBe("[ML:undisp ]");
    expect(tags[1].original).toBe("[ML:Feeling ]");
  });

  // === NEW: N[TAG] and [TAG]N protection tests ===
  
  it("should protect N[TAG] patterns like 1[ML]", () => {
    const text = "Press 1[ML] to confirm";
    const { cleanText, tags } = protectTags(text);
    expect(cleanText).toBe("Press TAG_0 to confirm");
    expect(tags).toHaveLength(1);
    expect(tags[0].original).toBe("1[ML]");
    const restored = restoreTags("اضغط TAG_0 للتأكيد", tags);
    expect(restored).toBe("اضغط 1[ML] للتأكيد");
  });

  it("should protect [TAG]N patterns like [ML]1", () => {
    const text = "Hold [ML]2 and press [ML]1";
    const { cleanText, tags } = protectTags(text);
    expect(tags).toHaveLength(2);
    expect(tags[0].original).toBe("[ML]2");
    expect(tags[1].original).toBe("[ML]1");
    const restored = restoreTags("امسك TAG_0 واضغط TAG_1", tags);
    expect(restored).toBe("امسك [ML]2 واضغط [ML]1");
  });

  it("should protect [TAG=Value] patterns", () => {
    const text = "[Color=Red]Warning![Color=White]";
    const { cleanText, tags } = protectTags(text);
    expect(tags).toHaveLength(2);
    expect(tags[0].original).toBe("[Color=Red]");
    expect(tags[1].original).toBe("[Color=White]");
  });

  it("should protect {TAG:Value} patterns", () => {
    const text = "Hello {player:name}, score: {score:value}";
    const { cleanText, tags } = protectTags(text);
    expect(tags).toHaveLength(2);
    expect(tags[0].original).toBe("{player:name}");
    expect(tags[1].original).toBe("{score:value}");
  });

  it("should preserve 1[ML] and 2[ML] through full protect/restore cycle", () => {
    const text = "Press 1[ML] and hold 2[ML] to attack";
    const { cleanText, tags } = protectTags(text);
    expect(cleanText).not.toContain("1[ML]");
    expect(cleanText).not.toContain("2[ML]");
    // Simulate AI translation
    const aiOutput = "اضغط TAG_0 وامسك TAG_1 للهجوم";
    const restored = restoreTags(aiOutput, tags);
    expect(restored).toBe("اضغط 1[ML] وامسك 2[ML] للهجوم");
  });

  // === NEW: restoreTagsLocally with multi-char tags ===

  it("should restore missing 1[ML] via restoreTagsLocally", () => {
    const original = "Press 1[ML] to confirm";
    const translation = "اضغط للتأكيد";
    const fixed = restoreTagsLocally(original, translation);
    expect(fixed).toContain("1[ML]");
  });

  it("should restore missing N[TAG] and [TAG]N tags", () => {
    const original = "Press 1[ML] and hold 2[ML] to attack";
    const translation = "اضغط وامسك للهجوم";
    const fixed = restoreTagsLocally(original, translation);
    expect(fixed).toContain("1[ML]");
    expect(fixed).toContain("2[ML]");
  });

  it("should strip AI-invented tags that don't exist in original", () => {
    const original = "Press 1[ML] to confirm";
    const translation = "اضغط [ML:icon icon=btn_a ] للتأكيد";
    const fixed = restoreTagsLocally(original, translation);
    expect(fixed).toContain("1[ML]");
    expect(fixed).not.toContain("[ML:icon");
  });

  it("should strip [ML:icon ...] and restore 1[ML] correctly", () => {
    const original = "Press 1[ML] button. Hold 2[ML] to charge.";
    const translation = "اضغط [ML:icon icon=btn_a ] زر. امسك [ML:icon icon=btn_b ] للشحن.";
    const fixed = restoreTagsLocally(original, translation);
    expect(fixed).toContain("1[ML]");
    expect(fixed).toContain("2[ML]");
    expect(fixed).not.toContain("[ML:icon");
  });
});
