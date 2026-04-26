import React from "react";
import NewlineSplitPanel from "@/components/editor/NewlineSplitPanel";
import SmartReviewPanel from "@/components/editor/SmartReviewPanel";
import TranslationEnhancePanel from "@/components/editor/TranslationEnhancePanel";
import GlossaryCompliancePanel from "@/components/editor/GlossaryCompliancePanel";
import AdvancedTranslationPanel from "@/components/editor/AdvancedTranslationPanel";
import TagRepairPanel from "@/components/editor/TagRepairPanel";
import MergeToBundledPanel from "@/components/editor/MergeToBundledPanel";
import type { useEditorState } from "@/hooks/useEditorState";

type EditorSubset = Pick<
  ReturnType<typeof useEditorState>,
  | "state"
  // Newline split legacy
  | "newlineSplitResults" | "handleApplyNewlineSplit" | "handleRejectNewlineSplit"
  | "handleApplyAllNewlineSplits" | "setNewlineSplitResults"
  | "newlineSplitCharLimit" | "setNewlineSplitCharLimit" | "handleScanNewlineSplit"
  // NPC split
  | "npcSplitResults" | "handleApplyNpcSplit" | "handleRejectNpcSplit"
  | "handleApplyAllNpcSplits" | "setNpcSplitResults"
  | "npcSplitCharLimit" | "setNpcSplitCharLimit" | "handleScanNpcSplit"
  // Line sync
  | "lineSyncResults" | "handleApplyLineSync" | "handleRejectLineSync"
  | "handleApplyAllLineSyncs" | "setLineSyncResults" | "handleScanLineSync"
  // Smart review
  | "smartReviewFindings" | "handleApplySmartFix" | "handleApplyAllSmartFixes"
  | "handleDismissSmartFinding" | "setSmartReviewFindings"
  // Weak translations
  | "weakTranslations" | "handleApplyWeakFix" | "handleApplyAllWeakFixes" | "setWeakTranslations"
  // Enhance
  | "enhanceResults" | "handleApplyEnhanceSuggestion" | "handleApplyAllEnhanceSuggestions"
  | "handleCloseEnhanceResults" | "enhancingTranslations"
  // Glossary compliance
  | "glossaryComplianceResults" | "handleApplyGlossaryFix"
  | "handleApplyAllGlossaryFixes" | "setGlossaryComplianceResults"
  // Advanced analysis
  | "literalResults" | "styleResults" | "consistencyCheckResult" | "alternativeResults" | "fullAnalysisResults"
  | "advancedAnalysisTab" | "advancedAnalyzing" | "handleApplyAdvancedSuggestion"
  | "handleApplyAllAdvanced" | "handleCloseAdvancedPanel" | "setAdvancedAnalysisTab"
  | "saveToEnhancedMemory" | "handleStopAdvancedAnalysis"
  // Tag repair
  | "qualityStats" | "handleLocalFixSelectedTags"
  // Merge to bundled
  | "mergeToBundledItems" | "handleMergeToBundledAccept" | "handleMergeToBundledReject"
  | "handleMergeToBundledAcceptAll" | "handleMergeToBundledRejectAll"
  | "setMergeToBundledItems" | "handleMergeToBundledDownload"
>;

interface EditorLegacyPanelsProps {
  editor: EditorSubset;
  showTagRepair: boolean;
  setShowTagRepair: (v: boolean) => void;
}

