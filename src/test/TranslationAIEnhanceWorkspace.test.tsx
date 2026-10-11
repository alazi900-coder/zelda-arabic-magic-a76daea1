import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TranslationAIEnhancePanel from "@/components/editor/TranslationAIEnhancePanel";
import type { ExtractedEntry } from "@/components/editor/types";

const entries: ExtractedEntry[] = [{
  msbtFile: "goldensun/lost-age/catalog", index: 0,
  label: "Felix", original: "Felix\\x03Are you ready?", maxBytes: 0,
}];

describe("Enhancement workspace layout", () => {
  beforeEach(() => localStorage.clear());
  const show = () => render(
    <TranslationAIEnhancePanel entries={entries} translations={{}} onApplySuggestion={() => {}} risenVariant="risen1" />,
  );

  it("shows scan, rules, results, history and settings in a clear nav", () => {
    show();
    const tabs = screen.getAllByRole("tab");
    const main = tabs.filter(t => t.hasAttribute("data-testid") && t.getAttribute("data-testid")?.startsWith("enhance-tab-"));
    expect(main).toHaveLength(5);
    expect(screen.getByTestId("enhance-tab-scan")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("فحص شامل (قواعد + صياغة)")).toBeInTheDocument();
  });

  it("routes to game-specific rule controls without hiding the results navigation", () => {
    show();
    fireEvent.click(screen.getByTestId("enhance-tab-rules"));
    expect(screen.getByText(/قواعد Golden Sun: The Lost Age/)).toBeInTheDocument();
    expect(screen.getByText("تحرير القواعد وتشغيلها")).toBeInTheDocument();
    expect(screen.queryByText("فحص شامل (قواعد + صياغة)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("enhance-tab-results"));
    expect(screen.getByTestId("enhance-tab-results")).toHaveAttribute("aria-selected", "true");
  });

  it("keeps settings and undo history available as separate views", () => {
    show();
    fireEvent.click(screen.getByTestId("enhance-tab-history"));
    expect(screen.getByText("سجل التعديلات في هذه الجلسة")).toBeInTheDocument();
    expect(screen.getByText(/لم تُطبَّق تعديلات/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("enhance-tab-settings"));
    expect(screen.getByText(/برومبت مراجعة/)).toBeInTheDocument();
  });
});
