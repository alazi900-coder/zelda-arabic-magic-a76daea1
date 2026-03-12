import { useState, useRef } from "react";
import type { ReviewResults, ShortSuggestion, ImproveResult } from "@/components/editor/types";

/** All scan/analysis result states — isolated to reduce useState clutter in useEditorState */
export function useEditorScanResults() {
  // === Review & suggestion states ===
  const [reviewing, setReviewing] = useState(false);
  const [reviewResults, setReviewResults] = useState<ReviewResults | null>(null);
  const [suggestingShort, setSuggestingShort] = useState(false);
  const [shortSuggestions, setShortSuggestions] = useState<ShortSuggestion[] | null>(null);
  const [improvingTranslations, setImprovingTranslations] = useState(false);
  const [improveResults, setImproveResults] = useState<ImproveResult[] | null>(null);
  const [fixingMixed, setFixingMixed] = useState(false);

  // === Consistency ===
  const [checkingConsistency, setCheckingConsistency] = useState(false);
  const [consistencyResults, setConsistencyResults] = useState<{ groups: any[]; aiSuggestions: { best: string; reason: string }[] } | null>(null);

  // === Text cleanup scan results ===
  const [scanningSentences, setScanningSentences] = useState(false);
  const [sentenceSplitResults, setSentenceSplitResults] = useState<import("@/lib/arabic-sentence-splitter").SentenceSplitResult[] | null>(null);
  const [newlineCleanResults, setNewlineCleanResults] = useState<import("@/components/editor/NewlineCleanPanel").NewlineCleanResult[] | null>(null);
  const [diacriticsCleanResults, setDiacriticsCleanResults] = useState<import("@/components/editor/DiacriticsCleanPanel").DiacriticsCleanResult[] | null>(null);
  const [duplicateAlefResults, setDuplicateAlefResults] = useState<import("@/components/editor/DuplicateAlefCleanPanel").DuplicateAlefResult[] | null>(null);
  const [mirrorCharsResults, setMirrorCharsResults] = useState<import("@/components/editor/MirrorCharsCleanPanel").MirrorCharsResult[] | null>(null);
  const [tagBracketFixResults, setTagBracketFixResults] = useState<import("@/components/editor/TagBracketFixPanel").TagBracketFixResult[] | null>(null);
  const [arabicTextFixResults, setArabicTextFixResults] = useState<import("@/lib/arabic-text-fixes").TextFixResult[] | null>(null);
  const [newlineSplitResults, setNewlineSplitResults] = useState<import("@/components/editor/NewlineSplitPanel").NewlineSplitResult[] | null>(null);
  const [npcSplitResults, setNpcSplitResults] = useState<import("@/components/editor/NewlineSplitPanel").NewlineSplitResult[] | null>(null);
  const [lineSyncResults, setLineSyncResults] = useState<import("@/components/editor/NewlineSplitPanel").NewlineSplitResult[] | null>(null);
  const [unifiedSplitResults, setUnifiedSplitResults] = useState<import("@/components/editor/NewlineSplitPanel").NewlineSplitResult[] | null>(null);
  const [sentenceOrderResults, setSentenceOrderResults] = useState<import("@/components/editor/SentenceOrderPanel").SentenceOrderResult[] | null>(null);

  // === Smart review ===
  const [smartReviewFindings, setSmartReviewFindings] = useState<import("@/components/editor/SmartReviewPanel").SmartReviewFinding[] | null>(null);
  const [smartReviewing, setSmartReviewing] = useState(false);

  // === Glossary compliance ===
  const [glossaryComplianceResults, setGlossaryComplianceResults] = useState<import("@/components/editor/GlossaryCompliancePanel").GlossaryViolation[] | null>(null);
  const [checkingGlossaryCompliance, setCheckingGlossaryCompliance] = useState(false);

  // === Enhance ===
  const [enhanceResults, setEnhanceResults] = useState<import("@/components/editor/TranslationEnhancePanel").EnhanceResult[] | null>(null);
  const [enhancingTranslations, setEnhancingTranslations] = useState(false);

  // === Advanced Analysis ===
  const [advancedAnalysisTab, setAdvancedAnalysisTab] = useState<import("@/components/editor/AdvancedTranslationPanel").AnalysisAction>('full-analysis');
  const [literalResults, setLiteralResults] = useState<import("@/components/editor/AdvancedTranslationPanel").LiteralResult[] | null>(null);
  const [styleResults, setStyleResults] = useState<import("@/components/editor/AdvancedTranslationPanel").StyleResult[] | null>(null);
  const [consistencyCheckResult, setConsistencyCheckResult] = useState<import("@/components/editor/AdvancedTranslationPanel").ConsistencyResult | null>(null);
  const [alternativeResults, setAlternativeResults] = useState<import("@/components/editor/AdvancedTranslationPanel").AlternativeResult[] | null>(null);
  const [fullAnalysisResults, setFullAnalysisResults] = useState<import("@/components/editor/AdvancedTranslationPanel").FullAnalysisResult[] | null>(null);
  const [advancedAnalyzing, setAdvancedAnalyzing] = useState(false);
  const advancedAnalysisCancelRef = useRef(false);

  // === Auto-correct ===
  const [autoCorrectResults, setAutoCorrectResults] = useState<{ key: string; original: string; current: string; corrected: string }[] | null>(null);
  const [autoCorrectApplied, setAutoCorrectApplied] = useState(false);
  const [autoCorrectProgress, setAutoCorrectProgress] = useState<{ current: number; total: number } | null>(null);
  const autoCorrectAbortRef = useRef<AbortController | null>(null);

  // === Weak translations ===
  const [weakTranslations, setWeakTranslations] = useState<{ key: string; original: string; current: string; score: number; reason: string; suggestion: string }[] | null>(null);
  const [detectingWeak, setDetectingWeak] = useState(false);
  const [detectWeakProgress, setDetectWeakProgress] = useState<{ current: number; total: number } | null>(null);
  const detectWeakAbortRef = useRef<AbortController | null>(null);

  return {
    reviewing, setReviewing,
    reviewResults, setReviewResults,
    suggestingShort, setSuggestingShort,
    shortSuggestions, setShortSuggestions,
    improvingTranslations, setImprovingTranslations,
    improveResults, setImproveResults,
    fixingMixed, setFixingMixed,
    checkingConsistency, setCheckingConsistency,
    consistencyResults, setConsistencyResults,
    scanningSentences, setScanningSentences,
    sentenceSplitResults, setSentenceSplitResults,
    newlineCleanResults, setNewlineCleanResults,
    diacriticsCleanResults, setDiacriticsCleanResults,
    duplicateAlefResults, setDuplicateAlefResults,
    mirrorCharsResults, setMirrorCharsResults,
    tagBracketFixResults, setTagBracketFixResults,
    arabicTextFixResults, setArabicTextFixResults,
    newlineSplitResults, setNewlineSplitResults,
    npcSplitResults, setNpcSplitResults,
    lineSyncResults, setLineSyncResults,
    unifiedSplitResults, setUnifiedSplitResults,
    sentenceOrderResults, setSentenceOrderResults,
    smartReviewFindings, setSmartReviewFindings,
    smartReviewing, setSmartReviewing,
    glossaryComplianceResults, setGlossaryComplianceResults,
    checkingGlossaryCompliance, setCheckingGlossaryCompliance,
    enhanceResults, setEnhanceResults,
    enhancingTranslations, setEnhancingTranslations,
    advancedAnalysisTab, setAdvancedAnalysisTab,
    literalResults, setLiteralResults,
    styleResults, setStyleResults,
    consistencyCheckResult, setConsistencyCheckResult,
    alternativeResults, setAlternativeResults,
    fullAnalysisResults, setFullAnalysisResults,
    advancedAnalyzing, setAdvancedAnalyzing,
    advancedAnalysisCancelRef,
    autoCorrectResults, setAutoCorrectResults,
    autoCorrectApplied, setAutoCorrectApplied,
    autoCorrectProgress, setAutoCorrectProgress,
    autoCorrectAbortRef,
    weakTranslations, setWeakTranslations,
    detectingWeak, setDetectingWeak,
    detectWeakProgress, setDetectWeakProgress,
    detectWeakAbortRef,
  };
}