const EditorLegacyPanels: React.FC<EditorLegacyPanelsProps> = ({
  editor,
  showTagRepair,
  setShowTagRepair,
}) => (
  <>
    {/* Legacy panels kept for individual tool usage */}
    {editor.newlineSplitResults && editor.newlineSplitResults.length > 0 && (
      <NewlineSplitPanel
        results={editor.newlineSplitResults}
        onAccept={editor.handleApplyNewlineSplit}
        onReject={editor.handleRejectNewlineSplit}
        onAcceptAll={editor.handleApplyAllNewlineSplits}
        onClose={() => editor.setNewlineSplitResults(null)}
        charLimit={editor.newlineSplitCharLimit}
        onCharLimitChange={editor.setNewlineSplitCharLimit}
        onRescan={editor.handleScanNewlineSplit}
      />
    )}

    {editor.npcSplitResults && editor.npcSplitResults.length > 0 && (
      <NewlineSplitPanel
        results={editor.npcSplitResults}
        onAccept={editor.handleApplyNpcSplit}
        onReject={editor.handleRejectNpcSplit}
        onAcceptAll={editor.handleApplyAllNpcSplits}
        onClose={() => editor.setNpcSplitResults(null)}
        charLimit={editor.npcSplitCharLimit}
        onCharLimitChange={editor.setNpcSplitCharLimit}
        onRescan={editor.handleScanNpcSplit}
        title="💬 تقسيم محادثات NPC"
      />
    )}

    {editor.lineSyncResults && editor.lineSyncResults.length > 0 && (
      <NewlineSplitPanel
        results={editor.lineSyncResults}
        onAccept={editor.handleApplyLineSync}
        onReject={editor.handleRejectLineSync}
        onAcceptAll={editor.handleApplyAllLineSyncs}
        onClose={() => editor.setLineSyncResults(null)}
        charLimit={editor.npcSplitCharLimit}
        onCharLimitChange={editor.setNpcSplitCharLimit}
        onRescan={editor.handleScanLineSync}
        title="🔄 مزامنة الأسطر (كل الملفات)"
      />
    )}

    {/* Smart Review Panel */}
    {editor.smartReviewFindings && editor.smartReviewFindings.length > 0 && (
      <SmartReviewPanel
        findings={editor.smartReviewFindings}
        onApply={editor.handleApplySmartFix}
        onApplyAll={editor.handleApplyAllSmartFixes}
        onDismiss={editor.handleDismissSmartFinding}
        onClose={() => editor.setSmartReviewFindings(null)}
      />
    )}

    {/* Weak Translations Panel */}
    {editor.weakTranslations && editor.weakTranslations.length > 0 && (
      <SmartReviewPanel
        findings={editor.weakTranslations.map(w => ({
          key: w.key,
          original: w.original,
          current: w.current,
          type: 'naturalness' as const,
          issue: `درجة ${w.score}/10 — ${w.reason}`,
          fix: w.suggestion,
        }))}
        onApply={(key, fix) => editor.handleApplyWeakFix(key, fix)}
        onApplyAll={editor.handleApplyAllWeakFixes}
        onDismiss={() => {}}
        onClose={() => editor.setWeakTranslations(null)}
      />
    )}

    {/* Translation Enhancement Panel */}
    {editor.enhanceResults && editor.enhanceResults.length > 0 && (
      <TranslationEnhancePanel
        results={editor.enhanceResults}
        onApplySuggestion={editor.handleApplyEnhanceSuggestion}
        onApplyAll={editor.handleApplyAllEnhanceSuggestions}
        onClose={editor.handleCloseEnhanceResults}
        analyzing={editor.enhancingTranslations}
      />
    )}

    {/* Glossary Compliance Panel */}
    {editor.glossaryComplianceResults && editor.glossaryComplianceResults.length > 0 && (
      <GlossaryCompliancePanel
        violations={editor.glossaryComplianceResults}
        onApplyFix={editor.handleApplyGlossaryFix}
        onApplyAll={editor.handleApplyAllGlossaryFixes}
        onClose={() => editor.setGlossaryComplianceResults(null)}
      />
    )}

    {/* Advanced Translation Analysis Panel */}
    {(editor.literalResults || editor.styleResults || editor.consistencyCheckResult || editor.alternativeResults || editor.fullAnalysisResults) && (
      <AdvancedTranslationPanel
        activeTab={editor.advancedAnalysisTab}
        literalResults={editor.literalResults}
        styleResults={editor.styleResults}
        consistencyResult={editor.consistencyCheckResult}
        alternativeResults={editor.alternativeResults}
        fullResults={editor.fullAnalysisResults}
        analyzing={editor.advancedAnalyzing}
        onApply={editor.handleApplyAdvancedSuggestion}
        onApplyAll={editor.handleApplyAllAdvanced}
        onClose={editor.handleCloseAdvancedPanel}
        onTabChange={(tab) => editor.setAdvancedAnalysisTab(tab)}
        onSaveToMemory={editor.saveToEnhancedMemory}
        onStop={editor.handleStopAdvancedAnalysis}
      />
    )}

    {showTagRepair && editor.state && (
      <TagRepairPanel
        entries={editor.state.entries}
        translations={editor.state.translations}
        damagedTagKeys={editor.qualityStats.damagedTagKeys}
        onApplySelected={(keys) => editor.handleLocalFixSelectedTags(keys)}
        onClose={() => setShowTagRepair(false)}
      />
    )}

    {/* Merge to Bundled Panel */}
    {editor.mergeToBundledItems && editor.mergeToBundledItems.length > 0 && (
      <MergeToBundledPanel
        items={editor.mergeToBundledItems}
        onAccept={editor.handleMergeToBundledAccept}
        onReject={editor.handleMergeToBundledReject}
        onAcceptAll={editor.handleMergeToBundledAcceptAll}
        onRejectAll={editor.handleMergeToBundledRejectAll}
        onClose={() => editor.setMergeToBundledItems(null)}
        onDownload={editor.handleMergeToBundledDownload}
      />
    )}
  </>
);

export default EditorLegacyPanels;
