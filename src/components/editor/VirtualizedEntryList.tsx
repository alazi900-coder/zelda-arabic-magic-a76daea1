import React, { useCallback, useRef, useEffect } from "react";
import { VariableSizeList as VList } from "react-window";
import type { ExtractedEntry } from "./types";
import EntryCard from "./EntryCard";
import type { TMSuggestion } from "@/hooks/useTranslationMemory";

interface VirtualizedEntryListProps {
  entries: ExtractedEntry[];
  state: {
    translations: Record<string, string>;
    protectedEntries?: Set<string>;
    fuzzyScores?: Record<string, number>;
  };
  qualityStats: {
    problemKeys: Set<string>;
    damagedTagKeys: Set<string>;
  };
  activeGlossary: string;
  isMobile: boolean;
  translatingSingle: string | null;
  improvingTranslations: boolean;
  previousTranslations: Record<string, string>;
  isTranslationTooShort: (e: ExtractedEntry, t: string) => boolean;
  isTranslationTooLong: (e: ExtractedEntry, t: string) => boolean;
  hasStuckChars: (t: string) => boolean;
  isMixedLanguage: (t: string) => boolean;
  updateTranslation: (key: string, value: string) => void;
  handleTranslateSingle: (entry: ExtractedEntry) => void;
  handleImproveSingleTranslation: (entry: ExtractedEntry) => void;
  handleUndoTranslation: (key: string) => void;
  handleFixReversed: (entry: ExtractedEntry) => void;
  handleLocalFixDamagedTag: (entry: ExtractedEntry) => void;
  onAcceptFuzzy: (key: string) => void;
  onRejectFuzzy: (key: string) => void;
  onCompare: (entry: ExtractedEntry) => void;
  onSplitNewline: (key: string) => void;
  findSimilar: (key: string, original: string) => TMSuggestion[];
  height?: number;
}

const ESTIMATED_ITEM_SIZE = 280;

const VirtualizedEntryList = React.memo(({
  entries,
  state,
  qualityStats,
  activeGlossary,
  isMobile,
  translatingSingle,
  improvingTranslations,
  previousTranslations,
  isTranslationTooShort,
  isTranslationTooLong,
  hasStuckChars,
  isMixedLanguage,
  updateTranslation,
  handleTranslateSingle,
  handleImproveSingleTranslation,
  handleUndoTranslation,
  handleFixReversed,
  handleLocalFixDamagedTag,
  onAcceptFuzzy,
  onRejectFuzzy,
  onCompare,
  onSplitNewline,
  findSimilar,
  height = 600,
}: VirtualizedEntryListProps) => {
  const listRef = useRef<VList>(null);
  const rowHeights = useRef<Record<number, number>>({});

  const getItemSize = useCallback((index: number) => {
    return rowHeights.current[index] || ESTIMATED_ITEM_SIZE;
  }, []);

  const setRowHeight = useCallback((index: number, size: number) => {
    if (rowHeights.current[index] !== size) {
      rowHeights.current[index] = size;
      listRef.current?.resetAfterIndex(index, false);
    }
  }, []);

  useEffect(() => {
    rowHeights.current = {};
    listRef.current?.resetAfterIndex(0, true);
  }, [entries]);

  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const entry = entries[index];
    const key = `${entry.msbtFile}:${entry.index}`;

    return (
      <div style={{ ...style, paddingBottom: 8 }}>
        <RowMeasurer index={index} onHeight={setRowHeight}>
          <EntryCard
            entry={entry}
            translation={state.translations[key] || ''}
            glossary={activeGlossary}
            isProtected={state.protectedEntries?.has(key) || false}
            hasProblem={qualityStats.problemKeys.has(key)}
            isDamagedTag={qualityStats.damagedTagKeys.has(key)}
            fuzzyScore={state.fuzzyScores?.[key]}
            isMobile={isMobile}
            translatingSingle={translatingSingle}
            improvingTranslations={improvingTranslations}
            previousTranslations={previousTranslations}
            isTranslationTooShort={isTranslationTooShort}
            isTranslationTooLong={isTranslationTooLong}
            hasStuckChars={hasStuckChars}
            isMixedLanguage={isMixedLanguage}
            updateTranslation={updateTranslation}
            handleTranslateSingle={handleTranslateSingle}
            handleImproveSingleTranslation={handleImproveSingleTranslation}
            handleUndoTranslation={handleUndoTranslation}
            handleFixReversed={handleFixReversed}
            handleLocalFixDamagedTag={handleLocalFixDamagedTag}
            onAcceptFuzzy={onAcceptFuzzy}
            onRejectFuzzy={onRejectFuzzy}
            onCompare={onCompare}
            onSplitNewline={onSplitNewline}
            tmSuggestions={findSimilar(key, entry.original)}
          />
        </RowMeasurer>
      </div>
    );
  }, [entries, state, qualityStats, activeGlossary, isMobile, translatingSingle, improvingTranslations, previousTranslations, isTranslationTooShort, isTranslationTooLong, hasStuckChars, isMixedLanguage, updateTranslation, handleTranslateSingle, handleImproveSingleTranslation, handleUndoTranslation, handleFixReversed, handleLocalFixDamagedTag, onAcceptFuzzy, onRejectFuzzy, onCompare, onSplitNewline, findSimilar, setRowHeight]);

  return (
    <List
      ref={listRef}
      height={height}
      itemCount={entries.length}
      itemSize={getItemSize}
      estimatedItemSize={ESTIMATED_ITEM_SIZE}
      width="100%"
      overscanCount={3}
    >
      {Row}
    </List>
  );
});

VirtualizedEntryList.displayName = "VirtualizedEntryList";

function RowMeasurer({ index, onHeight, children }: { index: number; onHeight: (index: number, height: number) => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      const h = ref.current.getBoundingClientRect().height;
      onHeight(index, h + 8);
    }
  });

  return <div ref={ref}>{children}</div>;
}

export default VirtualizedEntryList;
