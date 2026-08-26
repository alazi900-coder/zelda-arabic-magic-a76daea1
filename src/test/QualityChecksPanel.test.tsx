import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import QualityChecksPanel from "@/components/editor/QualityChecksPanel";
import type { EditorState, ExtractedEntry } from "@/components/editor/types";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const entry: ExtractedEntry = {
  msbtFile: "lumentale:dialogue.bdat",
  index: 0,
  label: "opening_line",
  original: "Welcome back.",
  maxBytes: 120,
};

function stateWithTranslation(translation: string, original = entry.original): EditorState {
  return {
    entries: [{ ...entry, original }],
    translations: { "lumentale:dialogue.bdat:0": translation },
  } as unknown as EditorState;
}

describe("QualityChecksPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps the deferred scan launcher visible when translated work exists", () => {
    render(
      <QualityChecksPanel
        state={stateWithTranslation("مرحباً بعودتك.")}
        onApplyFix={vi.fn()}
        onFilterByKeys={vi.fn()}
        risenVariant="risen1"
      />,
    );

    expect(screen.getByText("فحص الجودة المتقدم")).toBeInTheDocument();
    expect(screen.getByText("افتح للتشغيل")).toBeInTheDocument();
  });

  it("can disable the number rule for the current game and removes its issue", () => {
    render(
      <QualityChecksPanel
        state={stateWithTranslation("لديك 90 عملة.", "You have 100 coins.")}
        onApplyFix={vi.fn()}
        onFilterByKeys={vi.fn()}
        risenVariant="risen1"
      />,
    );

    fireEvent.click(screen.getByText("فحص الجودة المتقدم"));
    expect(screen.getByText(/أرقام مفقودة: 100/)).toBeInTheDocument();

    const numberRule = screen.getByRole("button", { name: /فحص الأرقام/ });
    expect(numberRule).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(numberRule);

    expect(numberRule).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText(/أرقام مفقودة: 100/)).not.toBeInTheDocument();
    expect(
      Object.values(window.localStorage).some((value) => value.includes('"number_check":false')),
    ).toBe(true);
  });
});
