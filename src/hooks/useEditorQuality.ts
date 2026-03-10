import { useState, useEffect, useCallback, useRef } from "react";
import { hasArabicPresentationForms } from "@/lib/arabic-processing";
import { ExtractedEntry, EditorState, categorizeFile, categorizeBdatTable, hasTechnicalTags } from "@/components/editor/types";

export interface QualityStats {
  tooLong: number;
  nearLimit: number;
  missingTags: number;
  placeholderMismatch: number;
  total: number;
  problemKeys: Set<string>;
  damagedTags: number;
  damagedTagKeys: Set<string>;
}

export interface NeedsImproveCount {
  total: number;
  tooShort: number;
  tooLong: number;
  stuck: number;
  mixed: number;
}

interface UseEditorQualityProps {
  state: EditorState | null;
}

interface EntryCacheResult {
  translation: string;
  cat: string;
  isTranslated: boolean;
  qTooLong: boolean;
  qNearLimit: boolean;
  qMissingTags: boolean;
  qPlaceholderMismatch: boolean;
  damagedTags: boolean;
  niTooShort: boolean;
  niTooLong: boolean;
  niStuck: boolean;
  niMixed: boolean;
}

// Module-level constants to avoid re-creation per entry
const encoder = new TextEncoder();
const MIXED_LANG_WHITELIST = new Set([
  'HP','MP','AP','TP','EXP','ATK','DEF','NPC','HUD','FPS','XP','DLC','UI','OK','NG',
  'NOAH','MIO','LANZ','SENA','TAION','EUNIE','RIKU','MANANA',
  'AIONIOS','KEVES','AGNUS','COLONY',
  'ARTS','TALENT','CHAIN','ATTACK','OUROBOROS','INTERLINK','BLADE','BLADES',
  'ZL','ZR','PLUS','MINUS',
]);
const RE_TAG = /\[[^\]]*\]/g;
const RE_PLACEHOLDER = /\uFFFC/g;
const RE_CONTROL_CHARS = /[\uFFF9-\uFFFC\uE000-\uF8FF]/g;
const RE_ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const RE_ENGLISH_WORDS = /[a-zA-Z]{2,}/g;
const RE_BDAT_LABEL = /^.+?\[\d+\]\./;
const CHUNK_SIZE = 5000;

function computeEntryResult(entry: ExtractedEntry, translation: string, cat: string): EntryCacheResult {
  const trimmed = translation.trim();
  const isTranslated = trimmed !== '';
  let qTooLong = false, qNearLimit = false, qMissingTags = false, qPlaceholderMismatch = false;
  let damagedTags = false;
  let niTooShort = false, niTooLong = false, niStuck = false, niMixed = false;

  if (isTranslated) {
    if (entry.maxBytes > 0) {
      const bytes = encoder.encode(trimmed).length;
      if (bytes > entry.maxBytes) qTooLong = true;
      else if (bytes / entry.maxBytes > 0.8) qNearLimit = true;
    }

    RE_TAG.lastIndex = 0;
    const origTags: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = RE_TAG.exec(entry.original)) !== null) origTags.push(m[0]);
    for (const tag of origTags) {
      if (!trimmed.includes(tag)) { qMissingTags = true; break; }
    }

    RE_PLACEHOLDER.lastIndex = 0;
    const origPh = (entry.original.match(RE_PLACEHOLDER) || []).length;
    RE_PLACEHOLDER.lastIndex = 0;
    const transPh = (trimmed.match(RE_PLACEHOLDER) || []).length;
    if (origPh !== transPh) qPlaceholderMismatch = true;

    if (hasTechnicalTags(entry.original)) {
      RE_CONTROL_CHARS.lastIndex = 0;
      const origCC = (entry.original.match(RE_CONTROL_CHARS) || []).length;
      RE_CONTROL_CHARS.lastIndex = 0;
      const transCC = (trimmed.match(RE_CONTROL_CHARS) || []).length;
      if (transCC < origCC) damagedTags = true;
    }

    const origTrimmed = entry.original?.trim();
    if (origTrimmed && origTrimmed.length > 5 && trimmed.length < origTrimmed.length * 0.3) {
      niTooShort = true;
    }
    niTooLong = qTooLong;
    if (hasArabicPresentationForms(trimmed)) niStuck = true;

    // Mixed language check - only if has Arabic chars (fast pre-check)
    if (RE_ARABIC.test(trimmed)) {
      RE_TAG.lastIndex = 0;
      RE_PLACEHOLDER.lastIndex = 0;
      const stripped = trimmed.replace(RE_TAG, '').replace(RE_PLACEHOLDER, '').trim();
      if (stripped) {
        RE_ENGLISH_WORDS.lastIndex = 0;
        const englishWords = stripped.match(RE_ENGLISH_WORDS);
        if (englishWords && englishWords.length > 0) {
          const hasReal = englishWords.some(w => !MIXED_LANG_WHITELIST.has(w.toUpperCase()));
          if (hasReal) niMixed = true;
        }
      }
    }
  }

  return { translation, cat, isTranslated, qTooLong, qNearLimit, qMissingTags, qPlaceholderMismatch, damagedTags, niTooShort, niTooLong, niStuck, niMixed };
}

