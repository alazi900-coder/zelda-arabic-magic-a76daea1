import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEditorReview } from '@/hooks/useEditorReview';
import type { EditorState, ExtractedEntry } from '@/components/editor/types';

function makeState(translations: Record<string, string>): EditorState {
  const entries: ExtractedEntry[] = Object.keys(translations).map(key => {
    const [msbtFile, idx] = key.split(':');
    return { msbtFile, index: Number(idx), original: 'Hello world', label: key, maxBytes: 0 };
  });
  return {
    entries,
    translations,
    fileName: 'test.json',
    originalFile: null,
    bdatOriginalFile: null,
    bdatTables: null,
    bdatOriginalBytes: null,
  } as EditorState;
}

function createMockParams(state?: EditorState | null) {
  const noop = vi.fn();
  return {
    state: state ?? null,
    setState: vi.fn(),
    setTranslateProgress: noop,
    setLastSaved: noop,
    setPreviousTranslations: noop,
    filteredEntries: state?.entries || [],
    activeGlossary: '',
    aiModel: 'google/gemini-2.5-flash',
    setReviewing: noop,
    setReviewResults: noop,
    setSuggestingShort: noop,
    setShortSuggestions: noop,
    setImprovingTranslations: noop,
    setImproveResults: noop,
    setFixingMixed: noop,
    setCheckingConsistency: noop,
    setConsistencyResults: noop,
    setSmartReviewing: noop,
    setSmartReviewFindings: noop,
    setEnhancingTranslations: noop,
    setEnhanceResults: noop,
    setAdvancedAnalyzing: noop,
    setAdvancedAnalysisTab: noop,
    setLiteralResults: noop,
    setStyleResults: noop,
    setConsistencyCheckResult: noop,
    setAlternativeResults: noop,
    setFullAnalysisResults: noop,
    advancedAnalysisCancelRef: { current: false },
    setAutoCorrectResults: noop,
    setAutoCorrectApplied: noop,
    setAutoCorrectProgress: noop,
    autoCorrectAbortRef: { current: null },
    setWeakTranslations: noop,
    setDetectingWeak: noop,
    setDetectWeakProgress: noop,
    detectWeakAbortRef: { current: null },
    reviewedKeysRef: { current: new Set<string>() },
    addReviewedKeys: noop,
    reviewResults: null,
    shortSuggestions: null,
    improveResults: null,
    consistencyResults: null,
    smartReviewFindings: null,
    enhanceResults: null,
    literalResults: null,
    styleResults: null,
    alternativeResults: null,
    fullAnalysisResults: null,
    weakTranslations: null,
    isMixedLanguage: (text: string) => /[a-zA-Z]/.test(text) && /[\u0600-\u06FF]/.test(text),
  };
}

describe('useEditorReview', () => {
  describe('return value completeness', () => {
    it('should return all expected handler functions', () => {
      const params = createMockParams(makeState({ 'file:0': 'مرحبا' }));
      const { result } = renderHook(() => useEditorReview(params));

      const expectedHandlers = [
        'handleReviewTranslations',
        'handleSuggestShorterTranslations',
        'handleApplyShorterTranslation',
        'handleApplyAllShorterTranslations',
        'handleFixAllStuckCharacters',
        'handleFixMixedLanguage',
        'handleSmartReview',
        'handleApplySmartFix',
        'handleApplyAllSmartFixes',
        'handleDismissSmartFinding',
        'handleGrammarCheck',
        'handleContextReview',
        'handleAutoCorrect',
        'handleStopAutoCorrect',
        'handleDetectWeak',
        'handleStopDetectWeak',
        'handleApplyWeakFix',
        'handleApplyAllWeakFixes',
        'handleContextRetranslate',
        'handleEnhanceTranslations',
        'handleApplyEnhanceSuggestion',
        'handleApplyAllEnhanceSuggestions',
        'handleCloseEnhanceResults',
        'handleAdvancedAnalysis',
        'handleApplyAdvancedSuggestion',
        'handleApplyAllAdvanced',
        'handleStopAdvancedAnalysis',
        'handleCloseAdvancedPanel',
        'handleImproveTranslations',
        'handleApplyImprovement',
        'handleApplyAllImprovements',
        'handleImproveSingleTranslation',
        'handleCheckConsistency',
        'handleApplyConsistencyFix',
        'handleApplyAllConsistencyFixes',
      ];

      for (const name of expectedHandlers) {
        expect(typeof result.current[name as keyof typeof result.current]).toBe('function');
      }
    });
  });

  describe('handleFixAllStuckCharacters', () => {
    it('should fix stuck characters in translations', () => {
      const state = makeState({ 'file:0': 'مرحباworld' });
      const params = createMockParams(state);
      const { result } = renderHook(() => useEditorReview(params));

      // handleFixAllStuckCharacters modifies state via setState
      result.current.handleFixAllStuckCharacters();

      // Should have called setState
      expect(params.setState).toHaveBeenCalled();
    });
  });

  describe('handleApplyAllShorterTranslations', () => {
    it('should apply short suggestions to state', () => {
      const state = makeState({ 'file:0': 'ترجمة طويلة جداً' });
      const params = createMockParams(state);
      params.shortSuggestions = [{ key: 'file:0', original: 'Long text', current: 'ترجمة طويلة جداً', suggestion: 'ترجمة قصيرة' }];
      const { result } = renderHook(() => useEditorReview(params));

      result.current.handleApplyAllShorterTranslations();

      expect(params.setState).toHaveBeenCalled();
    });
  });

  describe('null state safety', () => {
    it('should not crash when state is null', () => {
      const params = createMockParams(null);
      const { result } = renderHook(() => useEditorReview(params));

      // These should all be safe to call with null state
      expect(() => result.current.handleFixAllStuckCharacters()).not.toThrow();
      expect(() => result.current.handleApplyAllShorterTranslations()).not.toThrow();
      expect(() => result.current.handleApplySmartFix('key', 'fix')).not.toThrow();
      expect(() => result.current.handleCloseEnhanceResults()).not.toThrow();
    });
  });
});
