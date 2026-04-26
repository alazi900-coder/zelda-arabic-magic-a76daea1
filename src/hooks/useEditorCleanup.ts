import { useCallback, useMemo } from "react";
import { toast } from "@/hooks/use-toast";
import { fixTagBracketsStrict, hasTechnicalBracketTag } from "@/lib/tag-bracket-fix";
import { scanAllTextFixes, scanLonelyLamFixes } from "@/lib/arabic-text-fixes";
import { visualLength, splitEvenlyByLines } from "@/lib/balance-lines";
import { countEffectiveLines } from "@/lib/text-tokens";
import { restoreTagsLocally, hasTechnicalTags } from "@/components/editor/types";
import type { EditorState, ExtractedEntry } from "@/components/editor/types";
import type { NewlineCleanResult } from "@/components/editor/NewlineCleanPanel";
import type { DiacriticsCleanResult } from "@/components/editor/DiacriticsCleanPanel";
import type { MirrorCharsResult } from "@/components/editor/MirrorCharsCleanPanel";
import type { TagBracketFixResult } from "@/components/editor/TagBracketFixPanel";
import type { NewlineSplitResult } from "@/components/editor/NewlineSplitPanel";
import type { TextFixResult } from "@/lib/arabic-text-fixes";

type Setter<T> = React.Dispatch<React.SetStateAction<T[] | null>>;

interface UseEditorCleanupParams {
  state: EditorState | null;
  setState: React.Dispatch<React.SetStateAction<EditorState | null>>;
  setLastSaved: (v: string) => void;
  setPreviousTranslations: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  filteredEntries: ExtractedEntry[];
  isFilterActive: boolean;
  npcSplitCharLimit: number;
  npcMode: boolean;
  npcMaxLines: number;
  newlineSplitCharLimit: number;
  // Scan result setters from useEditorScanResults
  setDiacriticsCleanResults: Setter<DiacriticsCleanResult>;
  setNewlineCleanResults: Setter<NewlineCleanResult>;
  setMirrorCharsResults: Setter<MirrorCharsResult>;
  setTagBracketFixResults: Setter<TagBracketFixResult>;
  setArabicTextFixResults: Setter<TextFixResult>;
  setNewlineSplitResults: Setter<NewlineSplitResult>;
  setNpcSplitResults: Setter<NewlineSplitResult>;
  setLineSyncResults: Setter<NewlineSplitResult>;
  setUnifiedSplitResults: Setter<NewlineSplitResult>;
  diacriticsCleanResults: DiacriticsCleanResult[] | null;
  newlineCleanResults: NewlineCleanResult[] | null;
  mirrorCharsResults: MirrorCharsResult[] | null;
  tagBracketFixResults: TagBracketFixResult[] | null;
  arabicTextFixResults: TextFixResult[] | null;
  newlineSplitResults: NewlineSplitResult[] | null;
  npcSplitResults: NewlineSplitResult[] | null;
  lineSyncResults: NewlineSplitResult[] | null;
  unifiedSplitResults: NewlineSplitResult[] | null;
}

