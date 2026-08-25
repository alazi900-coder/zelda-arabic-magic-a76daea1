import { describe, expect, it } from "vitest";
import {
  hasTechnicalTags,
  isGtaIvRuntimeOnlyText,
  isTechnicalText,
  isTranslationExcludedText,
} from "@/components/editor/types";
import { editorTagPattern } from "@/lib/editor-tag-pattern";

describe("GTA IV technical-only rows", () => {
  const gtaivFile = "gtaiv/MAIN";

  it("recognizes a standalone controller token as protected and excluded from AI exchange", () => {
    expect(hasTechnicalTags("~MOUSE_WHEEL~", gtaivFile)).toBe(true);
    expect(isGtaIvRuntimeOnlyText("~MOUSE_WHEEL~", gtaivFile)).toBe(true);
    expect(isTechnicalText("~MOUSE_WHEEL~", gtaivFile)).toBe(true);
    expect(isTranslationExcludedText("~MOUSE_WHEEL~", gtaivFile)).toBe(true);
  });

  it("supports several standalone runtime tokens separated only by whitespace", () => {
    expect(isGtaIvRuntimeOnlyText("  ~PAD_X~  ~MOUSE_WHEEL~  ", gtaivFile)).toBe(true);
    expect(isTranslationExcludedText("~PAD_X~\n~MOUSE_WHEEL~", gtaivFile)).toBe(true);
  });

  it("does not exclude a sentence that contains a controller token", () => {
    const text = "Press ~PAD_X~ to focus on the bike";
    expect(hasTechnicalTags(text, gtaivFile)).toBe(true);
    expect(isGtaIvRuntimeOnlyText(text, gtaivFile)).toBe(false);
    expect(isTranslationExcludedText(text, gtaivFile)).toBe(false);
  });

  it("does not apply the GTA IV standalone-token rule to other games", () => {
    expect(isGtaIvRuntimeOnlyText("~MOUSE_WHEEL~", "other-game/MAIN")).toBe(false);
    expect(isTranslationExcludedText("~MOUSE_WHEEL~", "other-game/MAIN")).toBe(false);
  });

  it("includes GTA IV runtime tokens in the editor highlight pattern", () => {
    const matches = "Press ~PAD_X~ to focus".match(editorTagPattern());
    expect(matches).toContain("~PAD_X~");
  });
});
