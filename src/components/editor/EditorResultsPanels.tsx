import React from "react";
import ReviewPanel from "@/components/editor/ReviewPanel";
import ConsistencyResultsPanel from "@/components/editor/ConsistencyResultsPanel";
import NewlineCleanPanel from "@/components/editor/NewlineCleanPanel";
import DiacriticsCleanPanel from "@/components/editor/DiacriticsCleanPanel";
import ArabicTextFixPanel from "@/components/editor/ArabicTextFixPanel";
import MirrorCharsCleanPanel from "@/components/editor/MirrorCharsCleanPanel";
import TagBracketFixPanel from "@/components/editor/TagBracketFixPanel";
import NewlineSplitPanel from "@/components/editor/NewlineSplitPanel";
import type { useEditorState } from "@/hooks/useEditorState";

type EditorSubset = Pick<
  ReturnType<typeof useEditorState>,
  // Review
  | "reviewResults" | "shortSuggestions" | "improveResults" | "suggestingShort"
  | "filterCategory" | "filterFile" | "filterStatus" | "search"
  | "handleSuggestShorterTranslations" | "handleApplyShorterTranslation"
  | "handleApplyAllShorterTranslations" | "handleApplyImprovement" | "handleApplyAllImprovements"
  | "setReviewResults" | "setShortSuggestions" | "setImproveResults"
  // Consistency
  | "consistencyResults" | "handleApplyConsistencyFix" | "handleApplyAllConsistencyFixes" | "setConsistencyResults"
  // Newline Clean
  | "newlineCleanResults" | "handleApplyNewlineClean" | "handleRejectNewlineClean"
  | "handleApplyAllNewlineCleans" | "setNewlineCleanResults"
  // Diacritics
  | "diacriticsCleanResults" | "handleApplyDiacriticsClean" | "handleRejectDiacriticsClean"
  | "handleApplyAllDiacriticsCleans" | "setDiacriticsCleanResults"
  // Arabic Text Fix
  | "arabicTextFixResults" | "handleApplyArabicTextFix" | "handleRejectArabicTextFix"
  | "handleApplyAllArabicTextFixes" | "setArabicTextFixResults"
  // Mirror Chars
  | "mirrorCharsResults" | "handleApplyMirrorCharsClean" | "handleRejectMirrorCharsClean"
  | "handleApplyAllMirrorCharsCleans" | "setMirrorCharsResults"
  // Tag Bracket
  | "tagBracketFixResults" | "handleApplyTagBracketFix" | "handleRejectTagBracketFix"
  | "handleApplyAllTagBracketFixes" | "setTagBracketFixResults"
  // Unified Split
  | "unifiedSplitResults" | "handleApplyUnifiedSplit" | "handleRejectUnifiedSplit"
  | "handleApplyAllUnifiedSplits" | "setUnifiedSplitResults"
  | "newlineSplitCharLimit" | "setNewlineSplitCharLimit" | "handleScanAllSplits"
>;

interface EditorResultsPanelsProps {
  editor: EditorSubset;
}

const EditorResultsPanels: React.FC<EditorResultsPanelsProps> = ({ editor }) => (
  <>
    {/* Review Results */}
    <ReviewPanel
      reviewResults={editor.reviewResults}
      shortSuggestions={editor.shortSuggestions}
      improveResults={editor.improveResults}
      suggestingShort={editor.suggestingShort}
      filterCategory={editor.filterCategory}
      filterFile={editor.filterFile}
      filterStatus={editor.filterStatus}
      search={editor.search}
      handleSuggestShorterTranslations={editor.handleSuggestShorterTranslations}
      handleApplyShorterTranslation={editor.handleApplyShorterTranslation}
      handleApplyAllShorterTranslations={editor.handleApplyAllShorterTranslations}
      handleApplyImprovement={editor.handleApplyImprovement}
      handleApplyAllImprovements={editor.handleApplyAllImprovements}
      setReviewResults={editor.setReviewResults}
      setShortSuggestions={editor.setShortSuggestions}
      setImproveResults={editor.setImproveResults}
    />

    {/* Consistency Results */}
    {editor.consistencyResults && editor.consistencyResults.groups.length > 0 && (
      <ConsistencyResultsPanel
        results={editor.consistencyResults}
        onApplyFix={editor.handleApplyConsistencyFix}
        onApplyAll={editor.handleApplyAllConsistencyFixes}
        onClose={() => editor.setConsistencyResults(null)}
      />
    )}

    {/* Newline Clean Results */}
    {editor.newlineCleanResults && editor.newlineCleanResults.length > 0 && (
      <NewlineCleanPanel
        results={editor.newlineCleanResults}
        onAccept={editor.handleApplyNewlineClean}
        onReject={editor.handleRejectNewlineClean}
        onAcceptAll={editor.handleApplyAllNewlineCleans}
        onClose={() => editor.setNewlineCleanResults(null)}
      />
    )}

    {/* Diacritics Clean Results */}
    {editor.diacriticsCleanResults && editor.diacriticsCleanResults.length > 0 && (
      <DiacriticsCleanPanel
        results={editor.diacriticsCleanResults}
        onAccept={editor.handleApplyDiacriticsClean}
        onReject={editor.handleRejectDiacriticsClean}
        onAcceptAll={editor.handleApplyAllDiacriticsCleans}
        onClose={() => editor.setDiacriticsCleanResults(null)}
      />
    )}

    {/* Arabic Text Fix Results */}
    {editor.arabicTextFixResults && editor.arabicTextFixResults.length > 0 && (
      <ArabicTextFixPanel
        results={editor.arabicTextFixResults}
        onAccept={editor.handleApplyArabicTextFix}
        onReject={editor.handleRejectArabicTextFix}
        onAcceptAll={editor.handleApplyAllArabicTextFixes}
        onClose={() => editor.setArabicTextFixResults(null)}
      />
    )}

    {/* Mirror Chars Clean Results */}
    {editor.mirrorCharsResults && editor.mirrorCharsResults.length > 0 && (
      <MirrorCharsCleanPanel
        results={editor.mirrorCharsResults}
        onAccept={editor.handleApplyMirrorCharsClean}
        onReject={editor.handleRejectMirrorCharsClean}
        onAcceptAll={editor.handleApplyAllMirrorCharsCleans}
        onClose={() => editor.setMirrorCharsResults(null)}
      />
    )}

    {/* Tag Bracket Fix Results */}
    {editor.tagBracketFixResults && editor.tagBracketFixResults.length > 0 && (
      <TagBracketFixPanel
        results={editor.tagBracketFixResults}
        onAccept={editor.handleApplyTagBracketFix}
        onReject={editor.handleRejectTagBracketFix}
        onAcceptAll={editor.handleApplyAllTagBracketFixes}
        onClose={() => editor.setTagBracketFixResults(null)}
      />
    )}

    {/* Unified Split Results */}
    {editor.unifiedSplitResults && editor.unifiedSplitResults.length > 0 && (
      <NewlineSplitPanel
        results={editor.unifiedSplitResults}
        onAccept={editor.handleApplyUnifiedSplit}
        onReject={editor.handleRejectUnifiedSplit}
        onAcceptAll={editor.handleApplyAllUnifiedSplits}
        onClose={() => editor.setUnifiedSplitResults(null)}
        charLimit={editor.newlineSplitCharLimit}
        onCharLimitChange={editor.setNewlineSplitCharLimit}
        onRescan={editor.handleScanAllSplits}
        title="✂️ تقسيم ومزامنة الأسطر (كل الملفات)"
      />
    )}
  </>
);

export default EditorResultsPanels;