export function useEditorQuality({ state }: UseEditorQualityProps) {
  const [categoryProgress, setCategoryProgress] = useState<Record<string, { total: number; translated: number }>>({});
  const [qualityStats, setQualityStats] = useState<QualityStats>({ tooLong: 0, nearLimit: 0, missingTags: 0, placeholderMismatch: 0, total: 0, problemKeys: new Set<string>(), damagedTags: 0, damagedTagKeys: new Set<string>() });
  const [needsImproveCount, setNeedsImproveCount] = useState<NeedsImproveCount>({ total: 0, tooShort: 0, tooLong: 0, stuck: 0, mixed: 0 });
  const [translatedCount, setTranslatedCount] = useState(0);
  const combinedStatsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const cacheRef = useRef<Map<string, EntryCacheResult>>(new Map());
  const abortRef = useRef(false);

  const isTranslationTooShort = useCallback((entry: ExtractedEntry, translation: string): boolean => {
    if (!translation?.trim() || !entry.original?.trim()) return false;
    return translation.trim().length < entry.original.trim().length * 0.3 && entry.original.trim().length > 5;
  }, []);

  const isTranslationTooLong = useCallback((entry: ExtractedEntry, translation: string): boolean => {
    if (!translation?.trim() || entry.maxBytes <= 0) return false;
    return encoder.encode(translation).length > entry.maxBytes;
  }, []);

  const hasStuckChars = useCallback((translation: string): boolean => {
    if (!translation?.trim()) return false;
    return hasArabicPresentationForms(translation);
  }, []);

  const isMixedLanguage = useCallback((translation: string): boolean => {
    if (!translation?.trim()) return false;
    const stripped = translation.replace(RE_TAG, '').replace(RE_PLACEHOLDER, '').trim();
    if (!stripped) return false;
    const hasArabic = RE_ARABIC.test(stripped);
    RE_ENGLISH_WORDS.lastIndex = 0;
    const englishWords = stripped.match(RE_ENGLISH_WORDS) || [];
    const realEnglish = englishWords.filter(w => !MIXED_LANG_WHITELIST.has(w.toUpperCase()));
    return hasArabic && realEnglish.length > 0;
  }, []);

  const needsImprovement = useCallback((entry: ExtractedEntry, translation: string): boolean => {
    return isTranslationTooShort(entry, translation) || 
           isTranslationTooLong(entry, translation) || 
           hasStuckChars(translation) || 
           isMixedLanguage(translation);
  }, [isTranslationTooShort, isTranslationTooLong, hasStuckChars, isMixedLanguage]);

  // === Chunked async stats computation — non-blocking ===
  useEffect(() => {
    if (!state) return;
    if (combinedStatsTimerRef.current) clearTimeout(combinedStatsTimerRef.current);
    abortRef.current = true; // cancel any in-flight chunked processing

    combinedStatsTimerRef.current = setTimeout(() => {
      abortRef.current = false;
      const cache = cacheRef.current;
      const entries = state.entries;
      const translations = state.translations;
      const newCache = new Map<string, EntryCacheResult>();

      // Accumulators
      const progress: Record<string, { total: number; translated: number }> = {};
      let qTooLong = 0, qNearLimit = 0, qMissingTags = 0, qPlaceholderMismatch = 0;
      const problemKeys = new Set<string>();
      let niTooShort = 0, niTooLong = 0, niStuck = 0, niMixed = 0;
      const needsImproveKeys = new Set<string>();
      let translated = 0;
      let damagedTagsCount = 0;
      const damagedTagKeys = new Set<string>();

      let idx = 0;

      const processChunk = () => {
        if (abortRef.current) return; // new computation superseded this one

        const end = Math.min(idx + CHUNK_SIZE, entries.length);
        for (; idx < end; idx++) {
          const entry = entries[idx];
          const key = `${entry.msbtFile}:${entry.index}`;
          const translation = translations[key] || '';
          const isBdat = RE_BDAT_LABEL.test(entry.label);
          const sourceFile = entry.msbtFile.startsWith('bdat-bin:') ? entry.msbtFile.split(':')[1] : entry.msbtFile.startsWith('bdat:') ? entry.msbtFile.slice(5) : undefined;
          const cat = isBdat ? categorizeBdatTable(entry.label, sourceFile) : categorizeFile(entry.msbtFile);

          const cached = cache.get(key);
          let result: EntryCacheResult;
          if (cached && cached.translation === translation && cached.cat === cat) {
            result = cached;
          } else {
            result = computeEntryResult(entry, translation, cat);
          }
          newCache.set(key, result);

          if (!progress[cat]) progress[cat] = { total: 0, translated: 0 };
          progress[cat].total++;
          if (result.isTranslated) {
            progress[cat].translated++;
            translated++;
            if (result.qTooLong) { qTooLong++; problemKeys.add(key); }
            if (result.qNearLimit) { qNearLimit++; problemKeys.add(key); }
            if (result.qMissingTags) { qMissingTags++; problemKeys.add(key); }
            if (result.qPlaceholderMismatch) { qPlaceholderMismatch++; problemKeys.add(key); }
            if (result.damagedTags) { damagedTagsCount++; damagedTagKeys.add(key); problemKeys.add(key); }
            if (result.niTooShort) { niTooShort++; needsImproveKeys.add(key); }
            if (result.niTooLong) { niTooLong++; needsImproveKeys.add(key); }
            if (result.niStuck) { niStuck++; needsImproveKeys.add(key); }
            if (result.niMixed) { niMixed++; needsImproveKeys.add(key); }
          }
        }

        if (idx < entries.length) {
          // Yield to main thread, then continue
          setTimeout(processChunk, 0);
        } else {
          // Done — commit results
          cacheRef.current = newCache;
          setCategoryProgress(progress);
          setQualityStats({ tooLong: qTooLong, nearLimit: qNearLimit, missingTags: qMissingTags, placeholderMismatch: qPlaceholderMismatch, total: problemKeys.size, problemKeys, damagedTags: damagedTagsCount, damagedTagKeys });
          setNeedsImproveCount({ total: needsImproveKeys.size, tooShort: niTooShort, tooLong: niTooLong, stuck: niStuck, mixed: niMixed });
          setTranslatedCount(translated);
        }
      };

      processChunk();
    }, 500);
    return () => {
      abortRef.current = true;
      if (combinedStatsTimerRef.current) clearTimeout(combinedStatsTimerRef.current);
    };
  }, [state?.entries, state?.translations]);

  return {
    categoryProgress,
    qualityStats,
    needsImproveCount,
    translatedCount,
    isTranslationTooShort,
    isTranslationTooLong,
    hasStuckChars,
    isMixedLanguage,
    needsImprovement,
  };
}
