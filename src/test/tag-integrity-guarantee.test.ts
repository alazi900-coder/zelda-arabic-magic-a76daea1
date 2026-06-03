import { describe, it, expect } from "vitest";
import { checkTagSequenceMatch } from "@/lib/xc3-build-tag-guard";
import { restoreTagsLocally } from "@/lib/xc3-tag-restoration";
import { stripBidiMarkers } from "@/lib/arabic-processing";

describe("Tag Integrity Guarantee (XENO:n, PageBreak)", () => {
  const original = "Text [XENO:n ] more text [System:PageBreak] end";
  
  it("should detect reversed tags correctly", () => {
    const reversed = "نص [System:PageBreak] نص آخر [XENO:n ] نهاية";
    expect(checkTagSequenceMatch(original, reversed)).toBe(false);
  });

  it("should restore correct tag order even if AI reverses them", () => {
    const reversed = "نص [System:PageBreak] نص آخر [XENO:n ] نهاية";
    const restored = restoreTagsLocally(original, reversed);
    
    const xenoIdx = restored.indexOf("[XENO:n ]");
    const pbIdx = restored.indexOf("[System:PageBreak]");
    
    expect(xenoIdx).toBeGreaterThan(-1);
    expect(pbIdx).toBeGreaterThan(-1);
    expect(xenoIdx).toBeLessThan(pbIdx);
  });

  it("should preserve tags during BiDi/RLM processing", () => {
    const translation = "نص [XENO:n ] نص [System:PageBreak]";
    // Simulate what happens during build (stripping markers)
    const clean = stripBidiMarkers(translation);
    expect(clean).toContain("[XENO:n ]");
    expect(clean).toContain("[System:PageBreak]");
  });

  it("should maintain tag sequence in complex multi-tag scenarios", () => {
    const multiOrig = "[TAG1] [TAG2] [TAG3]";
    const damaged = "[TAG3] [TAG1]";
    const restored = restoreTagsLocally(multiOrig, damaged);
    expect(restored).toContain("[TAG1]");
    expect(restored).toContain("[TAG2]");
    expect(restored).toContain("[TAG3]");
    expect(restored.indexOf("[TAG1]")).toBeLessThan(restored.indexOf("[TAG2]"));
    expect(restored.indexOf("[TAG2]")).toBeLessThan(restored.indexOf("[TAG3]"));
  });
});
