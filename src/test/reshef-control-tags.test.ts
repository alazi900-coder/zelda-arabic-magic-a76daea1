import { describe, expect, it } from "vitest";
import { hasTechnicalTags } from "@/components/editor/types";
import { diffTechnicalTags } from "@/lib/xc3-build-tag-guard";
import { restoreTagsLocally } from "@/lib/xc3-tag-restoration";

describe("Reshef textual control tags", () => {
  const original = "A#0B#1C%";

  it("classifies #0–#5 and % as technical controls", () => {
    expect(hasTechnicalTags(original)).toBe(true);
  });

  it("requires Reshef controls to survive in the same order", () => {
    expect(diffTechnicalTags(original, "ع#0ب#1ج%").exactTagMatch).toBe(true);
    expect(diffTechnicalTags(original, "ع#1ب#0ج%").sequenceMatch).toBe(false);
    expect(diffTechnicalTags(original, "ع#0بج%").exactTagMatch).toBe(false);
  });

  it("restores missing and reordered Reshef controls without replacing Arabic text", () => {
    expect(restoreTagsLocally(original, "ترجمة عربية")).toContain("#0");
    expect(restoreTagsLocally(original, "ترجمة عربية")).toContain("#1");
    expect(restoreTagsLocally(original, "ترجمة عربية")).toContain("%");

    const repaired = restoreTagsLocally(original, "ترجمة#1 عربية#0%");
    expect(diffTechnicalTags(original, repaired).exactTagMatch).toBe(true);
    expect(diffTechnicalTags(original, repaired).sequenceMatch).toBe(true);
    expect(repaired).toContain("ترجمة");
    expect(repaired).toContain("عربية");
  });
});
