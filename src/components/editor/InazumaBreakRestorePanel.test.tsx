import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InazumaBreakRestorePanel from "./InazumaBreakRestorePanel";
import { toInazumaBreakTokens } from "@/lib/inazuma/inazuma-break-tokens";
import type { EditorState } from "./types";

const original = toInazumaBreakTokens("Your speed will drop if you lose too much FP.\\fYou can see when this happens.");
const entries = [0, 1, 2, 3].map((index) => ({ msbtFile: "inazuma/evet", index, label: "", original }));

function stateWith(translations: string[]): EditorState {
  return {
    entries,
    translations: Object.fromEntries(translations.map((t, i) => [`inazuma/evet:${i}`, t])),
  } as unknown as EditorState;
}

describe("Inazuma break-restore panel (Platinum's tool, for ▼)", () => {
  it("fixes missing and misplaced breaks in one pass and leaves good lines alone", () => {
    const onApplyAll = vi.fn();
    render(
      <InazumaBreakRestorePanel
        state={stateWith([
          "ستنخفض سرعتك إذا فقدت الكثير من نقاط اللياقة.\nسترى ذلك عندما يحدث.", // missing
          "ستنخفض سرعتك إذا فقدت الكثير من▼\nنقاط اللياقة. سترى ذلك عندما يحدث.", // mid-sentence
          "ستنخفض سرعتك إذا فقدت الكثير من نقاط اللياقة.▼\nسترى ذلك عندما يحدث.", // correct
          "ستنخفض سرعتك", // one sentence: cannot be placed with certainty
        ])}
        onApplyAll={onApplyAll}
        onFilterByKeys={() => {}}
      />,
    );
    expect(screen.getByText(/3 سطر/)).toBeTruthy();
    fireEvent.click(screen.getByText("افحص"));
    fireEvent.click(screen.getByText(/طبّق 2/));
    const fixes = onApplyAll.mock.calls[0][0];
    const good = "ستنخفض سرعتك إذا فقدت الكثير من نقاط اللياقة.▼\nسترى ذلك عندما يحدث.";
    expect(fixes).toEqual({ "inazuma/evet:0": good, "inazuma/evet:1": good });
    expect(screen.queryByText(/اعرض/)).toBeNull();
  });

  it("offers the unplaceable line for review instead of guessing", () => {
    render(
      <InazumaBreakRestorePanel
        state={stateWith(["", "", "", "ستنخفض سرعتك"])}
        onApplyAll={() => {}}
        onFilterByKeys={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("افحص"));
    expect(screen.getByText(/اعرض 1/)).toBeTruthy();
  });
});
