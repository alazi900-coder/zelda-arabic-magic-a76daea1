import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ContextSuggestPanel from "@/components/editor/ContextSuggestPanel";
import type { ExtractedEntry } from "@/components/editor/types";
import { requestGmiCloudJson } from "@/lib/gmicloud-direct";

vi.mock("@/lib/gmicloud-direct", () => ({ requestGmiCloudJson: vi.fn() }));
vi.mock("@/lib/idb-storage", () => ({ idbGet: vi.fn().mockResolvedValue(undefined), idbSet: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const gmiRequest = vi.mocked(requestGmiCloudJson);

function makeEntry(msbtFile: string): ExtractedEntry {
  return {
    msbtFile,
    index: 3,
    label: "test",
    original: "Open <h>{0}</h> for [USERNAME]",
    maxBytes: 0,
  };
}

function renderPanel(entry: ExtractedEntry, onApplyTranslation = vi.fn()) {
  return {
    onApplyTranslation,
    ...render(
      <ContextSuggestPanel
        open
        onClose={vi.fn()}
        entry={entry}
        entries={[entry]}
        translations={{}}
        onApplyTranslation={onApplyTranslation}
        risenVariant="risen1"
        translationProvider="gmicloud"
        aiModel="MiniMaxAI/MiniMax-M2.7"
        userGmiCloudKey="session-only-test-key"
      />,
    ),
  };
}

describe("ContextSuggestPanel — LumenTale token contract", () => {
  beforeEach(() => {
    gmiRequest.mockReset();
  });

  it("shows the token difference and blocks a LumenTale suggestion that omits a runtime token", async () => {
    gmiRequest.mockResolvedValue({
      suggestions: [{ translation: "افتح <h>{0}</h>", style: "natural", styleLabel: "طبيعي", reason: "اختبار", confidence: 0.9 }],
      contextNote: "",
    });
    const { onApplyTranslation } = renderPanel(makeEntry("lumentale/UI_en"));

    fireEvent.click(screen.getByRole("button", { name: /توليد اقتراحات/ }));

    await screen.findByText(/فرق في الوسوم/);
    expect(screen.getByText(/وسوم مفقودة: \[USERNAME\]/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /تطبيق/ })).toBeDisabled();
    expect(onApplyTranslation).not.toHaveBeenCalled();
  });

  it("does not apply the LumenTale-only token gate to another game's contextual suggestion", async () => {
    gmiRequest.mockResolvedValue({
      suggestions: [{ translation: "افتح النافذة", style: "natural", styleLabel: "طبيعي", reason: "اختبار", confidence: 0.9 }],
      contextNote: "",
    });
    const { onApplyTranslation } = renderPanel(makeEntry("gtaiv/american"));

    fireEvent.click(screen.getByRole("button", { name: /توليد اقتراحات/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /تطبيق/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /تطبيق/ }));

    expect(onApplyTranslation).toHaveBeenCalledWith("gtaiv/american:3", "افتح النافذة");
  });
});