export function useEditorCleanup(params: UseEditorCleanupParams) {
  const {
    state, setState, setLastSaved, setPreviousTranslations,
    filteredEntries, isFilterActive,
    npcSplitCharLimit, npcMode, npcMaxLines, newlineSplitCharLimit,
    setDiacriticsCleanResults, setNewlineCleanResults, setMirrorCharsResults,
    setTagBracketFixResults, setArabicTextFixResults, setNewlineSplitResults,
    setNpcSplitResults, setLineSyncResults, setUnifiedSplitResults,
    diacriticsCleanResults, newlineCleanResults, mirrorCharsResults,
    tagBracketFixResults, arabicTextFixResults, newlineSplitResults,
    npcSplitResults, lineSyncResults, unifiedSplitResults,
  } = params;

  // === Diacritics Clean ===
  const diacriticsRegex = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

  const handleScanDiacritics = useCallback(() => {
    if (!state) return;
    const results: DiacriticsCleanResult[] = [];
    for (const [key, value] of Object.entries(state.translations)) {
      if (!value?.trim()) continue;
      const matches = value.match(diacriticsRegex);
      if (matches && matches.length > 0) {
        const after = value.replace(diacriticsRegex, '');
        if (after !== value) results.push({ key, before: value, after, count: matches.length, status: 'pending' });
      }
    }
    setDiacriticsCleanResults(results);
    if (results.length === 0) { setLastSaved("✅ لا توجد تشكيلات لإزالتها"); setTimeout(() => setLastSaved(""), 4000); }
  }, [state]);

  const handleApplyDiacriticsClean = useCallback((key: string) => {
    if (!state || !diacriticsCleanResults) return;
    const item = diacriticsCleanResults.find((r) => r.key === key);
    if (!item) return;
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setDiacriticsCleanResults((prev) => prev ? prev.map((r) => r.key === key ? { ...r, status: 'accepted' } : r) : null);
  }, [state, diacriticsCleanResults]);

  const handleRejectDiacriticsClean = useCallback((key: string) => {
    setDiacriticsCleanResults((prev) => prev ? prev.map((r) => r.key === key ? { ...r, status: 'rejected' } : r) : null);
  }, []);

  const handleApplyAllDiacriticsCleans = useCallback(() => {
    if (!state || !diacriticsCleanResults) return;
    const pending = diacriticsCleanResults.filter((r) => r.status === 'pending');
    const newTranslations = { ...state.translations };
    for (const item of pending) newTranslations[item.key] = item.after;
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setDiacriticsCleanResults((prev) => prev ? prev.map((r) => r.status === 'pending' ? { ...r, status: 'accepted' } : r) : null);
    setLastSaved(`✅ تم إزالة التشكيلات من ${pending.length} ترجمة`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, diacriticsCleanResults]);

  const handleRemoveAllDiacritics = handleScanDiacritics;

  // === Newline & Symbol Clean ===
  const handleScanNewlines = useCallback(() => {
    if (!state) return;
    const results: NewlineCleanResult[] = [];
    const cleanupPattern = /\\[n.:\-\\r]|(?<=\s|^)[n.:\\\-](?=\s|$)|(?<=\s|^)[a-zA-Z](?=\s|$)/g;
    for (const [key, value] of Object.entries(state.translations)) {
      if (!value?.trim()) continue;
      if (cleanupPattern.test(value)) {
        cleanupPattern.lastIndex = 0;
        const count = (value.match(cleanupPattern) || []).length;
        const after = value.replace(cleanupPattern, ' ').replace(/ {2,}/g, ' ').trim();
        if (after !== value) results.push({ key, before: value, after, count, status: 'pending' });
        cleanupPattern.lastIndex = 0;
      }
    }
    setNewlineCleanResults(results);
    if (results.length === 0) { setLastSaved("✅ لم يتم اكتشاف أي رموز غير مرغوبة في الترجمات"); setTimeout(() => setLastSaved(""), 4000); }
  }, [state]);

  const handleApplyNewlineClean = useCallback((key: string) => {
    if (!state || !newlineCleanResults) return;
    const item = newlineCleanResults.find((r) => r.key === key);
    if (!item) return;
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setNewlineCleanResults((prev) => prev ? prev.map((r) => r.key === key ? { ...r, status: 'accepted' } : r) : null);
  }, [state, newlineCleanResults]);

  const handleRejectNewlineClean = useCallback((key: string) => {
    setNewlineCleanResults((prev) => prev ? prev.map((r) => r.key === key ? { ...r, status: 'rejected' } : r) : null);
  }, []);

  const handleApplyAllNewlineCleans = useCallback(() => {
    if (!state || !newlineCleanResults) return;
    const pending = newlineCleanResults.filter((r) => r.status === 'pending');
    const newTranslations = { ...state.translations };
    for (const item of pending) newTranslations[item.key] = item.after;
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setNewlineCleanResults((prev) => prev ? prev.map((r) => r.status === 'pending' ? { ...r, status: 'accepted' } : r) : null);
    setLastSaved(`✅ تم تنظيف ${pending.length} ترجمة من الرموز غير المرغوبة`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, newlineCleanResults]);

  // === Newline Split ===
  const splitAtWordBoundary = useCallback((text: string, charLimit: number): string => {
    if (text.includes('\n')) return text;
    if (text.length <= charLimit) return text;
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (candidate.length > charLimit && currentLine) { lines.push(currentLine); currentLine = word; }
      else { currentLine = candidate; }
    }
    if (currentLine) lines.push(currentLine);
    return lines.join('\n');
  }, []);

  const BUBBLE_FILE_RE = /(?:^|[:/])(?:tlk_|fev_|cq_)/i;

  const handleScanNewlineSplit = useCallback(() => {
    if (!state) return;
    const results: NewlineSplitResult[] = [];
    const entriesToScan = isFilterActive ? filteredEntries : state.entries;
    for (const entry of entriesToScan) {
      const key = `${entry.msbtFile}:${entry.index}`;
      if (BUBBLE_FILE_RE.test(key)) continue;
      const translation = state.translations[key];
      if (!translation?.trim()) continue;
      if (translation.includes('\n')) continue;
      const englishLineCount = countEffectiveLines(entry.original);
      if (englishLineCount <= 1 && visualLength(translation) <= newlineSplitCharLimit) continue;
      const targetLines = englishLineCount > 1 ? englishLineCount : Math.max(2, Math.ceil(visualLength(translation) / newlineSplitCharLimit));
      const after = splitEvenlyByLines(translation, targetLines);
      if (after === translation) continue;
      results.push({ key, originalLines: after.split('\n').length, translationLines: 1, before: translation, after, original: entry.original, status: 'pending' });
    }
    setNewlineSplitResults(results);
    if (results.length === 0) { setLastSaved("✅ لم يتم اكتشاف نصوص طويلة تحتاج تقسيم"); setTimeout(() => setLastSaved(""), 4000); }
  }, [state, isFilterActive, filteredEntries, newlineSplitCharLimit]);

  const handleApplyNewlineSplit = useCallback((key: string) => {
    if (!state || !newlineSplitResults) return;
    const item = newlineSplitResults.find((r) => r.key === key);
    if (!item) return;
    setPreviousTranslations(old => ({ ...old, [key]: state.translations[key] || '' }));
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setNewlineSplitResults((prev) => prev ? prev.map((r) => r.key === key ? { ...r, status: 'accepted' } : r) : null);
  }, [state, newlineSplitResults]);

  const handleRejectNewlineSplit = useCallback((key: string) => {
    setNewlineSplitResults((prev) => prev ? prev.map((r) => r.key === key ? { ...r, status: 'rejected' } : r) : null);
  }, []);

  const handleApplyAllNewlineSplits = useCallback(() => {
    if (!state || !newlineSplitResults) return;
    const pending = newlineSplitResults.filter((r) => r.status === 'pending');
    const newTranslations = { ...state.translations };
    const prevTrans: Record<string, string> = {};
    for (const item of pending) { prevTrans[item.key] = newTranslations[item.key] || ''; newTranslations[item.key] = item.after; }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setNewlineSplitResults((prev) => prev ? prev.map((r) => r.status === 'pending' ? { ...r, status: 'accepted' } : r) : null);
    setLastSaved(`✅ تم تقسيم ${pending.length} نص مضغوط`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, newlineSplitResults]);

  // === NPC Split ===
  const NPC_FILE_RE = /msg_(ask|cq|fev|nq|sq|tlk|tq)/i;

  const npcAffectedCount = useMemo(() => {
    if (!state) return 0;
    const entriesToScan = isFilterActive ? filteredEntries : state.entries;
    let count = 0;
    for (const entry of entriesToScan) {
      const key = `${entry.msbtFile}:${entry.index}`;
      if (!NPC_FILE_RE.test(key)) continue;
      if (!state.translations[key]?.trim()) continue;
      count++;
    }
    return count;
  }, [state, isFilterActive, filteredEntries]);

  const handleScanNpcSplit = useCallback(() => {
    if (!state) return;
    const results: NewlineSplitResult[] = [];
    const entriesToScan = isFilterActive ? filteredEntries : state.entries;
    for (const entry of entriesToScan) {
      const key = `${entry.msbtFile}:${entry.index}`;
      if (!NPC_FILE_RE.test(key)) continue;
      const translation = state.translations[key];
      if (!translation?.trim()) continue;
      if (npcMode) {
        const englishLineCount = countEffectiveLines(entry.original);
        const flat = translation.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
        let after: string;
        if (englishLineCount <= 1) after = flat;
        else after = splitEvenlyByLines(flat, englishLineCount);
        if (after === translation) continue;
        results.push({ key, originalLines: englishLineCount, translationLines: translation.split('\n').length, before: translation, after, original: entry.original, status: 'pending' });
        continue;
      }
      const flat = translation.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (visualLength(flat) <= npcSplitCharLimit) {
        if (translation !== flat && translation.includes('\n')) {
          results.push({ key, originalLines: 1, translationLines: translation.split('\n').length, before: translation, after: flat, original: entry.original, status: 'pending' });
        }
        continue;
      }
      const after = splitEvenlyByLines(translation, npcMaxLines);
      if (after === translation) continue;
      results.push({ key, originalLines: after.split('\n').length, translationLines: translation.split('\n').length, before: translation, after, original: entry.original, status: 'pending' });
    }
    setNpcSplitResults(results);
    if (results.length === 0) {
      setLastSaved(npcMode ? `✅ لا توجد نصوص NPC تحتاج مزامنة أسطر` : `✅ لا توجد نصوص NPC تحتاج إعادة تقسيم عند ${npcSplitCharLimit} حرف`);
      setTimeout(() => setLastSaved(""), 4000);
    }
  }, [state, isFilterActive, filteredEntries, npcSplitCharLimit, npcMode, npcMaxLines]);

  const handleApplyNpcSplit = useCallback((key: string) => {
    if (!state || !npcSplitResults) return;
    const item = npcSplitResults.find((r) => r.key === key);
    if (!item) return;
    setPreviousTranslations(old => ({ ...old, [key]: state.translations[key] || '' }));
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setNpcSplitResults((prev) => prev ? prev.map((r) => r.key === key ? { ...r, status: 'accepted' } : r) : null);
  }, [state, npcSplitResults]);

  const handleRejectNpcSplit = useCallback((key: string) => {
    setNpcSplitResults((prev) => prev ? prev.map((r) => r.key === key ? { ...r, status: 'rejected' } : r) : null);
  }, []);

  const handleApplyAllNpcSplits = useCallback(() => {
    if (!state || !npcSplitResults) return;
    const pending = npcSplitResults.filter((r) => r.status === 'pending');
    const newTranslations = { ...state.translations };
    const prevTrans: Record<string, string> = {};
    for (const item of pending) { prevTrans[item.key] = newTranslations[item.key] || ''; newTranslations[item.key] = item.after; }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setNpcSplitResults((prev) => prev ? prev.map((r) => r.status === 'pending' ? { ...r, status: 'accepted' } : r) : null);
    setLastSaved(`✅ تم تقسيم ${pending.length} نص NPC`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, npcSplitResults]);

  // === Line Sync ===
  const lineSyncAffectedCount = useMemo(() => {
    if (!state) return 0;
    const entriesToScan = isFilterActive ? filteredEntries : state.entries;
    let count = 0;
    for (const entry of entriesToScan) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const translation = state.translations[key];
      if (!translation?.trim()) continue;
      const englishLineCount = countEffectiveLines(entry.original);
      const arabicLineCount = countEffectiveLines(translation);
      if (englishLineCount !== arabicLineCount) count++;
    }
    return count;
  }, [state, isFilterActive, filteredEntries]);

  const handleScanLineSync = useCallback(() => {
    if (!state) return;
    const results: NewlineSplitResult[] = [];
    const entriesToScan = isFilterActive ? filteredEntries : state.entries;
    for (const entry of entriesToScan) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const translation = state.translations[key];
      if (!translation?.trim()) continue;
      const englishLineCount = countEffectiveLines(entry.original);
      const arabicLineCount = countEffectiveLines(translation);
      if (englishLineCount === arabicLineCount) continue;
      const flat = translation.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
      let after: string;
      if (englishLineCount <= 1) after = flat;
      else after = splitEvenlyByLines(flat, englishLineCount);
      if (after === translation) continue;
      results.push({ key, originalLines: englishLineCount, translationLines: arabicLineCount, before: translation, after, original: entry.original, status: 'pending' });
    }
    setLineSyncResults(results);
    if (results.length === 0) { setLastSaved(`✅ جميع الترجمات متطابقة الأسطر مع النص الإنجليزي`); setTimeout(() => setLastSaved(""), 4000); }
  }, [state, isFilterActive, filteredEntries]);

  const handleApplyLineSync = useCallback((key: string) => {
    if (!state || !lineSyncResults) return;
    const item = lineSyncResults.find((r) => r.key === key);
    if (!item) return;
    setPreviousTranslations(old => ({ ...old, [key]: state.translations[key] || '' }));
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setLineSyncResults((prev) => prev ? prev.map((r) => r.key === key ? { ...r, status: 'accepted' } : r) : null);
  }, [state, lineSyncResults]);

  const handleRejectLineSync = useCallback((key: string) => {
    setLineSyncResults((prev) => prev ? prev.map((r) => r.key === key ? { ...r, status: 'rejected' } : r) : null);
  }, []);

  const handleApplyAllLineSyncs = useCallback(() => {
    if (!state || !lineSyncResults) return;
    const pending = lineSyncResults.filter((r) => r.status === 'pending');
    const newTranslations = { ...state.translations };
    const prevTrans: Record<string, string> = {};
    for (const item of pending) { prevTrans[item.key] = newTranslations[item.key] || ''; newTranslations[item.key] = item.after; }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setLineSyncResults((prev) => prev ? prev.map((r) => r.status === 'pending' ? { ...r, status: 'accepted' } : r) : null);
    setLastSaved(`✅ تم مزامنة أسطر ${pending.length} ترجمة`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, lineSyncResults]);

  // === Unified Split (improved) ===
  const handleScanAllSplits = useCallback(() => {
    if (!state) return;
    const results: NewlineSplitResult[] = [];
    const entriesToScan = isFilterActive ? filteredEntries : state.entries;
    const protectedSet = state.protectedEntries || new Set<string>();

    for (const entry of entriesToScan) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const translation = state.translations[key];
      if (!translation?.trim()) continue;

      // Skip protected entries
      if (protectedSet.has(key)) continue;

      const isNpcFile = NPC_FILE_RE.test(key);
      const isBubbleFile = BUBBLE_FILE_RE.test(key);
      const englishLineCount = countEffectiveLines(entry.original);
      const arabicLines = translation.split('\n');
      const arabicLineCount = arabicLines.length;

      // Clean up: normalize whitespace, remove empty lines, trim each line
      const cleanedLines = translation.split('\n').map(l => l.replace(/\s{2,}/g, ' ').trim()).filter(l => l.length > 0);
      const flat = cleanedLines.join(' ').trim();

      if (!flat) continue;

      // === Bubble files: should have NO newlines (game hides text after \n) ===
      if (isBubbleFile) {
        if (translation.includes('\n')) {
          results.push({ key, originalLines: 1, translationLines: arabicLineCount, before: translation, after: flat, original: entry.original, status: 'pending' });
        }
        continue;
      }

      let needsSplit = false;
      let reason = '';

      // Check 1: Line count mismatch with original
      if (englishLineCount !== arabicLineCount) {
        needsSplit = true;
        reason = 'line_count_mismatch';
      }
      // Check 2: Already multi-line but has orphan lines (single word on a line)
      else if (arabicLineCount > 1) {
        const hasOrphan = arabicLines.some((line, idx) => {
          if (arabicLineCount <= 1) return false;
          const lexical = line.trim().split(/\s+/).filter(w => w.length > 1).length;
          return lexical <= 1 && line.trim().length > 0;
        });
        // Check for imbalanced lines (one line is >2x the length of another)
        const lineLengths = arabicLines.map(l => visualLength(l.trim()));
        const maxLen = Math.max(...lineLengths);
        const minLen = Math.min(...lineLengths.filter(l => l > 0));
        const isImbalanced = minLen > 0 && maxLen > minLen * 2.5 && maxLen > 15;

        if (hasOrphan || isImbalanced) {
          needsSplit = true;
          reason = hasOrphan ? 'orphan_word' : 'imbalanced';
        }
      }
      // Check 3: Single-line text that's too long (non-NPC)
      else if (!isNpcFile && arabicLineCount === 1 && englishLineCount <= 1 && visualLength(flat) > newlineSplitCharLimit) {
        needsSplit = true;
        reason = 'too_long_single';
      }
      // Check 4: NPC files — always sync line count and check balance
      if (isNpcFile && !needsSplit) {
        // Even if line count matches, check balance quality
        if (arabicLineCount > 1) {
          const lineLengths = arabicLines.map(l => visualLength(l.trim()));
          const maxLen = Math.max(...lineLengths);
          const minLen = Math.min(...lineLengths.filter(l => l > 0));
          if (minLen > 0 && maxLen > minLen * 2.5 && maxLen > 15) {
            needsSplit = true;
            reason = 'npc_imbalanced';
          }
        }
      }

      if (!needsSplit) continue;

      // Determine target line count
      let targetLines: number;
      if (reason === 'too_long_single') {
        targetLines = Math.max(2, Math.ceil(visualLength(flat) / newlineSplitCharLimit));
      } else if (reason === 'orphan_word' || reason === 'imbalanced' || reason === 'npc_imbalanced') {
        // Rebalance only: keep the same number of lines, just redistribute words
        targetLines = arabicLineCount;
      } else {
        // Sync with English line count
        targetLines = englishLineCount;
      }

      // For single-line originals, flatten the translation
      let after: string;
      if (targetLines <= 1) {
        after = flat;
      } else {
        after = splitEvenlyByLines(flat, targetLines);
      }

      // Ensure tag integrity: if original had technical tags, verify they survive
      if (hasTechnicalTags(entry.original)) {
        const origTagCount = (entry.original.match(/[\uFFF9-\uFFFC\uE000-\uE0FF]/g) || []).length;
        const afterTagCount = (after.match(/[\uFFF9-\uFFFC\uE000-\uE0FF]/g) || []).length;
        if (afterTagCount < origTagCount) {
          // Tag was lost during split — try restoring from original
          after = restoreTagsLocally(entry.original, after);
        }
      }

      // Only add if actually changed
      if (after !== translation) {
        results.push({
          key,
          originalLines: englishLineCount,
          translationLines: arabicLineCount,
          before: translation,
          after,
          original: entry.original,
          status: 'pending',
        });
      }
    }

    // Sort: critical issues first (line count mismatch), then quality improvements
    results.sort((a, b) => {
      const aMismatch = a.originalLines !== a.translationLines ? 0 : 1;
      const bMismatch = b.originalLines !== b.translationLines ? 0 : 1;
      return aMismatch - bMismatch;
    });

    setUnifiedSplitResults(results);
    if (results.length === 0) {
      setLastSaved("✅ لا توجد نصوص تحتاج تقسيم أو مزامنة");
      setTimeout(() => setLastSaved(""), 4000);
    } else {
      toast({
        title: `✂️ وُجدت ${results.length} ترجمة تحتاج تقسيم/مزامنة`,
        description: `${results.filter((r) => r.originalLines !== r.translationLines).length} عدم تطابق أسطر، ${results.filter((r) => r.originalLines === r.translationLines).length} تحسين توازن`,
      });
    }
  }, [state, isFilterActive, filteredEntries, newlineSplitCharLimit, npcSplitCharLimit, npcMode, npcMaxLines]);

  const handleApplyUnifiedSplit = useCallback((key: string) => {
    if (!state || !unifiedSplitResults) return;
    const item = unifiedSplitResults.find((r) => r.key === key);
    if (!item) return;
    setPreviousTranslations(old => ({ ...old, [key]: state.translations[key] || '' }));
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setUnifiedSplitResults((prev) => prev ? prev.map((r) => r.key === key ? { ...r, status: 'accepted' } : r) : null);
  }, [state, unifiedSplitResults]);

  const handleRejectUnifiedSplit = useCallback((key: string) => {
    setUnifiedSplitResults((prev) => prev ? prev.map((r) => r.key === key ? { ...r, status: 'rejected' } : r) : null);
  }, []);

  const handleApplyAllUnifiedSplits = useCallback(() => {
    if (!state || !unifiedSplitResults) return;
    const pending = unifiedSplitResults.filter((r) => r.status === 'pending');
    const newTranslations = { ...state.translations };
    const prevTrans: Record<string, string> = {};
    for (const item of pending) { prevTrans[item.key] = newTranslations[item.key] || ''; newTranslations[item.key] = item.after; }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setUnifiedSplitResults((prev) => prev ? prev.map((r) => r.status === 'pending' ? { ...r, status: 'accepted' } : r) : null);
    setLastSaved(`✅ تم تقسيم ومزامنة ${pending.length} نص`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, unifiedSplitResults]);

  // === Split single entry ===
  const handleSplitSingleEntry = useCallback((key: string) => {
    if (!state) return;
    const translation = state.translations[key];
    if (!translation?.trim() || translation.includes('\n') || translation.length <= newlineSplitCharLimit) return;
    const after = splitAtWordBoundary(translation, newlineSplitCharLimit);
    if (after === translation) return;
    setPreviousTranslations(old => ({ ...old, [key]: translation }));
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: after } } : null);
    setLastSaved("✅ تم تقسيم النص");
    setTimeout(() => setLastSaved(""), 3000);
  }, [state, splitAtWordBoundary]);

  // === Font Test ===
  const handleFontTest = useCallback((testWord: string) => {
    if (!state || !testWord.trim()) return;
    const entriesToFill = isFilterActive ? filteredEntries : state.entries;
    const newTranslations = { ...state.translations };
    const prevTrans: Record<string, string> = {};
    let count = 0;
    for (const entry of entriesToFill) {
      const key = `${entry.msbtFile}:${entry.index}`;
      prevTrans[key] = newTranslations[key] || '';
      newTranslations[key] = testWord.trim();
      count++;
    }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setLastSaved(`🔤 تم ملء ${count} ترجمة بـ "${testWord.trim()}" لاختبار الخط`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, isFilterActive, filteredEntries]);

  // === Flatten Newlines ===
  const handleFlattenAllNewlines = useCallback(() => {
    if (!state) return;
    const entriesToFlatten = isFilterActive ? filteredEntries : state.entries;
    const keysToFlatten = new Set(entriesToFlatten.map(e => `${e.msbtFile}:${e.index}`));
    const newTranslations = { ...state.translations };
    const prevTrans: Record<string, string> = {};
    let count = 0;
    for (const key of keysToFlatten) {
      const trans = newTranslations[key];
      if (!trans || !trans.includes('\n')) continue;
      prevTrans[key] = trans;
      newTranslations[key] = trans.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
      count++;
    }
    if (count === 0) { setLastSaved("✅ لا توجد ترجمات متعددة الأسطر"); setTimeout(() => setLastSaved(""), 3000); return; }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setLastSaved(`✅ تم دمج ${count} ترجمة إلى سطر واحد`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, isFilterActive, filteredEntries]);

  // === Mirror Chars Clean ===
  const handleScanMirrorChars = useCallback(() => {
    if (!state) return;
    const swapChars = (t: string) => {
      const protected_: { placeholder: string; original: string }[] = [];
      let counter = 0;
      let safe = t.replace(/(\[\w+:[^\]]*?\s*\](?:\s*\([^)]{1,100}\))?|\{[\w]+\}|<[\w\/][^>]*>|[\uE000-\uE0FF]+|[\uFFF9-\uFFFB]+|\([A-Z][^)]{1,100}\))/g, (match) => {
        const ph = `\x01PROT${counter++}\x01`;
        protected_.push({ placeholder: ph, original: match });
        return ph;
      });
      safe = safe
        .replace(/\(/g, '\x00OPEN\x00').replace(/\)/g, '(').replace(/\x00OPEN\x00/g, ')')
        .replace(/</g, '\x00LT\x00').replace(/>/g, '<').replace(/\x00LT\x00/g, '>');
      for (const p of protected_) safe = safe.replace(p.placeholder, p.original);
      return safe;
    };
    const results: MirrorCharsResult[] = [];
    for (const [key, value] of Object.entries(state.translations)) {
      if (!value?.trim()) continue;
      const after = swapChars(value);
      if (after === value) continue;
      const count = (value.match(/[()<>]/g) || []).length;
      results.push({ key, before: value, after, count, status: 'pending' });
    }
    setMirrorCharsResults(results);
    if (results.length === 0) { setLastSaved("✅ لا توجد أقواس أو أسهم معكوسة"); setTimeout(() => setLastSaved(""), 4000); }
  }, [state]);

  const handleApplyMirrorCharsClean = useCallback((key: string) => {
    if (!state || !mirrorCharsResults) return;
    const item = mirrorCharsResults.find((r) => r.key === key);
    if (!item) return;
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setMirrorCharsResults((prev) => prev ? prev.map((r) => r.key === key ? { ...r, status: 'accepted' } : r) : null);
  }, [state, mirrorCharsResults]);

  const handleRejectMirrorCharsClean = useCallback((key: string) => {
    setMirrorCharsResults((prev) => prev ? prev.map((r) => r.key === key ? { ...r, status: 'rejected' } : r) : null);
  }, []);

  const handleApplyAllMirrorCharsCleans = useCallback(() => {
    if (!state || !mirrorCharsResults) return;
    const pending = mirrorCharsResults.filter((r) => r.status === 'pending');
    const newTranslations = { ...state.translations };
    for (const item of pending) newTranslations[item.key] = item.after;
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setMirrorCharsResults((prev) => prev ? prev.map((r) => r.status === 'pending' ? { ...r, status: 'accepted' } : r) : null);
    setLastSaved(`✅ تم عكس ${pending.length} رمز`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, mirrorCharsResults]);

  // === Tag Bracket Fix ===
  const handleScanTagBrackets = useCallback(() => {
    if (!state) return;
    const results: TagBracketFixResult[] = [];
    let suspiciousUnfixableCount = 0;
    for (const entry of state.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const translation = state.translations[key];
      if (!translation?.trim()) continue;
      if (!hasTechnicalBracketTag(entry.original)) continue;
      const TAG_REGEX = /[\uFFF9-\uFFFC]|[\uE000-\uE0FF]+|\d+\s*\\?\[[A-Z]{2,10}\\?\]|\\?\[[A-Z]{2,10}\\?\]\s*\d+|\\?\[\s*\/?\s*\w+\s*:[^\]]*?\\?\](?:\s*\([^)]{1,100}\))?|\\?\[\s*[A-Za-z][A-Za-z0-9]*(?:[ '\/-]+[A-Za-z0-9]+)*\s*\\?\]|\[\s*\w+\s*=\s*\w[^\]]*\]|\{\s*\w+\s*:\s*\w[^}]*\}|\{[\w]+\}/g;
      const allOriginalTags = [...entry.original.matchAll(new RegExp(TAG_REGEX.source, TAG_REGEX.flags))].map(m => m[0]);
      const origTagCount = new Map<string, number>();
      for (const t of allOriginalTags) origTagCount.set(t, (origTagCount.get(t) || 0) + 1);
      const transTagsBefore = [...translation.matchAll(new RegExp(TAG_REGEX.source, TAG_REGEX.flags))].map(m => m[0]);
      const transCountBefore = new Map<string, number>();
      for (const t of transTagsBefore) transCountBefore.set(t, (transCountBefore.get(t) || 0) + 1);
      const hasMissingOriginalTag = allOriginalTags.some(t => (transCountBefore.get(t) || 0) < (origTagCount.get(t) || 0));
      const hasForeignTag = transTagsBefore.some(t => !origTagCount.has(t));
      const { text: after, stats } = fixTagBracketsStrict(entry.original, translation);
      const transTagsAfter = [...after.matchAll(new RegExp(TAG_REGEX.source, TAG_REGEX.flags))].map(m => m[0]);
      const transCountAfter = new Map<string, number>();
      for (const t of transTagsAfter) transCountAfter.set(t, (transCountAfter.get(t) || 0) + 1);
      const hasMissingAfterFix = allOriginalTags.some(t => (transCountAfter.get(t) || 0) < (origTagCount.get(t) || 0));
      const hasForeignAfterFix = transTagsAfter.some(t => !origTagCount.has(t));
      const hasExtraAfterFix = [...transCountAfter.entries()].some(([t, c]) => origTagCount.has(t) && c > (origTagCount.get(t) || 0));
      let finalAfter = after;
      if (hasMissingAfterFix || hasForeignAfterFix || hasExtraAfterFix) finalAfter = restoreTagsLocally(entry.original, after);
      if (finalAfter === translation) { if (hasMissingOriginalTag || hasForeignTag) suspiciousUnfixableCount++; continue; }
      results.push({ key, before: translation, after: finalAfter, count: (stats.total || 0) + (finalAfter !== after ? 1 : 0), status: 'pending' });
    }
    setTagBracketFixResults(results);
    if (results.length === 0) {
      if (suspiciousUnfixableCount > 0) setLastSaved(`⚠️ تم رصد ${suspiciousUnfixableCount} سطر فيه رموز تقنية غير صحيحة (مثل [ML]1) وتحتاج إصلاح الوسوم`);
      else setLastSaved("✅ جميع أقواس الرموز التقنية صحيحة");
      setTimeout(() => setLastSaved(""), 5000);
    }
  }, [state]);

  const handleApplyTagBracketFix = useCallback((key: string) => {
    if (!state || !tagBracketFixResults) return;
    const item = tagBracketFixResults.find((r) => r.key === key);
    if (!item) return;
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setTagBracketFixResults((prev) => prev ? prev.map((r) => r.key === key ? { ...r, status: 'accepted' } : r) : null);
  }, [state, tagBracketFixResults]);

  const handleRejectTagBracketFix = useCallback((key: string) => {
    setTagBracketFixResults((prev) => prev ? prev.map((r) => r.key === key ? { ...r, status: 'rejected' } : r) : null);
  }, []);

  const handleApplyAllTagBracketFixes = useCallback(() => {
    if (!state || !tagBracketFixResults) return;
    const pending = tagBracketFixResults.filter((r) => r.status === 'pending');
    const newTranslations = { ...state.translations };
    for (const item of pending) newTranslations[item.key] = item.after;
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setTagBracketFixResults((prev) => prev ? prev.map((r) => r.status === 'pending' ? { ...r, status: 'accepted' } : r) : null);
    setLastSaved(`✅ تم إصلاح أقواس ${pending.length} رمز تقني`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, tagBracketFixResults]);

  // === Arabic Text Fixes ===
  const handleScanArabicTextFixes = useCallback(() => {
    if (!state) return;
    const results = scanAllTextFixes(state.translations);
    setArabicTextFixResults(results);
    if (results.length === 0) { setLastSaved("✅ لا توجد مشاكل في النصوص العربية"); setTimeout(() => setLastSaved(""), 4000); }
    else toast({ title: `✨ تم العثور على ${results.length} مشكلة`, description: "راجع النتائج وقرر ما تريد تطبيقه" });
  }, [state]);

  const handleScanLonelyLam = useCallback(() => {
    if (!state) return;
    const results = scanLonelyLamFixes(state.translations);
    setArabicTextFixResults(results);
    if (results.length === 0) { setLastSaved("✅ لا توجد لام منفردة (ل) تحتاج إصلاح"); setTimeout(() => setLastSaved(""), 4000); }
    else toast({ title: `🚫 تم العثور على ${results.length} لام منفردة`, description: "راجع النتائج واختر ما تريد إصلاحه (ل → لا)" });
  }, [state]);

  const handleApplyArabicTextFix = useCallback((key: string, fixType: string) => {
    if (!state || !arabicTextFixResults) return;
    const item = arabicTextFixResults.find((r) => r.key === key && r.fixType === fixType);
    if (!item) return;
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setArabicTextFixResults((prev) => prev ? prev.map((r) => (r.key === key && r.fixType === fixType) ? { ...r, status: 'accepted' } : r) : null);
  }, [state, arabicTextFixResults]);

  const handleRejectArabicTextFix = useCallback((key: string, fixType: string) => {
    setArabicTextFixResults((prev) => prev ? prev.map((r) => (r.key === key && r.fixType === fixType) ? { ...r, status: 'rejected' } : r) : null);
  }, []);

  const handleApplyAllArabicTextFixes = useCallback(() => {
    if (!state || !arabicTextFixResults) return;
    const pending = arabicTextFixResults.filter((r) => r.status === 'pending');
    const newTranslations = { ...state.translations };
    for (const item of pending) newTranslations[item.key] = item.after;
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setArabicTextFixResults((prev) => prev ? prev.map((r) => r.status === 'pending' ? { ...r, status: 'accepted' } : r) : null);
    setLastSaved(`✅ تم تطبيق ${pending.length} إصلاح نصي`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, arabicTextFixResults]);

  return {
    // Diacritics
    handleScanDiacritics, handleApplyDiacriticsClean, handleRejectDiacriticsClean, handleApplyAllDiacriticsCleans, handleRemoveAllDiacritics,
    // Newline clean
    handleScanNewlines, handleApplyNewlineClean, handleRejectNewlineClean, handleApplyAllNewlineCleans,
    // Newline split
    handleScanNewlineSplit, handleApplyNewlineSplit, handleRejectNewlineSplit, handleApplyAllNewlineSplits, handleSplitSingleEntry,
    // NPC split
    handleScanNpcSplit, handleApplyNpcSplit, handleRejectNpcSplit, handleApplyAllNpcSplits, npcAffectedCount,
    // Line sync
    handleScanLineSync, handleApplyLineSync, handleRejectLineSync, handleApplyAllLineSyncs, lineSyncAffectedCount,
    // Unified split
    handleScanAllSplits, handleApplyUnifiedSplit, handleRejectUnifiedSplit, handleApplyAllUnifiedSplits,
    // Font test & flatten
    handleFontTest, handleFlattenAllNewlines,
    // Mirror chars
    handleScanMirrorChars, handleApplyMirrorCharsClean, handleRejectMirrorCharsClean, handleApplyAllMirrorCharsCleans,
    // Tag brackets
    handleScanTagBrackets, handleApplyTagBracketFix, handleRejectTagBracketFix, handleApplyAllTagBracketFixes,
    // Arabic text fixes
    handleScanArabicTextFixes, handleApplyArabicTextFix, handleRejectArabicTextFix, handleApplyAllArabicTextFixes, handleScanLonelyLam,
  };
}
