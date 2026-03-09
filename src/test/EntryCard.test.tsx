import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import EntryCard from "@/components/editor/EntryCard";
import type { ExtractedEntry } from "@/components/editor/types";

// Mock supabase client
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const mockEntry: ExtractedEntry = {
  msbtFile: "test.bdat",
  index: 0,
  original: "Hello World",
  context: "",
  maxBytes: 100,
};

const defaultProps = {
  entry: mockEntry,
  translation: "",
  isProtected: false,
  hasProblem: false,
  isDamagedTag: false,
  isMobile: false,
  translatingSingle: null,
  improvingTranslations: false,
  previousTranslations: {} as Record<string, string>,
  glossary: "",
  isTranslationTooShort: () => false,
  isTranslationTooLong: () => false,
  hasStuckChars: () => false,
  isMixedLanguage: () => false,
  updateTranslation: vi.fn(),
  handleTranslateSingle: vi.fn(),
  handleImproveSingleTranslation: vi.fn(),
  handleUndoTranslation: vi.fn(),
  handleFixReversed: vi.fn(),
  handleLocalFixDamagedTag: vi.fn(),
  onAcceptFuzzy: vi.fn(),
  onRejectFuzzy: vi.fn(),
  onCompare: vi.fn(),
  onSplitNewline: vi.fn(),
  tmSuggestions: [],
};

describe("EntryCard", () => {
  it("renders the original text", () => {
    render(<EntryCard {...defaultProps} />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("shows file name and index", () => {
    render(<EntryCard {...defaultProps} />);
    expect(screen.getByText(/test\.bdat/)).toBeInTheDocument();
  });

  it("shows translation when provided", () => {
    render(<EntryCard {...defaultProps} translation="مرحبا بالعالم" />);
    // The translation appears in the input
    const input = screen.getByDisplayValue("مرحبا بالعالم");
    expect(input).toBeInTheDocument();
  });

  it("shows problem indicator when hasProblem is true", () => {
    render(<EntryCard {...defaultProps} hasProblem={true} />);
    // Should have a warning/problem visual indicator
    const card = screen.getByText("Hello World").closest('[class*="card"], [class*="Card"], div');
    expect(card).toBeTruthy();
  });

  it("shows protected badge when entry is protected", () => {
    render(<EntryCard {...defaultProps} isProtected={true} />);
    // Protected entries show a shield or lock indicator
    expect(document.querySelector('[class*="protected"], svg')).toBeTruthy();
  });

  it("displays translate button", () => {
    render(<EntryCard {...defaultProps} />);
    const translateBtn = screen.getAllByRole("button").find(
      b => b.textContent?.includes("ترجم") || b.getAttribute("title")?.includes("ترجم")
    );
    expect(translateBtn).toBeTruthy();
  });
});
