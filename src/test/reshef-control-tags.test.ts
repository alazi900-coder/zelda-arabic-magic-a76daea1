import { describe, expect, it } from "vitest";
import { hasTechnicalTags } from "@/components/editor/types";
import { diffTechnicalTags } from "@/lib/xc3-build-tag-guard";

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
});
