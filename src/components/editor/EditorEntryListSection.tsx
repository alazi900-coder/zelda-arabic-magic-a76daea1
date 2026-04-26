import React from "react";
import DiffView from "@/components/editor/DiffView";
import PaginationControls from "@/components/editor/PaginationControls";
import VirtualizedEntryList from "@/components/editor/VirtualizedEntryList";
import { PAGE_SIZE } from "@/components/editor/types";
import type { ExtractedEntry } from "@/components/editor/types";
import type { useEditorState } from "@/hooks/useEditorState";
import type { useTranslationMemory } from "@/hooks/useTranslationMemory";

type EditorSubset = Pick<
  ReturnType<typeof useEditorState>,
  | "state"
  | "filteredEntries"
  | "paginatedEntries"
  | "currentPage"
  | "totalPages"
  | "setCurrentPage"
  | "qualityStats"
  | "activeGlossary"
  | "translatingSingle"
  | "improvingTranslations"
  | "previousTranslations"
  | "isTranslationTooShort"
  | "isTranslationTooLong"
  | "hasStuckChars"
  | "isMixedLanguage"
  | "updateTranslation"
  | "handleTranslateSingle"
  | "handleImproveSingleTranslation"
  | "handleUndoTranslation"
  | "handleFixReversed"
  | "handleLocalFixDamagedTag"
  | "handleAcceptFuzzy"
  | "handleRejectFuzzy"
  | "handleSplitSingleEntry"
>;

interface EditorEntryListSectionProps {
  editor: EditorSubset;
  isMobile: boolean;
  showDiffView: boolean;
  setShowDiffView: (v: boolean) => void;
  setCompareEntry: (e: ExtractedEntry | null) => void;
  findSimilar: ReturnType<typeof useTranslationMemory>["findSimilar"];
}

const EditorEntryListSection: React.FC<EditorEntryListSectionProps> = ({
  editor,
  isMobile,
  showDiffView,
  setShowDiffView,
  setCompareEntry,
  findSimilar,
}) => (
  <>
    {/* Diff View */}
    {showDiffView && editor.state && (
      <DiffView
        entries={editor.filteredEntries}
        translations={editor.state.translations}
        onClose={() => setShowDiffView(false)}
      />
    )}

    {/* Entries Count */}
    {editor.filteredEntries.length > 0 && (
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">
          {editor.filteredEntries.length} نص
        </p>
        <PaginationControls currentPage={editor.currentPage} totalPages={editor.totalPages} totalItems={editor.filteredEntries.length} pageSize={PAGE_SIZE} setCurrentPage={editor.setCurrentPage} />
      </div>
    )}

    {/* Virtualized Entries List */}
    {editor.filteredEntries.length === 0 ? (
      <p className="text-center text-muted-foreground py-8">لا توجد نصوص مطابقة</p>
    ) : editor.state ? (
      <VirtualizedEntryList
        entries={editor.paginatedEntries}
        state={editor.state}
        qualityStats={editor.qualityStats}
        activeGlossary={editor.activeGlossary}
        isMobile={isMobile}
        translatingSingle={editor.translatingSingle}
        improvingTranslations={editor.improvingTranslations}
        previousTranslations={editor.previousTranslations}
        isTranslationTooShort={editor.isTranslationTooShort}
        isTranslationTooLong={editor.isTranslationTooLong}
        hasStuckChars={editor.hasStuckChars}
        isMixedLanguage={editor.isMixedLanguage}
        updateTranslation={editor.updateTranslation}
        handleTranslateSingle={editor.handleTranslateSingle}
        handleImproveSingleTranslation={editor.handleImproveSingleTranslation}
        handleUndoTranslation={editor.handleUndoTranslation}
        handleFixReversed={editor.handleFixReversed}
        handleLocalFixDamagedTag={editor.handleLocalFixDamagedTag}
        onAcceptFuzzy={editor.handleAcceptFuzzy}
        onRejectFuzzy={editor.handleRejectFuzzy}
        onCompare={(entry) => setCompareEntry(entry)}
        onSplitNewline={editor.handleSplitSingleEntry}
        findSimilar={findSimilar}
        height={Math.max(400, window.innerHeight - 300)}
      />
    ) : null}

    {/* Pagination Footer */}
    <PaginationControls currentPage={editor.currentPage} totalPages={editor.totalPages} totalItems={editor.filteredEntries.length} pageSize={PAGE_SIZE} setCurrentPage={editor.setCurrentPage} />
  </>
);

export default EditorEntryListSection;
