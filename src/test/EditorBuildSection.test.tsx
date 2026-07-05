import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import EditorBuildSection from "@/components/editor/EditorBuildSection";

function makeEditor(overrides: Partial<Parameters<typeof EditorBuildSection>[0]["editor"]> = {}) {
  return {
    state: { entries: [], translations: {}, protectedEntries: new Set<string>(), technicalBypass: new Set<string>() },
    arabicNumerals: false,
    setArabicNumerals: vi.fn(),
    mirrorPunctuation: false,
    setMirrorPunctuation: vi.fn(),
    handleApplyArabicProcessing: vi.fn(),
    applyingArabic: false,
    handleUndoArabicProcessing: vi.fn(),
    building: false,
    handleCheckIntegrity: vi.fn(),
    handlePreBuild: vi.fn(),
    ...overrides,
  };
}

function renderSection(isRisen: boolean) {
  return render(
    <EditorBuildSection
      editor={makeEditor()}
      isRisen={isRisen}
      unprocessedArabicCount={0}
      showBuildSection={true}
      setShowBuildSection={vi.fn()}
      setShowArabicProcessConfirm={vi.fn()}
      setShowDiagnostic={vi.fn()}
    />
  );
}

describe("EditorBuildSection — Arabic-processing button on Risen sessions", () => {
  it("keeps the button enabled for non-Risen (Xenoblade) sessions", () => {
    renderSection(false);
    const btn = screen.getByText(/تطبيق المعالجة العربية/).closest("button")!;
    expect(btn).not.toBeDisabled();
  });

  it("disables the button for Risen sessions with an explanatory tooltip", () => {
    renderSection(true);
    const btn = screen.getByText(/تطبيق المعالجة العربية/).closest("button")!;
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("title")).toMatch(/Risen/);
    expect(btn.getAttribute("title")).toMatch(/Xenoblade/);
  });
});
