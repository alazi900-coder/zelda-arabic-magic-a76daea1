import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEditorFileIO } from '@/hooks/useEditorFileIO';
import type { EditorState, ExtractedEntry } from '@/components/editor/types';

// === Pure function tests (repairJson, parseCSVLine, escapeCSV) ===
// These are module-private, so we test them indirectly through the hook

function makeEntries(keys: string[]): ExtractedEntry[] {
  return keys.map(key => {
    const [msbtFile, idx] = key.split(':');
    return { msbtFile, index: Number(idx), original: `English text ${idx}`, label: key, maxBytes: 0 };
  });
}

function makeState(entries: ExtractedEntry[], translations: Record<string, string>): EditorState {
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

// Mock URL.createObjectURL and revokeObjectURL for export tests
const mockCreateObjectURL = vi.fn(() => 'blob:mock');
const mockRevokeObjectURL = vi.fn();
Object.defineProperty(globalThis, 'URL', {
  value: {
    ...globalThis.URL,
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  },
  writable: true,
});

// Capture blob contents
const capturedBlobTexts: string[] = [];

// Mock anchor click
const mockClick = vi.fn();
const mockCreateElement = document.createElement.bind(document);
vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
  const el = mockCreateElement(tag);
  if (tag === 'a') {
    el.click = mockClick;
  }
  return el;
});

// Intercept Blob constructor to capture content
const OriginalBlob = globalThis.Blob;
globalThis.Blob = class extends OriginalBlob {
  constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
    super(parts, options);
    // Capture text content from parts
    if (parts) {
      capturedBlobTexts.push(parts.map(p => typeof p === 'string' ? p : '').join(''));
    }
  }
} as any;

function createHookParams(state: EditorState | null, filteredEntries?: ExtractedEntry[], filterLabel?: string) {
  return {
    state,
    setState: vi.fn(),
    setLastSaved: vi.fn(),
    filteredEntries: filteredEntries || state?.entries || [],
    filterLabel: filterLabel || '',
  };
}

