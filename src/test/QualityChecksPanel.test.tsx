import { render, screen } from "@testing-library/react";
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

function stateWithTranslation(translation: string): EditorState {
  return {
    entries: [entry],
    translations: { "lumentale:dialogue.bdat:0": translation },
  } as unknown as EditorState;
}

describe("QualityChecksPanel", () => {
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
});
