import { describe, expect, it } from "vitest";
import {
  hasTechnicalTags,
  isGtaIvRuntimeOnlyText,
  isTechnicalText,
  isTranslationExcludedText,
} from "@/components/editor/types";
import { editorTagPattern } from "@/lib/editor-tag-pattern";
import {
  gtaIvEditorTextToRuntimeText,
  gtaIvRuntimeTextToEditorText,
  planGtaIvLineJoin,
  planGtaIvLineSplit,
} from "@/lib/gtaiv/gtaiv-line-split";

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

  it("renders the stored GTA IV break marker as a textarea line and restores it", () => {
    const raw = "السطر الأول~n~السطر الثاني";
    expect(gtaIvRuntimeTextToEditorText(raw)).toBe("السطر الأول~n~\nالسطر الثاني");
    expect(gtaIvEditorTextToRuntimeText("السطر الأول~n~\nالسطر الثاني")).toBe(raw);
  });

  it("plans a character-limit split as raw ~n~ markers for GTA IV rows passed by the tool", () => {
    const entries = [
      { msbtFile: "gtaiv/american.gxt", index: 12, original: "English source" },
    ];
    const translations = {
      "gtaiv/american.gxt:12": "هذه جملة عربية طويلة يجب أن تقسم عند الكلمات من دون قطع أي كلمة في المنتصف",
    };
    const plan = planGtaIvLineSplit(entries, translations, 24);
    expect(plan.targetKeys).toEqual(["gtaiv/american.gxt:12"]);
    expect(plan.updates["gtaiv/american.gxt:12"]).toContain("~n~");
    expect(plan.updates["gtaiv/american.gxt:12"]).not.toContain("\n");
    expect(plan.snapshot["gtaiv/american.gxt:12"]).toBe(translations["gtaiv/american.gxt:12"]);
  });

  it("joins stored GTA IV markers into one logical raw line", () => {
    const entries = [{ msbtFile: "gtaiv/american.gxt", index: 6, original: "English source" }];
    const plan = planGtaIvLineJoin(entries, { "gtaiv/american.gxt:6": "أول~n~ثان" });
    expect(plan.updates["gtaiv/american.gxt:6"]).toBe("أول ثان");
  });
});
