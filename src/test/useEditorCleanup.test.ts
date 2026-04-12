import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEditorCleanup } from '@/hooks/useEditorCleanup';
import type { EditorState, ExtractedEntry } from '@/components/editor/types';

function makeState(translations: Record<string, string>, entries?: ExtractedEntry[]): EditorState {
  const defaultEntries: ExtractedEntry[] = Object.keys(translations).map(key => {
    const [msbtFile, idx] = key.split(':');
    return { msbtFile, index: Number(idx), original: 'Hello world', label: key, maxBytes: 0 };
  });
  return {
    entries: entries || defaultEntries,
    translations,
    fileName: 'test.json',
    originalFile: null,
    bdatOriginalFile: null,
    bdatTables: null,
    bdatOriginalBytes: null,
  } as EditorState;
}

function createMockParams(stateOverride?: EditorState | null) {
  const state = stateOverride ?? null;
  const stateRef = { current: state };

  // Track calls to setter functions
  const setters = {
    setState: vi.fn((fn: any) => {
      if (typeof fn === 'function') stateRef.current = fn(stateRef.current);
      else stateRef.current = fn;
    }),
    setLastSaved: vi.fn(),
    setPreviousTranslations: vi.fn(),
    setDiacriticsCleanResults: vi.fn(),
    setNewlineCleanResults: vi.fn(),
    setMirrorCharsResults: vi.fn(),
    setTagBracketFixResults: vi.fn(),
    setArabicTextFixResults: vi.fn(),
    setNewlineSplitResults: vi.fn(),
    setNpcSplitResults: vi.fn(),
    setLineSyncResults: vi.fn(),
    setUnifiedSplitResults: vi.fn(),
  };

  return {
    params: {
      state,
      ...setters,
      filteredEntries: state?.entries || [],
      isFilterActive: false,
      npcSplitCharLimit: 40,
      npcMode: false,
      npcMaxLines: 3,
      newlineSplitCharLimit: 30,
      diacriticsCleanResults: null as any,
      newlineCleanResults: null as any,
      mirrorCharsResults: null as any,
      tagBracketFixResults: null as any,
      arabicTextFixResults: null as any,
      newlineSplitResults: null as any,
      npcSplitResults: null as any,
      lineSyncResults: null as any,
      unifiedSplitResults: null as any,
    },
    setters,
    stateRef,
  };
}

