import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import VirtualizedEntryList from "@/components/editor/VirtualizedEntryList";
import type { ExtractedEntry } from "@/components/editor/types";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const makeEntry = (i: number): ExtractedEntry => ({
  msbtFile: `file${i}.bdat`,
  index: i,
  label: `label_${i}`,
  original: `Entry text ${i}`,
  maxBytes: 100,
});

const noop = () => {};
const noopEntry = (_e: ExtractedEntry) => {};
const falseFn = () => false;

const defaultProps = {
  state: {
    translations: {} as Record<string, string>,
    protectedEntries: new Set<string>(),
    fuzzyScores: {} as Record<string, number>,
  },
  qualityStats: {
    problemKeys: new Set<string>(),
    damagedTagKeys: new Set<string>(),
  },
  activeGlossary: "",
  isMobile: false,
  translatingSingle: null,
  improvingTranslations: false,
  previousTranslations: {} as Record<string, string>,
  isTranslationTooShort: falseFn,
  isTranslationTooLong: falseFn,
  hasStuckChars: falseFn,
  isMixedLanguage: falseFn,
  updateTranslation: noop as (k: string, v: string) => void,
  handleTranslateSingle: noopEntry,
  handleImproveSingleTranslation: noopEntry,
  handleUndoTranslation: noop as (k: string) => void,
  handleFixReversed: noopEntry,
  handleLocalFixDamagedTag: noopEntry,
  onAcceptFuzzy: noop as (k: string) => void,
  onRejectFuzzy: noop as (k: string) => void,
  onCompare: noopEntry,
  onSplitNewline: noop as (k: string) => void,
  findSimilar: () => [],
  height: 400,
};

describe("VirtualizedEntryList", () => {
  it("renders without crashing with empty entries", () => {
    const { container } = render(
      <VirtualizedEntryList entries={[]} {...defaultProps} />
    );
    expect(container).toBeTruthy();
  });

  it("renders entry cards for provided entries", () => {
    const entries = [makeEntry(0), makeEntry(1), makeEntry(2)];
    render(<VirtualizedEntryList entries={entries} {...defaultProps} />);
    expect(screen.getByText("Entry text 0")).toBeInTheDocument();
  });

  it("displays translations when provided", () => {
    const entries = [makeEntry(0)];
    const state = {
      ...defaultProps.state,
      translations: { "file0.bdat:0": "ترجمة تجريبية" },
    };
    render(
      <VirtualizedEntryList entries={entries} {...defaultProps} state={state} />
    );
    expect(screen.getByDisplayValue("ترجمة تجريبية")).toBeInTheDocument();
  });

  it("handles large entry lists without error", () => {
    const entries = Array.from({ length: 100 }, (_, i) => makeEntry(i));
    const { container } = render(
      <VirtualizedEntryList entries={entries} {...defaultProps} />
    );
    // react-window only renders visible items + overscan
    const renderedCards = container.querySelectorAll("[class*='card'], [class*='Card']");
    expect(renderedCards.length).toBeLessThan(100);
    expect(renderedCards.length).toBeGreaterThan(0);
  });

  it("marks problem entries", () => {
    const entries = [makeEntry(0)];
    const qualityStats = {
      problemKeys: new Set(["file0.bdat:0"]),
      damagedTagKeys: new Set<string>(),
    };
    render(
      <VirtualizedEntryList
        entries={entries}
        {...defaultProps}
        qualityStats={qualityStats}
      />
    );
    expect(screen.getByText("Entry text 0")).toBeInTheDocument();
  });
});
