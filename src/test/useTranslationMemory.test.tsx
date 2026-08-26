import { renderHook } from "@testing-library/react";
import { useTranslationMemory } from "@/hooks/useTranslationMemory";
import type { EditorState } from "@/components/editor/types";

function createState(): EditorState {
  return {
    entries: [
      { msbtFile: "menu.bdat", index: 0, label: "first", original: "Play game", maxBytes: 100 },
      { msbtFile: "menu.bdat", index: 1, label: "second", original: "  PLAY   GAME ", maxBytes: 100 },
    ],
    translations: { "menu.bdat:0": "ابدأ اللعبة" },
  } as unknown as EditorState;
}

describe("useTranslationMemory", () => {
  it("returns a reusable exact-match translation before fuzzy matches", () => {
    const { result } = renderHook(() => useTranslationMemory(createState()));

    expect(result.current.findSimilar("menu.bdat:1", "Play game")).toEqual([
      expect.objectContaining({
        key: "menu.bdat:0",
        translation: "ابدأ اللعبة",
        similarity: 100,
        matchType: "exact",
      }),
    ]);
  });
});