describe('useEditorCleanup', () => {
  describe('handleScanDiacritics', () => {
    it('should detect diacritics in translations', () => {
      const state = makeState({
        'file:0': 'مَرْحَبًا',  // with diacritics
        'file:1': 'عالم',        // without diacritics
      });
      const { params, setters } = createMockParams(state);
      const { result } = renderHook(() => useEditorCleanup(params));

      act(() => result.current.handleScanDiacritics());

      expect(setters.setDiacriticsCleanResults).toHaveBeenCalled();
      const results = setters.setDiacriticsCleanResults.mock.calls[0][0];
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('file:0');
      expect(results[0].status).toBe('pending');
      // After should have diacritics removed
      expect(/[\u064B-\u065F]/.test(results[0].after)).toBe(false);
    });

    it('should report empty when no diacritics found', () => {
      const state = makeState({ 'file:0': 'مرحبا' });
      const { params, setters } = createMockParams(state);
      const { result } = renderHook(() => useEditorCleanup(params));

      act(() => result.current.handleScanDiacritics());

      const results = setters.setDiacriticsCleanResults.mock.calls[0][0];
      expect(results).toHaveLength(0);
      expect(setters.setLastSaved).toHaveBeenCalled();
    });

    it('should do nothing when state is null', () => {
      const { params, setters } = createMockParams(null);
      const { result } = renderHook(() => useEditorCleanup(params));

      act(() => result.current.handleScanDiacritics());

      expect(setters.setDiacriticsCleanResults).not.toHaveBeenCalled();
    });
  });

  describe('handleScanMirrorChars', () => {
    it('should detect swappable parentheses in Arabic text', () => {
      const state = makeState({ 'file:0': 'مرحبا (عالم)' });
      const { params, setters } = createMockParams(state);
      const { result } = renderHook(() => useEditorCleanup(params));

      act(() => result.current.handleScanMirrorChars());

      const results = setters.setMirrorCharsResults.mock.calls[0][0];
      expect(results).toHaveLength(1);
      expect(results[0].after).toBe('مرحبا )عالم(');
    });

    it('should not flag text with only technical tags', () => {
      const state = makeState({ 'file:0': '[ML:Feeling ] مرحبا {name}' });
      const { params, setters } = createMockParams(state);
      const { result } = renderHook(() => useEditorCleanup(params));

      act(() => result.current.handleScanMirrorChars());

      const results = setters.setMirrorCharsResults.mock.calls[0][0];
      expect(results).toHaveLength(0);
    });
  });

  describe('handleScanTagBrackets', () => {
    it('should detect reversed brackets in translations', () => {
      const entries: ExtractedEntry[] = [{
        msbtFile: 'file', index: 0,
        original: 'Press [ML:Feeling ] to confirm',
        label: 'file:0',
      }];
      const state = makeState(
        { 'file:0': 'اضغط ]ML:Feeling [ للتأكيد' },
        entries,
      );
      const { params, setters } = createMockParams(state);
      const { result } = renderHook(() => useEditorCleanup(params));

      act(() => result.current.handleScanTagBrackets());

      const results = setters.setTagBracketFixResults.mock.calls[0][0];
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].after).toContain('[ML:Feeling ]');
    });

    it('should report empty when brackets are correct', () => {
      const entries: ExtractedEntry[] = [{
        msbtFile: 'file', index: 0,
        original: 'Press [ML:Feeling ] to confirm',
        label: 'file:0',
      }];
      const state = makeState(
        { 'file:0': 'اضغط [ML:Feeling ] للتأكيد' },
        entries,
      );
      const { params, setters } = createMockParams(state);
      const { result } = renderHook(() => useEditorCleanup(params));

      act(() => result.current.handleScanTagBrackets());

      const results = setters.setTagBracketFixResults.mock.calls[0][0];
      expect(results).toHaveLength(0);
    });
  });

  describe('handleFlattenAllNewlines', () => {
    it('should merge multiline translations into single lines', () => {
      const state = makeState({ 'file:0': 'سطر أول\nسطر ثاني' });
      const { params, setters } = createMockParams(state);
      const { result } = renderHook(() => useEditorCleanup(params));

      act(() => result.current.handleFlattenAllNewlines());

      expect(setters.setState).toHaveBeenCalled();
      const updater = setters.setState.mock.calls[0][0];
      const newState = updater(state);
      expect(newState.translations['file:0']).toBe('سطر أول سطر ثاني');
    });

    it('should report no changes when no multiline translations exist', () => {
      const state = makeState({ 'file:0': 'سطر واحد' });
      const { params, setters } = createMockParams(state);
      const { result } = renderHook(() => useEditorCleanup(params));

      act(() => result.current.handleFlattenAllNewlines());

      expect(setters.setState).not.toHaveBeenCalled();
      expect(setters.setLastSaved).toHaveBeenCalled();
    });
  });

  describe('handleScanNewlineSplit', () => {
    it('should detect long translations that need splitting', () => {
      const entries: ExtractedEntry[] = [{
        msbtFile: 'file', index: 0,
        original: 'A very long English sentence here',
        label: 'file:0',
      }];
      const longText = 'هذا النص العربي طويل جداً ويحتاج إلى تقسيم على عدة أسطر لكي يظهر بشكل جيد';
      const state = makeState({ 'file:0': longText }, entries);
      const { params, setters } = createMockParams(state);
      params.newlineSplitCharLimit = 20;
      const { result } = renderHook(() => useEditorCleanup(params));

      act(() => result.current.handleScanNewlineSplit());

      const results = setters.setNewlineSplitResults.mock.calls[0][0];
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].after).toContain('\n');
    });
  });

  describe('return value completeness', () => {
    it('should return all expected handler functions', () => {
      const state = makeState({ 'file:0': 'test' });
      const { params } = createMockParams(state);
      const { result } = renderHook(() => useEditorCleanup(params));

      const expectedHandlers = [
        'handleScanDiacritics', 'handleApplyDiacriticsClean', 'handleRejectDiacriticsClean', 'handleApplyAllDiacriticsCleans',
        'handleScanNewlines', 'handleApplyNewlineClean', 'handleRejectNewlineClean', 'handleApplyAllNewlineCleans',
        'handleScanNewlineSplit', 'handleApplyNewlineSplit', 'handleRejectNewlineSplit', 'handleApplyAllNewlineSplits',
        'handleScanMirrorChars', 'handleApplyMirrorCharsClean', 'handleRejectMirrorCharsClean', 'handleApplyAllMirrorCharsCleans',
        'handleScanTagBrackets', 'handleApplyTagBracketFix', 'handleRejectTagBracketFix', 'handleApplyAllTagBracketFixes',
        'handleScanArabicTextFixes', 'handleApplyArabicTextFix', 'handleRejectArabicTextFix', 'handleApplyAllArabicTextFixes',
        'handleScanAllSplits', 'handleFontTest', 'handleFlattenAllNewlines',
      ];

      for (const name of expectedHandlers) {
        expect(typeof result.current[name as keyof typeof result.current]).toBe('function');
      }
    });
  });
});
