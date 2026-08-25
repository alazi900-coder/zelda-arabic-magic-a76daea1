import { mergeGuardedTranslations } from "./risen-write-guard";
import type { EditorState } from "@/components/editor/types";

function gtaIvState(): EditorState {
  return {
    entries: [{
      msbtFile: "gtaiv/MAIN",
      index: 7,
      label: "PAYMENT",
      original: "Pay $700",
      maxBytes: 0,
    }],
    translations: {},
    protectedEntries: new Set(),
    risenTagReviewKeys: new Set(),
    lumentaleTokenErrorKeys: new Set(),
  } as EditorState;
}

describe("mergeGuardedTranslations GTA IV dollar protection", () => {
  it("stores an equivalent Arabic money spelling as the source dollar literal", () => {
    const state = gtaIvState();
    const key = "gtaiv/MAIN:7";

    expect(mergeGuardedTranslations(state, { [key]: "ادفع ٧٠٠ دولار" }).translations[key])
      .toBe("ادفع $700");
  });

  it("stores an explicit Arabic million wording as the source m literal", () => {
    const state = gtaIvState();
    state.entries[0] = { ...state.entries[0], original: "Prize: $10m" };
    const key = "gtaiv/MAIN:7";

    expect(mergeGuardedTranslations(state, { [key]: "الجائزة: 10 ملايين دولار" }).translations[key])
      .toBe("الجائزة: $10m");
  });

  it("does not import a different GTA IV dollar value", () => {
    const state = gtaIvState();
    const key = "gtaiv/MAIN:7";

    expect(mergeGuardedTranslations(state, { [key]: "ادفع ٧٠١ دولار" }).translations[key])
      .toBeUndefined();
  });
});