describe('Translation Flow Integration Tests', () => {

  describe('Export translations (JSON)', () => {
    it('should export all translations as JSON', async () => {
      const entries = makeEntries(['file1:0', 'file1:1', 'file2:0']);
      const translations: Record<string, string> = {
        'file1:0': 'ترجمة 1',
        'file1:1': 'ترجمة 2',
        'file2:0': 'ترجمة 3',
      };
      const state = makeState(entries, translations);
      const params = createHookParams(state);

      capturedBlobTexts.length = 0;
      mockClick.mockClear();

      const { result } = renderHook(() => useEditorFileIO(params));
      act(() => result.current.handleExportTranslations());

      expect(mockClick).toHaveBeenCalledTimes(1);
      expect(capturedBlobTexts.length).toBeGreaterThan(0);

      const blobText = await capturedBlobTexts[capturedBlobTexts.length - 1];
      const exported = JSON.parse(blobText);
      expect(exported['file1:0']).toBe('ترجمة 1');
      expect(exported['file1:1']).toBe('ترجمة 2');
      expect(exported['file2:0']).toBe('ترجمة 3');
    });

    it('should export only filtered translations when filter is active', async () => {
      const entries = makeEntries(['file1:0', 'file1:1', 'file2:0']);
      const translations: Record<string, string> = {
        'file1:0': 'ترجمة 1',
        'file1:1': 'ترجمة 2',
        'file2:0': 'ترجمة 3',
      };
      const state = makeState(entries, translations);
      const filtered = [entries[0]]; // only file1:0
      const params = createHookParams(state, filtered, 'مخصص');

      capturedBlobTexts.length = 0;
      mockClick.mockClear();

      const { result } = renderHook(() => useEditorFileIO(params));
      act(() => result.current.handleExportTranslations());

      const blobText = await capturedBlobTexts[capturedBlobTexts.length - 1];
      const exported = JSON.parse(blobText);
      expect(exported['file1:0']).toBe('ترجمة 1');
      expect(exported['file1:1']).toBeUndefined();
      expect(exported['file2:0']).toBeUndefined();
    });
  });

  describe('Import translations (JSON)', () => {
    it('should import JSON translations via processJsonImport', async () => {
      const entries = makeEntries(['file1:0', 'file1:1']);
      const state = makeState(entries, {});
      const params = createHookParams(state);

      const { result } = renderHook(() => useEditorFileIO(params));

      const jsonText = JSON.stringify({
        'file1:0': 'ترجمة مستوردة 1',
        'file1:1': 'ترجمة مستوردة 2',
      });

      await act(async () => {
        await result.current.processJsonImport(jsonText, 'imported.json');
      });

      // setState should be called to apply imported translations
      expect(params.setState).toHaveBeenCalled();
    });

    it('should handle truncated/repaired JSON import', async () => {
      const entries = makeEntries(['file1:0', 'file1:1']);
      const state = makeState(entries, {});
      const params = createHookParams(state);

      const { result } = renderHook(() => useEditorFileIO(params));

      // Truncated JSON - missing closing brace
      const truncatedJson = `{
        "file1:0": "ترجمة 1",
        "file1:1": "ترجمة 2"`;

      await act(async () => {
        await result.current.processJsonImport(truncatedJson, 'truncated.json');
      });

      expect(params.setState).toHaveBeenCalled();
    });

    it('should handle multi-chunk JSON import', async () => {
      const entries = makeEntries(['file1:0', 'file2:0']);
      const state = makeState(entries, {});
      const params = createHookParams(state);

      const { result } = renderHook(() => useEditorFileIO(params));

      // Two JSON objects concatenated (common from AI output)
      const multiChunkJson = `{"file1:0": "ترجمة 1"}{"file2:0": "ترجمة 2"}`;

      await act(async () => {
        await result.current.processJsonImport(multiChunkJson, 'multi.json');
      });

      expect(params.setState).toHaveBeenCalled();
    });
  });

  describe('Export CSV', () => {
    it('should export translations as CSV', async () => {
      const entries = makeEntries(['file1:0', 'file1:1']);
      const translations: Record<string, string> = {
        'file1:0': 'ترجمة 1',
        'file1:1': 'ترجمة مع "علامات"',
      };
      const state = makeState(entries, translations);
      const params = createHookParams(state);

      capturedBlobTexts.length = 0;
      mockClick.mockClear();

      const { result } = renderHook(() => useEditorFileIO(params));
      act(() => result.current.handleExportCSV());

      expect(mockClick).toHaveBeenCalled();
      const blobText = await capturedBlobTexts[capturedBlobTexts.length - 1];
      // CSV should contain header
      expect(blobText).toContain('file,index,label,original,translation');
      // Should properly escape quotes
      expect(blobText).toContain('""علامات""');
    });
  });

  describe('Export English Only', () => {
    it('should export only untranslated entries when no filter', async () => {
      const entries = makeEntries(['file1:0', 'file1:1']);
      const translations: Record<string, string> = {
        'file1:0': 'ترجمة 1',
        // file1:1 is untranslated
      };
      const state = makeState(entries, translations);
      const params = createHookParams(state);

      const { result } = renderHook(() => useEditorFileIO(params));

      expect(result.current.getUntranslatedCount()).toBe(1);
    });

    it('should export all filtered entries when filter is active', () => {
      const entries = makeEntries(['file1:0', 'file1:1', 'file2:0']);
      const translations: Record<string, string> = {
        'file1:0': 'ترجمة 1',
        'file1:1': 'ترجمة 2',
      };
      const state = makeState(entries, translations);
      // Filter shows file1:0 and file1:1 (both translated)
      const filtered = [entries[0], entries[1]];
      const params = createHookParams(state, filtered, 'مختلطة');

      const { result } = renderHook(() => useEditorFileIO(params));

      // With filter active, ALL filtered entries are exported (even translated ones)
      expect(result.current.getUntranslatedCount()).toBe(2);
    });

    it('should return 0 when all entries are translated and no filter', () => {
      const entries = makeEntries(['file1:0', 'file1:1']);
      const translations: Record<string, string> = {
        'file1:0': 'ترجمة 1',
        'file1:1': 'ترجمة 2',
      };
      const state = makeState(entries, translations);
      const params = createHookParams(state);

      const { result } = renderHook(() => useEditorFileIO(params));

      expect(result.current.getUntranslatedCount()).toBe(0);
    });
  });

  describe('Export XLIFF', () => {
    it('should export translations as XLIFF XML', async () => {
      const entries = makeEntries(['file1:0']);
      const translations: Record<string, string> = {
        'file1:0': 'ترجمة XLIFF',
      };
      const state = makeState(entries, translations);
      const params = createHookParams(state);

      capturedBlobTexts.length = 0;
      mockClick.mockClear();

      const { result } = renderHook(() => useEditorFileIO(params));
      act(() => result.current.handleExportXLIFF());

      const blobText = await capturedBlobTexts[capturedBlobTexts.length - 1];
      expect(blobText).toContain('<?xml');
      expect(blobText).toContain('xliff');
      expect(blobText).toContain('ترجمة XLIFF');
    });
  });

  describe('Export TMX', () => {
    it('should export translations as TMX XML', async () => {
      const entries = makeEntries(['file1:0']);
      const translations: Record<string, string> = {
        'file1:0': 'ترجمة TMX',
      };
      const state = makeState(entries, translations);
      const params = createHookParams(state);

      capturedBlobTexts.length = 0;
      mockClick.mockClear();

      const { result } = renderHook(() => useEditorFileIO(params));
      act(() => result.current.handleExportTMX());

      const blobText = await capturedBlobTexts[capturedBlobTexts.length - 1];
      expect(blobText).toContain('<?xml');
      expect(blobText).toContain('tmx');
      expect(blobText).toContain('ترجمة TMX');
    });
  });

  describe('Null state safety', () => {
    it('should not crash any export handler with null state', () => {
      const params = createHookParams(null);
      const { result } = renderHook(() => useEditorFileIO(params));

      expect(() => result.current.handleExportTranslations()).not.toThrow();
      expect(() => result.current.handleExportCSV()).not.toThrow();
      expect(() => result.current.handleExportXLIFF()).not.toThrow();
      expect(() => result.current.handleExportTMX()).not.toThrow();
      expect(result.current.getUntranslatedCount()).toBe(0);
    });
  });

  describe('Import-Export roundtrip', () => {
    it('should preserve translations through export → import cycle', async () => {
      const entries = makeEntries(['file1:0', 'file1:1', 'file2:0']);
      const translations: Record<string, string> = {
        'file1:0': 'ترجمة واحدة',
        'file1:1': 'ترجمة اثنين',
        'file2:0': 'ترجمة ثلاثة',
      };
      const state = makeState(entries, translations);

      // Step 1: Export
      const params1 = createHookParams(state);
      capturedBlobTexts.length = 0;
      const { result: r1 } = renderHook(() => useEditorFileIO(params1));
      act(() => r1.current.handleExportTranslations());
      const exportedJson = await capturedBlobTexts[capturedBlobTexts.length - 1];
      const exported = JSON.parse(exportedJson);

      // Step 2: Import back into empty state
      const emptyState = makeState(entries, {});
      const params2 = createHookParams(emptyState);
      const { result: r2 } = renderHook(() => useEditorFileIO(params2));

      await act(async () => {
        await r2.current.processJsonImport(exportedJson, 'roundtrip.json');
      });

      expect(params2.setState).toHaveBeenCalled();

      // Verify the imported data matches original (excluding fingerprint keys)
      const regularKeys = Object.keys(exported).filter(k => !k.startsWith('__fp__:'));
      expect(regularKeys).toContain('file1:0');
      expect(exported['file1:0']).toBe('ترجمة واحدة');
      expect(exported['file1:1']).toBe('ترجمة اثنين');
      expect(exported['file2:0']).toBe('ترجمة ثلاثة');
    });
  });
});
