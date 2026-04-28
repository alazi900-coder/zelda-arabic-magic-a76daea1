import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BatchQualityModal } from "@/components/editor/BatchQualityModal";
import { emptyCumulative, type BatchQualityStats } from "@/lib/batch-quality";

const sampleBatch: BatchQualityStats = {
  total: 10, returned: 10, validJson: true,
  withArabic: 9, placeholdersOk: 8, newlineStripped: 3,
  errors: [
    { key: "file.bdat:0", reason: "no-arabic", sample: "Hello world" },
    { key: "file.bdat:1", reason: "placeholder-mismatch (expected=TAG_0 got=TAG_1)", sample: "أهلاً TAG_1" },
  ],
};

describe("BatchQualityModal", () => {
  it("renders the trigger button", () => {
    render(<BatchQualityModal lastBatch={null} cumulative={emptyCumulative()} onReset={() => {}} />);
    expect(screen.getByRole("button", { name: /جودة الدفعات/ })).toBeInTheDocument();
  });

  it("does not show the batch count badge when no batches yet", () => {
    render(<BatchQualityModal lastBatch={null} cumulative={emptyCumulative()} onReset={() => {}} />);
    // no numeric badge rendered next to the trigger
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it("shows the batch count badge after batches accumulate", () => {
    const cumulative = { ...emptyCumulative(), batches: 4 };
    render(<BatchQualityModal lastBatch={sampleBatch} cumulative={cumulative} onReset={() => {}} />);
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("shows empty-state message when opened with no data", () => {
    render(<BatchQualityModal lastBatch={null} cumulative={emptyCumulative()} onReset={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /جودة الدفعات/ }));
    expect(screen.getByText(/لم تُنفَّذ أي دفعة ترجمة بعد/)).toBeInTheDocument();
  });

  it("renders last-batch stats including placeholders and Arabic counts", () => {
    const cumulative = { ...emptyCumulative(), batches: 1, total: 10, withArabic: 9, placeholdersOk: 8 };
    render(<BatchQualityModal lastBatch={sampleBatch} cumulative={cumulative} onReset={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /جودة الدفعات/ }));
    // "9 / 10" appears in last-batch tab
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getAllByText(/\/ 10/).length).toBeGreaterThan(0);
  });

  it("renders error samples and reasons inside the modal", () => {
    render(<BatchQualityModal lastBatch={sampleBatch} cumulative={{ ...emptyCumulative(), batches: 1 }} onReset={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /جودة الدفعات/ }));
    expect(screen.getByText(/no-arabic/)).toBeInTheDocument();
    expect(screen.getByText(/placeholder-mismatch/)).toBeInTheDocument();
    expect(screen.getByText("Hello world")).toBeInTheDocument();
    expect(screen.getByText("أهلاً TAG_1")).toBeInTheDocument();
    expect(screen.getByText("file.bdat:0")).toBeInTheDocument();
  });

  it("shows '🎉' / no-errors message when the errors array is empty", () => {
    const clean: BatchQualityStats = { ...sampleBatch, errors: [] };
    render(<BatchQualityModal lastBatch={clean} cumulative={{ ...emptyCumulative(), batches: 1 }} onReset={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /جودة الدفعات/ }));
    expect(screen.getAllByText(/لا توجد أخطاء مسجلة/).length).toBeGreaterThan(0);
  });

  it("shows 'JSON صالح: نعم' when validJson=true and 'لا' when false", () => {
    const bad: BatchQualityStats = { ...sampleBatch, validJson: false };
    render(<BatchQualityModal lastBatch={bad} cumulative={{ ...emptyCumulative(), batches: 1 }} onReset={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /جودة الدفعات/ }));
    expect(screen.getByText("لا")).toBeInTheDocument();
  });

  it("calls onReset when the reset button is clicked", () => {
    const onReset = vi.fn();
    render(<BatchQualityModal lastBatch={sampleBatch} cumulative={{ ...emptyCumulative(), batches: 1 }} onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: /جودة الدفعات/ }));
    fireEvent.click(screen.getByRole("button", { name: /تصفير/ }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("shows cumulative tab with batches and total counts", () => {
    const cumulative = {
      batches: 5, total: 50, withArabic: 48, placeholdersOk: 45, newlineStripped: 12, errors: [],
    };
    render(<BatchQualityModal lastBatch={sampleBatch} cumulative={cumulative} onReset={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /جودة الدفعات/ }));
    fireEvent.click(screen.getByRole("tab", { name: /تراكمي/ }));
    // After switching tabs, cumulative content is rendered
    const tabPanel = await screen.findByRole("tabpanel");
    expect(tabPanel.textContent).toContain("5");   // batches
    expect(tabPanel.textContent).toContain("50");  // total
    expect(tabPanel.textContent).toContain("12");  // newlineStripped
  });
});
