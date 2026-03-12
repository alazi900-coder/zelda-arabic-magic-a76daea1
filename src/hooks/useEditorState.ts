import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import { idbSet, idbGet } from "@/lib/idb-storage";
import { processArabicText, hasArabicChars as hasArabicCharsProcessing, hasArabicPresentationForms, removeArabicPresentationForms } from "@/lib/arabic-processing";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { fixTagBracketsStrict, hasTechnicalBracketTag } from "@/lib/tag-bracket-fix";

import { balanceLines, visualLength, splitEvenlyByLines } from "@/lib/balance-lines";
import { scanAllTextFixes } from "@/lib/arabic-text-fixes";

import { useEditorGlossary } from "@/hooks/useEditorGlossary";
import { useEditorFileIO } from "@/hooks/useEditorFileIO";
import { useEditorQuality } from "@/hooks/useEditorQuality";
import { useEditorBuild } from "@/hooks/useEditorBuild";
import { useEditorTranslation } from "@/hooks/useEditorTranslation";
import { useEditorSettings } from "@/hooks/useEditorSettings";
import { useEditorScanResults } from "@/hooks/useEditorScanResults";
import {
  ExtractedEntry, EditorState, AUTOSAVE_DELAY, AI_BATCH_SIZE, PAGE_SIZE,
  categorizeFile, categorizeBdatTable, hasArabicChars, unReverseBidi, isTechnicalText, hasTechnicalTags,
  ReviewIssue, ReviewSummary, ReviewResults, ShortSuggestion, ImproveResult,
  restoreTagsLocally, FilterStatus, FilterTechnical,
} from "@/components/editor/types";
export function useEditorState() {
  // === Extracted hooks ===
  const settings = useEditorSettings();
  const {
    arabicNumerals, mirrorPunctuation, userGeminiKey, aiModel, translationProvider,
    myMemoryEmail, myMemoryCharsUsed, addMyMemoryChars, aiRequestsToday, aiRequestsMonth,
    addAiRequest, rebalanceNewlines, npcMaxLines, npcMode, npcSplitCharLimit, setNpcSplitCharLimit,
    newlineSplitCharLimit, setNewlineSplitCharLimit, autoSmartReview, setAutoSmartReview,
    enhancedMemory, saveToEnhancedMemory,
  } = settings;

  const scanResults = useEditorScanResults();
  const {
    reviewing, setReviewing, reviewResults, setReviewResults,
    suggestingShort, setSuggestingShort, shortSuggestions, setShortSuggestions,
    improvingTranslations, setImprovingTranslations, improveResults, setImproveResults,
    fixingMixed, setFixingMixed,
    checkingConsistency, setCheckingConsistency, consistencyResults, setConsistencyResults,
    scanningSentences, setScanningSentences,
    newlineCleanResults, setNewlineCleanResults, diacriticsCleanResults, setDiacriticsCleanResults,
    
    mirrorCharsResults, setMirrorCharsResults, tagBracketFixResults, setTagBracketFixResults,
    arabicTextFixResults, setArabicTextFixResults, newlineSplitResults, setNewlineSplitResults,
    npcSplitResults, setNpcSplitResults, lineSyncResults, setLineSyncResults,
    unifiedSplitResults, setUnifiedSplitResults,
    smartReviewFindings, setSmartReviewFindings, smartReviewing, setSmartReviewing,
    glossaryComplianceResults, setGlossaryComplianceResults, checkingGlossaryCompliance, setCheckingGlossaryCompliance,
    enhanceResults, setEnhanceResults, enhancingTranslations, setEnhancingTranslations,
    advancedAnalysisTab, setAdvancedAnalysisTab,
    literalResults, setLiteralResults, styleResults, setStyleResults,
    consistencyCheckResult, setConsistencyCheckResult,
    alternativeResults, setAlternativeResults, fullAnalysisResults, setFullAnalysisResults,
    advancedAnalyzing, setAdvancedAnalyzing, advancedAnalysisCancelRef,
    autoCorrectResults, setAutoCorrectResults, autoCorrectApplied, setAutoCorrectApplied,
    autoCorrectProgress, setAutoCorrectProgress, autoCorrectAbortRef,
    weakTranslations, setWeakTranslations, detectingWeak, setDetectingWeak,
    detectWeakProgress, setDetectWeakProgress, detectWeakAbortRef,
    reviewedKeysRef, addReviewedKeys, clearReviewedKeys,
  } = scanResults;

  // === Core state ===
  const [state, setState] = useState<EditorState | null>(null);
  const [search, setSearch] = useState("");
  const [filterFile, setFilterFile] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterTechnical, setFilterTechnical] = useState<FilterTechnical>("all");
  const [filterTable, setFilterTable] = useState<string>("all");
  const [filterColumn, setFilterColumn] = useState<string>("all");
  const [translateProgress, setTranslateProgress] = useState("");
  const [lastSaved, setLastSaved] = useState<string>("");
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("");
  const [quickReviewMode, setQuickReviewMode] = useState(false);
  const [quickReviewIndex, setQuickReviewIndex] = useState(0);
  const [showQualityStats, setShowQualityStats] = useState(false);
  const [previousTranslations, setPreviousTranslations] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [showRetranslateConfirm, setShowRetranslateConfirm] = useState(false);
  const [pinnedKeys, setPinnedKeys] = useState<Set<string> | null>(null);
  const [isSearchPinned, setIsSearchPinned] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);



  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const forceSaveRef = useRef<() => Promise<void>>(async () => {});
  const { user } = useAuth();
  const [pendingRecovery, setPendingRecovery] = useState<{ translationCount: number; entryCount: number; lastDate?: string } | null>(null);
  const [hasStoredOriginals, setHasStoredOriginals] = useState(false);
  const [originalsDetectedAsPreviousBuild, setOriginalsDetectedAsPreviousBuild] = useState(false);

  const glossary = useEditorGlossary({
    state, setState, setLastSaved, setCloudSyncing, setCloudStatus, userId: user?.id,
  });
  const { activeGlossary, parseGlossaryMap } = glossary;

  const quality = useEditorQuality({ state });
  const { isTranslationTooShort, isTranslationTooLong, hasStuckChars, isMixedLanguage, needsImprovement, qualityStats, needsImproveCount, categoryProgress, translatedCount } = quality;

  const build = useEditorBuild({ state, setState, setLastSaved, arabicNumerals, mirrorPunctuation, gameType: "xenoblade", forceSaveRef });
  const { building, buildProgress, dismissBuildProgress, applyingArabic, buildStats, setBuildStats, buildPreview, showBuildConfirm, setShowBuildConfirm, bdatFileStats, integrityResult, showIntegrityDialog, setShowIntegrityDialog, checkingIntegrity, handleApplyArabicProcessing, handleUndoArabicProcessing, handlePreBuild, handleBuild, handleCheckIntegrity } = build;


  // === Protection handlers ===
  const toggleProtection = (key: string) => {
    if (!state) return;
    const newProtected = new Set(state.protectedEntries || []);
    if (newProtected.has(key)) newProtected.delete(key);
    else newProtected.add(key);
    setState(prev => prev ? { ...prev, protectedEntries: newProtected } : null);
  };

  const toggleTechnicalBypass = (key: string) => {
    if (!state) return;
    const newBypass = new Set(state.technicalBypass || []);
    if (newBypass.has(key)) newBypass.delete(key);
    else newBypass.add(key);
    setState(prev => prev ? { ...prev, technicalBypass: newBypass } : null);
  };

  const handleProtectAllArabic = () => {
    if (!state) return;
    const arabicRegex = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF\u0750-\u077F\u08A0-\u08FF]/;
    const newProtected = new Set(state.protectedEntries || []);
    let count = 0;
    for (const entry of state.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      if (arabicRegex.test(entry.original) && !newProtected.has(key)) {
        newProtected.add(key);
        count++;
      }
    }
    setState(prev => prev ? { ...prev, protectedEntries: newProtected } : null);
    setLastSaved(`✅ تم حماية ${count} نص معرّب من العكس`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  const handleFixReversed = (entry: ExtractedEntry) => {
    if (!state) return;
    const key = `${entry.msbtFile}:${entry.index}`;
    const corrected = unReverseBidi(entry.original);
    const newProtected = new Set(state.protectedEntries || []);
    newProtected.add(key);
    setState(prev => prev ? {
      ...prev,
      translations: { ...prev.translations, [key]: corrected },
      protectedEntries: newProtected,
    } : null);
  };

  const handleFixAllReversed = () => {
    if (!state) return;
    const newTranslations = { ...state.translations };
    const newProtected = new Set(state.protectedEntries || []);
    let count = 0, skippedProtected = 0, skippedTranslated = 0, skippedSame = 0;

    for (const entry of state.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      if (hasArabicChars(entry.original)) {
        if (newProtected.has(key)) { skippedProtected++; continue; }
        const existing = newTranslations[key]?.trim();
        const isAutoDetected = !existing || existing === entry.original || existing === entry.original.trim();
        if (isAutoDetected) {
          const corrected = unReverseBidi(entry.original);
          if (corrected !== entry.original) {
            newTranslations[key] = corrected;
            newProtected.add(key);
            count++;
          } else { skippedSame++; }
        } else { skippedTranslated++; }
      }
    }

    setState(prev => prev ? { ...prev, translations: newTranslations, protectedEntries: newProtected } : null);
    const parts: string[] = [];
    if (count > 0) parts.push("تم تصحيح: " + count + " نص");
    if (skippedProtected > 0) parts.push("محمية: " + skippedProtected);
    if (skippedTranslated > 0) parts.push("مترجمة: " + skippedTranslated);
    if (skippedSame > 0) parts.push("بلا تغيير: " + skippedSame);
    setLastSaved((count > 0 ? "✅ " : "⚠️ ") + parts.join(" | "));
    setTimeout(() => setLastSaved(""), 5000);
  };

  // === Load / Save ===
  const detectPreTranslated = useCallback((editorState: EditorState): Record<string, string> => {
    const arabicRegex = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF\u0750-\u077F\u08A0-\u08FF]/;
    const autoTranslations: Record<string, string> = {};
    for (const entry of editorState.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      if (!editorState.translations[key]?.trim() && arabicRegex.test(entry.original)) {
        autoTranslations[key] = entry.original;
      }
    }
    return autoTranslations;
  }, []);

  const loadSavedState = useCallback(async () => {
    const stored = await idbGet<EditorState>("editorState");
    if (!stored) return null;
    const validKeys = new Set(stored.entries.map(e => `${e.msbtFile}:${e.index}`));
    const autoTranslations = detectPreTranslated({
      entries: stored.entries,
      translations: stored.translations || {},
      protectedEntries: new Set(),
    });

    // Build legacy key mapping for old sequential keys
    const entriesByFile: Record<string, ExtractedEntry[]> = {};
    for (const entry of stored.entries) {
      const parts = entry.msbtFile.split(':');
      const filename = parts.length >= 2 ? parts[1] : entry.msbtFile;
      if (!entriesByFile[filename]) entriesByFile[filename] = [];
      entriesByFile[filename].push(entry);
    }

    const filteredStored: Record<string, string> = {};
    let legacyConverted = 0;
    for (const [k, v] of Object.entries(stored.translations || {})) {
      if (validKeys.has(k)) {
        filteredStored[k] = v;
      } else {
        // Try legacy key conversion: "bdat-bin:filename.bdat:NUMBER"
        const parts = k.split(':');
        if (parts.length === 3 && !isNaN(parseInt(parts[2], 10))) {
          const filename = parts[1];
          const idx = parseInt(parts[2], 10);
          const fileEntries = entriesByFile[filename];
          if (fileEntries && idx < fileEntries.length) {
            const entry = fileEntries[idx];
            const newKey = `${entry.msbtFile}:${entry.index}`;
            if (!filteredStored[newKey]) {
              filteredStored[newKey] = v;
              legacyConverted++;
            }
          }
        }
      }
    }

    const mergedTranslations = { ...autoTranslations, ...filteredStored };
    const protectedSet = new Set<string>(
      Array.isArray(stored.protectedEntries) ? (stored.protectedEntries as string[]) : []
    );
    const bypassSet = new Set<string>(
      Array.isArray((stored as any).technicalBypass) ? ((stored as any).technicalBypass as string[]) : []
    );
    const arabicRegex = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF\u0750-\u077F\u08A0-\u08FF]/;
    for (const entry of stored.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      if (arabicRegex.test(entry.original)) {
        if (hasArabicPresentationForms(entry.original)) continue;
        const existingTranslation = mergedTranslations[key]?.trim();
        if (existingTranslation && existingTranslation !== entry.original && existingTranslation !== entry.original.trim()) {
          protectedSet.add(key);
        }
      }
    }
    // === One-time auto-repair: fix ONLY entries where translation has FEWER tags than original ===
    let autoFixCount = 0;
    for (const entry of stored.entries) {
      if (!hasTechnicalTags(entry.original)) continue;
      const key = `${entry.msbtFile}:${entry.index}`;
      const trans = mergedTranslations[key] || '';
      if (!trans.trim()) continue;
      const origTags = entry.original.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || [];
      const transTags = trans.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || [];
      if (transTags.length < origTags.length) {
        const fixed = restoreTagsLocally(entry.original, trans);
        if (fixed !== trans) {
          mergedTranslations[key] = fixed;
          autoFixCount++;
        }
      }
    }

    const finalState: EditorState = {
      entries: stored.entries,
      translations: mergedTranslations,
      protectedEntries: protectedSet,
      technicalBypass: bypassSet,
    };

    // Save immediately if we auto-fixed or converted legacy keys
    if (autoFixCount > 0 || legacyConverted > 0) {
      await idbSet("editorState", {
        entries: finalState.entries,
        translations: finalState.translations,
        protectedEntries: Array.from(finalState.protectedEntries || []),
        technicalBypass: Array.from(finalState.technicalBypass || []),
      });
    }

    return { finalState, autoTranslations, autoFixCount, legacyConverted };
  }, [detectPreTranslated]);

  const handleRecoverSession = useCallback(async () => {
    const result = await loadSavedState();
    if (!result) return;
    const { finalState, autoTranslations, autoFixCount, legacyConverted } = result;
    setState(finalState);
    setPendingRecovery(null);

    const autoCount = Object.keys(autoTranslations).length;
    const parts: string[] = [];
    if (autoCount > 0) parts.push(`اكتشاف ${autoCount} نص معرّب مسبقاً`);
    if (autoFixCount > 0) parts.push(`🔧 إصلاح تلقائي لـ ${autoFixCount} رمز تالف`);
    if (legacyConverted > 0) parts.push(`🔄 تحويل ${legacyConverted} مفتاح قديم`);
    setLastSaved(parts.length > 0 ? `تم التحميل + ${parts.join(' + ')}` : "تم التحميل من الحفظ السابق ✅");
  }, [loadSavedState]);

  const handleStartFresh = useCallback(async () => {
    await idbSet("editorState", null);
    setPendingRecovery(null);
    // Load demo data
    const demoEntries: ExtractedEntry[] = [
      { msbtFile: "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:0:name", index: 0, label: "SYS_CharacterName[0].name", original: "Noah", maxBytes: 24 },
      { msbtFile: "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:1:name", index: 0, label: "SYS_CharacterName[1].name", original: "Mio", maxBytes: 18 },
      { msbtFile: "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:2:name", index: 0, label: "SYS_CharacterName[2].name", original: "Eunie", maxBytes: 30 },
      { msbtFile: "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:3:name", index: 0, label: "SYS_CharacterName[3].name", original: "Taion", maxBytes: 30 },
    ];
    setState({
      entries: demoEntries,
      translations: {},
      protectedEntries: new Set(),
      technicalBypass: new Set(),
      isDemo: true,
    });
    setLastSaved("🆕 تم البدء من جديد");
  }, []);

  useEffect(() => {
    const loadState = async () => {
      // Check if stored originals exist
      const savedOriginals = await idbGet<Record<string, string>>("originalTexts");
      if (savedOriginals && Object.keys(savedOriginals).length > 0) {
        setHasStoredOriginals(true);
      }

      const stored = await idbGet<EditorState>("editorState");
      if (stored && stored.entries && stored.entries.length > 0) {
        const isFreshExtraction = !!(stored as any).freshExtraction;
        
        if (isFreshExtraction) {
          // Freshly extracted data — load directly, no recovery dialog
          // Clear the flag so next time recovery dialog shows normally
          const autoTranslations = detectPreTranslated({
            entries: stored.entries,
            translations: stored.translations || {},
            protectedEntries: new Set(),
          });
          const mergedTranslations = { ...autoTranslations, ...(stored.translations || {}) };
          
          // Check if originals contain presentation forms (re-extraction from built file)
          const presentationFormsCount = stored.entries.filter((e: ExtractedEntry) => hasArabicPresentationForms(e.original)).length;
          let finalEntries = stored.entries;
          
          if (presentationFormsCount > 0 && savedOriginals && Object.keys(savedOriginals).length > 0) {
            // Auto-restore originals from saved English texts
            let restoredCount = 0;
            finalEntries = stored.entries.map((entry: ExtractedEntry) => {
              const key = `${entry.msbtFile}:${entry.index}`;
              const savedOriginal = savedOriginals[key];
              if (savedOriginal && hasArabicPresentationForms(entry.original)) {
                restoredCount++;
                return { ...entry, original: savedOriginal };
              }
              return entry;
            });
            if (restoredCount > 0) {
              setOriginalsDetectedAsPreviousBuild(true);
              toast({
                title: "🔄 تم استعادة النصوص الأصلية",
                description: `تم اكتشاف ${presentationFormsCount} نص من ملف مبني سابقاً — استُعيد ${restoredCount} نص أصلي إنجليزي`,
                duration: 8000,
              });
            }
          } else if (presentationFormsCount > 0) {
            setOriginalsDetectedAsPreviousBuild(true);
            toast({
              title: "⚠️ ملف مبني سابقاً",
              description: "تم اكتشاف نصوص عربية مُشكَّلة في الأصل. لا توجد نصوص إنجليزية محفوظة للاستعادة — استخرج من الملف الأصلي أولاً ثم أعد البناء.",
              duration: 10000,
            });
          }

          setState({
            entries: finalEntries,
            translations: mergedTranslations,
            protectedEntries: new Set(),
            technicalBypass: new Set(),
            isDemo: false,
          });
          // Remove freshExtraction flag for future loads
          await idbSet("editorState", {
            entries: finalEntries,
            translations: mergedTranslations,
          });
          const autoCount = Object.keys(autoTranslations).length;
          setLastSaved(`تم تحميل ${stored.entries.length} نص مستخرج` + (autoCount > 0 ? ` + اكتشاف ${autoCount} نص معرّب` : ''));
          return;
        }
        
        // Count real translations (not auto-detected)
        const translationCount = Object.values(stored.translations || {}).filter(v => v?.trim()).length;
        if (translationCount > 0) {
          // Show recovery dialog
          setPendingRecovery({
            translationCount,
            entryCount: stored.entries.length,
          });
          return;
        }
        // Entries exist but no translations yet — load them directly
        setState({
          entries: stored.entries,
          translations: stored.translations || {},
          protectedEntries: new Set(stored.protectedEntries || []),
          technicalBypass: new Set(stored.technicalBypass || []),
          isDemo: false,
        });
        setLastSaved("تم تحميل نصوص مستخرجة");
        return;
      }
      // No saved state — show demo
      const demoEntries: ExtractedEntry[] = [
        { msbtFile: "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:0:name", index: 0, label: "SYS_CharacterName[0].name", original: "Noah", maxBytes: 24 },
        { msbtFile: "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:1:name", index: 0, label: "SYS_CharacterName[1].name", original: "Mio", maxBytes: 18 },
        { msbtFile: "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:2:name", index: 0, label: "SYS_CharacterName[2].name", original: "Eunie", maxBytes: 30 },
        { msbtFile: "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:3:name", index: 0, label: "SYS_CharacterName[3].name", original: "Taion", maxBytes: 30 },
        { msbtFile: "bdat-bin:SYS_ItemName.bdat:SYS_ItemName:0:name", index: 0, label: "SYS_ItemName[0].name", original: "Lucky Clover", maxBytes: 72 },
        { msbtFile: "bdat-bin:SYS_ItemName.bdat:SYS_ItemName:1:name", index: 0, label: "SYS_ItemName[1].name", original: "Nopon Coin", maxBytes: 60 },
        { msbtFile: "bdat-bin:MNU_MainMenu.bdat:MNU_MainMenu:0:caption", index: 0, label: "MNU_MainMenu[0].caption", original: "Party", maxBytes: 36 },
        { msbtFile: "bdat-bin:MNU_MainMenu.bdat:MNU_MainMenu:1:caption", index: 0, label: "MNU_MainMenu[1].caption", original: "Quests", maxBytes: 42 },
        { msbtFile: "bdat-bin:MNU_MainMenu.bdat:MNU_MainMenu:2:caption", index: 0, label: "MNU_MainMenu[2].caption", original: "Map", maxBytes: 24 },
        { msbtFile: "bdat-bin:FLD_NpcTalk.bdat:FLD_NpcTalk:0:msg", index: 0, label: "FLD_NpcTalk[0].msg", original: "\uFFF9Press \uE000\uFFFA to speak with \uFFFBNoah\uFFFC", maxBytes: 300 },
        { msbtFile: "bdat-bin:FLD_NpcTalk.bdat:FLD_NpcTalk:1:msg", index: 0, label: "FLD_NpcTalk[1].msg", original: "You need \uFFF9\uE002 3 Nopon Coins\uFFFA to unlock this\uFFFB.", maxBytes: 350 },
        { msbtFile: "bdat-bin:QST_QuestName.bdat:QST_QuestName:0:name", index: 0, label: "QST_QuestName[0].name", original: "Beyond the Boundary", maxBytes: 120 },
        { msbtFile: "bdat-bin:QST_QuestName.bdat:QST_QuestName:1:name", index: 0, label: "QST_QuestName[1].name", original: "A Life Sent On", maxBytes: 90 },
      ];
      const demoTranslations: Record<string, string> = {
        "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:0:name:0": "نوا",
        "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:1:name:0": "ميو",
        "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:2:name:0": "يوني",
        "bdat-bin:SYS_CharacterName.bdat:SYS_CharacterName:3:name:0": "تايون",
        "bdat-bin:SYS_ItemName.bdat:SYS_ItemName:0:name:0": "البرسيم المحظوظ",
        "bdat-bin:SYS_ItemName.bdat:SYS_ItemName:1:name:0": "عملة النوبون",
        "bdat-bin:MNU_MainMenu.bdat:MNU_MainMenu:0:caption:0": "الفريق",
        "bdat-bin:MNU_MainMenu.bdat:MNU_MainMenu:1:caption:0": "المهام",
        "bdat-bin:MNU_MainMenu.bdat:MNU_MainMenu:2:caption:0": "الخريطة",
        "bdat-bin:FLD_NpcTalk.bdat:FLD_NpcTalk:0:msg:0": "اضغط للتحدث مع نوا",
        "bdat-bin:FLD_NpcTalk.bdat:FLD_NpcTalk:1:msg:0": "تحتاج 3 عملات نوبون لفتح هذا.",
        "bdat-bin:QST_QuestName.bdat:QST_QuestName:0:name:0": "ما وراء الحدود",
        "bdat-bin:QST_QuestName.bdat:QST_QuestName:1:name:0": "حياة تمضي قُدُماً",
      };
      setState({
        entries: demoEntries,
        translations: demoTranslations,
        protectedEntries: new Set(),
        technicalBypass: new Set(),
        isDemo: true,
      });
      setLastSaved("تم تحميل بيانات تجريبية");
    };
    loadState();
  }, []);

  const saveToIDB = useCallback(async (editorState: EditorState) => {
    await idbSet("editorState", {
      entries: editorState.entries,
      translations: editorState.translations,
      protectedEntries: Array.from(editorState.protectedEntries || []),
      technicalBypass: Array.from(editorState.technicalBypass || []),
    });
    setLastSaved(`آخر حفظ: ${new Date().toLocaleTimeString("ar-SA")}`);
  }, []);

  // Keep a ref to the latest state for forceSave
  const latestStateRef = useRef<EditorState | null>(null);
  useEffect(() => { latestStateRef.current = state; }, [state]);

  // Force-save: flush pending autosave immediately (call before build)
  const forceSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = undefined;
    }
    const s = latestStateRef.current;
    if (s) {
      await saveToIDB(s);
      console.log('[FORCE-SAVE] Saved', Object.keys(s.translations).length, 'translation keys to IDB');
    }
  }, [saveToIDB]);

  // Wire the ref so useEditorBuild can call it
  useEffect(() => { forceSaveRef.current = forceSave; }, [forceSave]);

  useEffect(() => {
    if (!state) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveToIDB(state), AUTOSAVE_DELAY);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state?.translations, saveToIDB]);

  // === Computed values ===
  const msbtFiles = useMemo(() => {
    if (!state) return [];
    const set = new Set(state.entries.map(e => e.msbtFile));
    return Array.from(set).sort();
  }, [state?.entries]);

  // === Count multi-line translations ===
  const multiLineCount = useMemo(() => {
    if (!state) return 0;
    let count = 0;
    for (const v of Object.values(state.translations)) {
      if (v && v.includes('\n')) count++;
    }
    return count;
  }, [state?.translations]);

  // === Count entries where English original has \n ===
  const newlinesCount = useMemo(() => {
    if (!state) return 0;
    return state.entries.filter(e => e.original.includes('\n')).length;
  }, [state?.entries]);


  // === Count entries with technical tags ===
  const tagsCount = useMemo(() => {
    if (!state) return 0;
    return state.entries.filter(e => hasTechnicalTags(e.original)).length;
  }, [state?.entries]);

  // === Count fuzzy-matched entries ===
  const fuzzyCount = useMemo(() => {
    if (!state?.fuzzyScores) return 0;
    return Object.keys(state.fuzzyScores).length;
  }, [state?.fuzzyScores]);

  // === Count entries where translation exceeds max_utf8_bytes ===
  const byteOverflowCount = useMemo(() => {
    if (!state) return 0;
    let count = 0;
    for (const e of state.entries) {
      if (e.maxBytes <= 0) continue;
      const key = `${e.msbtFile}:${e.index}`;
      const translation = state.translations[key] || '';
      if (!translation.trim()) continue;
      const byteUsed = new TextEncoder().encode(translation).length;
      if (byteUsed > e.maxBytes) count++;
    }
    return count;
  }, [state?.entries, state?.translations]);

  // === Extract unique BDAT table and column names from labels ===
  const bdatTableNames = useMemo(() => {
    if (!state) return [];
    const set = new Set<string>();
    for (const e of state.entries) {
      const match = e.label.match(/^(.+?)\[\d+\]\./);
      if (match) set.add(match[1]);
    }
    return Array.from(set).sort();
  }, [state?.entries]);

  const bdatTableCounts = useMemo(() => {
    if (!state) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const e of state.entries) {
      const match = e.label.match(/^(.+?)\[\d+\]\./);
      if (match) {
        counts[match[1]] = (counts[match[1]] || 0) + 1;
      }
    }
    return counts;
  }, [state?.entries]);

  const bdatColumnNames = useMemo(() => {
    if (!state) return [];
    const set = new Set<string>();
    for (const e of state.entries) {
      const match = e.label.match(/\.([^.]+)$/);
      const tblMatch = e.label.match(/^(.+?)\[\d+\]\./);
      if (match && tblMatch) {
        if (filterTable === "all" || tblMatch[1] === filterTable) {
          set.add(match[1]);
        }
      }
    }
    return Array.from(set).sort();
  }, [state?.entries, filterTable]);

  const bdatColumnCounts = useMemo(() => {
    if (!state) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const e of state.entries) {
      const match = e.label.match(/^(.+?)\[\d+\]\.(.+)$/);
      if (match) {
        if (filterTable === "all" || match[1] === filterTable) {
          counts[match[2]] = (counts[match[2]] || 0) + 1;
        }
      }
    }
    return counts;
  }, [state?.entries, filterTable]);

  // === Filtered entries ===
  const filteredEntries = useMemo(() => {
    if (!state) return [];
    // If search is pinned, show only pinned keys (bypass all filters)
    if (pinnedKeys) {
      return state.entries.filter(e => pinnedKeys.has(`${e.msbtFile}:${e.index}`));
    }
    return state.entries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      const translation = state.translations[key] || '';
      const isTranslated = translation.trim() !== '';
      const isTechnical = isTechnicalText(e.original);
      const matchSearch = !search ||
        e.original.toLowerCase().includes(search.toLowerCase()) ||
        e.label.includes(search) ||
        translation.includes(search);
      const matchFile = filterFile === "all" || e.msbtFile === filterFile;
      const isBdat = /^.+?\[\d+\]\./.test(e.label);
      const sourceFile = e.msbtFile.startsWith('bdat-bin:') ? e.msbtFile.split(':')[1] : e.msbtFile.startsWith('bdat:') ? e.msbtFile.slice(5) : undefined;
      const matchCategory = filterCategory.length === 0 || filterCategory.includes(isBdat ? categorizeBdatTable(e.label, sourceFile, e.original) : categorizeFile(e.msbtFile));
      const matchStatus = 
        filterStatus === "all" || 
        (filterStatus === "translated" && isTranslated) ||
        (filterStatus === "untranslated" && !isTranslated) ||
        (filterStatus === "problems" && qualityStats.problemKeys.has(key)) ||
        (filterStatus === "needs-improve" && isTranslated && needsImprovement(e, translation)) ||
        (filterStatus === "too-short" && isTranslated && isTranslationTooShort(e, translation)) ||
        (filterStatus === "too-long" && isTranslated && isTranslationTooLong(e, translation)) ||
        (filterStatus === "stuck-chars" && isTranslated && hasStuckChars(translation)) ||
        (filterStatus === "mixed-lang" && isTranslated && isMixedLanguage(translation)) ||
        (filterStatus === "has-tags" && hasTechnicalTags(e.original)) ||
        (filterStatus === "damaged-tags" && qualityStats.damagedTagKeys.has(key)) ||
        (filterStatus === "fuzzy" && !!(state.fuzzyScores?.[key])) ||
        (filterStatus === "byte-overflow" && e.maxBytes > 0 && isTranslated && new TextEncoder().encode(translation).length > e.maxBytes) ||
        (filterStatus === "has-newlines" && e.original.includes('\n'));
      const matchTechnical = 
        filterTechnical === "all" ||
        (filterTechnical === "only" && isTechnical) ||
        (filterTechnical === "exclude" && !isTechnical);
      // BDAT table/column filters
      const labelMatch = e.label.match(/^(.+?)\[(\d+)\]\.(.+)$/);
      const matchTable = filterTable === "all" || (labelMatch && labelMatch[1] === filterTable);
      const matchColumn = filterColumn === "all" || (labelMatch && labelMatch[3] === filterColumn);
      return matchSearch && matchFile && matchCategory && matchStatus && matchTechnical && matchTable && matchColumn;
    });
  }, [state, search, filterFile, filterCategory, filterStatus, filterTechnical, filterTable, filterColumn, qualityStats.problemKeys, needsImprovement, isTranslationTooShort, isTranslationTooLong, hasStuckChars, isMixedLanguage, pinnedKeys]);

  useEffect(() => { setCurrentPage(0); }, [search, filterFile, filterCategory, filterStatus, filterTechnical, filterTable, filterColumn]);

  const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);
  const paginatedEntries = useMemo(() => {
    const start = currentPage * PAGE_SIZE;
    return filteredEntries.slice(start, start + PAGE_SIZE);
  }, [filteredEntries, currentPage]);


  // === Translation handlers ===
  const lastTagFixToastRef = useRef(0);
  const updateTranslation = (key: string, value: string) => {
    if (!state) return;
    const prev = state.translations[key] || '';
    if (prev !== value) {
      setPreviousTranslations(old => ({ ...old, [key]: prev }));
    }

    // Auto-validate: check for missing/foreign technical tags
    let finalValue = value;
    const entry = state.entries.find(e => `${e.msbtFile}:${e.index}` === key);
    if (entry && hasTechnicalTags(entry.original) && value.trim()) {
      const fixed = restoreTagsLocally(entry.original, value);
      if (fixed !== value) {
        finalValue = fixed;
        // Throttle toast to max once per 5 seconds
        const now = Date.now();
        if (now - lastTagFixToastRef.current > 5000) {
          lastTagFixToastRef.current = now;
          toast({
            title: "🔧 إصلاح تلقائي للرموز التقنية",
            description: "تم اكتشاف رموز مفقودة أو محرفة وتم إصلاحها تلقائياً",
            duration: 3000,
          });
        }
      }
    }

    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: finalValue } } : null);

    // Track translation history for versioning
    if (finalValue.trim()) {
      import("@/components/editor/TranslationToolsPanel").then(m => m.addToHistory(key, finalValue)).catch(() => {});
    }
  };

  const handleUndoTranslation = (key: string) => {
    if (previousTranslations[key] !== undefined) {
      setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: previousTranslations[key] } } : null);
      setPreviousTranslations(old => { const copy = { ...old }; delete copy[key]; return copy; });
    }
  };

  const translation = useEditorTranslation({
    state, setState, setLastSaved, setTranslateProgress, setPreviousTranslations, updateTranslation,
    filterCategory, activeGlossary, parseGlossaryMap, paginatedEntries, filteredEntries, totalPages, setCurrentPage, userGeminiKey, translationProvider, myMemoryEmail, addMyMemoryChars, addAiRequest, rebalanceNewlines, npcMaxLines, npcMode, npcSplitCharLimit, aiModel,
  });
  const { translating, translatingSingle, tmStats, glossarySessionStats, handleTranslateSingle, handleAutoTranslate, handleTranslatePage, handleTranslateAllPages, handleTranslateFromGlossaryOnly, handleStopTranslate, handleRetranslatePage: _handleRetranslatePageRaw, handleFixDamagedTags, pendingPageTranslations, oldPageTranslations, pageTranslationOriginals, showPageCompare, applyPendingTranslations: _applyPendingRaw, discardPendingTranslations, glossaryPreviewEntries, showGlossaryPreview, applyGlossaryPreview, discardGlossaryPreview } = translation;

  const handleSmartReviewRef = useRef<(() => void) | null>(null);
  const triggerAutoSmartReview = useCallback(() => {
    if (autoSmartReview) {
      setTimeout(() => {
        handleSmartReviewRef.current?.();
      }, 500);
    }
  }, [autoSmartReview]);

  // Wrap applyPendingTranslations to auto-trigger smart review
  const applyPendingTranslations = useCallback((selectedKeys?: Set<string>) => {
    _applyPendingRaw(selectedKeys);
    triggerAutoSmartReview();
  }, [_applyPendingRaw, triggerAutoSmartReview]);

  // Wrap handleRetranslatePage to auto-trigger smart review after completion
  const handleRetranslatePage = useCallback(async () => {
    await _handleRetranslatePageRaw();
    triggerAutoSmartReview();
  }, [_handleRetranslatePageRaw, triggerAutoSmartReview]);

  // === Local (offline) fix for damaged tags — no AI needed ===
  const handleLocalFixDamagedTag = useCallback((entry: ExtractedEntry) => {
    if (!state) return;
    const key = `${entry.msbtFile}:${entry.index}`;
    const translation = state.translations[key] || '';
    if (!translation.trim()) return;
    const fixed = restoreTagsLocally(entry.original, translation);
    if (fixed !== translation) {
      setPreviousTranslations(old => ({ ...old, [key]: translation }));
      setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: fixed } } : null);
    }
  }, [state, setState, setPreviousTranslations]);

  const handleLocalFixAllDamagedTags = useCallback((damagedTagKeys: Set<string>) => {
    if (!state || damagedTagKeys.size === 0) return;
    const updates: Record<string, string> = {};
    const prevTrans: Record<string, string> = {};
    for (const entry of state.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      if (!damagedTagKeys.has(key)) continue;
      const translation = state.translations[key] || '';
      if (!translation.trim()) continue;
      const fixed = restoreTagsLocally(entry.original, translation);
      if (fixed !== translation) {
        prevTrans[key] = translation;
        updates[key] = fixed;
      }
    }
    const fixedCount = Object.keys(updates).length;
    if (fixedCount === 0) {
      setLastSaved("لا توجد رموز تالفة يمكن إصلاحها محلياً");
      setTimeout(() => setLastSaved(""), 3000);
      return;
    }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    toast({ title: "✅ تم الإصلاح المحلي", description: `تم استعادة الرموز في ${fixedCount} نص بدون ذكاء اصطناعي` });
    setLastSaved(`✅ تم إصلاح ${fixedCount} نص محلياً`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, setState, setPreviousTranslations, setLastSaved]);

  // Apply tag repairs only for selected keys
  const handleLocalFixSelectedTags = useCallback((selectedKeys: string[]) => {
    if (!state || selectedKeys.length === 0) return;
    const updates: Record<string, string> = {};
    const prevTrans: Record<string, string> = {};
    for (const entry of state.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      if (!selectedKeys.includes(key)) continue;
      const translation = state.translations[key] || '';
      if (!translation.trim()) continue;
      const fixed = restoreTagsLocally(entry.original, translation);
      if (fixed !== translation) {
        prevTrans[key] = translation;
        updates[key] = fixed;
      }
    }
    const fixedCount = Object.keys(updates).length;
    if (fixedCount === 0) return;
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    toast({ title: "✅ تم الإصلاح", description: `تم استعادة الرموز في ${fixedCount} نص` });
    setLastSaved(`✅ تم إصلاح ${fixedCount} نص`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, setState, setPreviousTranslations, setLastSaved]);

  // === Accept/Reject fuzzy match handlers ===
  const handleAcceptFuzzy = useCallback((key: string) => {
    if (!state?.fuzzyScores?.[key]) return;
    const newScores = { ...state.fuzzyScores };
    delete newScores[key];
    setState(prev => prev ? { ...prev, fuzzyScores: newScores } : null);
    toast({ title: "✅ تم القبول", description: "تم اعتماد الترجمة المستوردة" });
  }, [state, setState]);

  const handleRejectFuzzy = useCallback((key: string) => {
    if (!state?.fuzzyScores?.[key]) return;
    const newScores = { ...state.fuzzyScores };
    delete newScores[key];
    const newTranslations = { ...state.translations };
    setPreviousTranslations(old => ({ ...old, [key]: newTranslations[key] || '' }));
    delete newTranslations[key];
    setState(prev => prev ? { ...prev, fuzzyScores: newScores, translations: newTranslations } : null);
    toast({ title: "❌ تم الرفض", description: "تم حذف الترجمة المستوردة" });
  }, [state, setState, setPreviousTranslations]);

  const handleAcceptAllFuzzy = useCallback(() => {
    if (!state?.fuzzyScores || Object.keys(state.fuzzyScores).length === 0) return;
    const count = Object.keys(state.fuzzyScores).length;
    setState(prev => prev ? { ...prev, fuzzyScores: {} } : null);
    toast({ title: "✅ تم قبول الكل", description: `تم اعتماد ${count} ترجمة مستوردة` });
  }, [state, setState]);

  const handleRejectAllFuzzy = useCallback(() => {
    if (!state?.fuzzyScores || Object.keys(state.fuzzyScores).length === 0) return;
    const keys = Object.keys(state.fuzzyScores);
    const newTranslations = { ...state.translations };
    const prev: Record<string, string> = {};
    for (const key of keys) {
      prev[key] = newTranslations[key] || '';
      delete newTranslations[key];
    }
    setPreviousTranslations(old => ({ ...old, ...prev }));
    setState(s => s ? { ...s, fuzzyScores: {}, translations: newTranslations } : null);
    toast({ title: "❌ تم رفض الكل", description: `تم حذف ${keys.length} ترجمة مستوردة` });
  }, [state, setState, setPreviousTranslations]);

  // === Redistribute tags at word boundaries for already-fixed translations ===
  const handleRedistributeTags = useCallback(() => {
    if (!state) return;
    const charRegexG = /[\uFFF9-\uFFFC\uE000-\uF8FF]/g;
    const updates: Record<string, string> = {};
    const prevTrans: Record<string, string> = {};
    for (const entry of state.entries) {
      if (!hasTechnicalTags(entry.original)) continue;
      const key = `${entry.msbtFile}:${entry.index}`;
      const trans = state.translations[key] || '';
      if (!trans.trim()) continue;
      // Strip ALL tags from translation first, then let restoreTagsLocally
      // reinsert them at correct word boundaries from scratch
      const strippedTrans = trans.replace(charRegexG, '');
      if (!strippedTrans.trim()) continue;
      const fixed = restoreTagsLocally(entry.original, strippedTrans);
      if (fixed !== trans) {
        prevTrans[key] = trans;
        updates[key] = fixed;
      }
    }
    const count = Object.keys(updates).length;
    if (count === 0) {
      toast({ title: "ℹ️ لا تغيير", description: "جميع الرموز موزعة بشكل صحيح بالفعل" });
      return;
    }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    toast({ title: "✅ تم إعادة التوزيع", description: `تم إعادة توزيع الرموز في ${count} نص عند حدود الكلمات` });
    setLastSaved(`✅ إعادة توزيع ${count} نص`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, setState, setPreviousTranslations, setLastSaved]);

  // === Review handlers ===
  const handleReviewTranslations = async () => {
    if (!state) return;
    setReviewing(true);
    setReviewResults(null);
    toast({ title: "🔍 بدأت المراجعة التلقائية", description: "جاري فحص الترجمات في الخلفية..." });
    try {
      const reviewEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], maxBytes: e.maxBytes || 0 }));
      if (reviewEntries.length === 0) { setReviewResults({ issues: [], summary: { total: 0, errors: 0, warnings: 0, checked: 0 } }); return; }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: reviewEntries, glossary: activeGlossary, aiModel }),
      });
      if (!response.ok) throw new Error(`خطأ ${response.status}`);
      setReviewResults(await response.json());
    } catch (err) {
      setTranslateProgress(`❌ خطأ في المراجعة: ${err instanceof Error ? err.message : 'غير معروف'}`);
      setTimeout(() => setTranslateProgress(""), 4000);
    } finally { setReviewing(false); }
  };

  const handleSuggestShorterTranslations = async () => {
    if (!state || !reviewResults) return;
    setSuggestingShort(true);
    setShortSuggestions(null);
    toast({ title: "✂️ اقتراح اختصارات", description: "جاري البحث عن ترجمات أقصر..." });
    try {
      const reviewEntries = state.entries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], maxBytes: e.maxBytes || 0 }));
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: reviewEntries, glossary: activeGlossary, action: 'suggest-short', aiModel }),
      });
      if (!response.ok) throw new Error(`خطأ ${response.status}`);
      const data = await response.json();
      setShortSuggestions(data.suggestions || []);
    } catch { setShortSuggestions([]); }
    finally { setSuggestingShort(false); }
  };

  const handleApplyShorterTranslation = (key: string, suggested: string) => {
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: suggested } } : null);
  };

  const handleApplyAllShorterTranslations = () => {
    if (!state || !shortSuggestions) return;
    const updates: Record<string, string> = {};
    shortSuggestions.forEach((s) => { updates[s.key] = s.suggested; });
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setShortSuggestions(null);
    setLastSaved(`✅ تم تطبيق ${Object.keys(updates).length} اقتراح قصير`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  // === Fix handlers ===
  const handleFixAllStuckCharacters = () => {
    if (!state) return;
    let fixedCount = 0;
    const updates: Record<string, string> = {};
    for (const [key, translation] of Object.entries(state.translations)) {
      if (translation?.trim() && hasArabicPresentationForms(translation)) {
        const fixed = removeArabicPresentationForms(translation);
        if (fixed !== translation) { updates[key] = fixed; fixedCount++; }
      }
    }
    if (fixedCount === 0) { setLastSaved("لا توجد ترجمات بها أحرف ملتصقة"); setTimeout(() => setLastSaved(""), 3000); return; }
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setLastSaved(`✅ تم إصلاح ${fixedCount} ترجمة من الأحرف الملتصقة`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  const handleFixMixedLanguage = async () => {
    if (!state) return;
    setFixingMixed(true);
    setTranslateProgress("🌐 جاري إصلاح النصوص المختلطة...");
    try {
      const mixedEntries = state.entries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; const t = state.translations[key]; return t?.trim() && isMixedLanguage(t); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`] }));
      if (mixedEntries.length === 0) { setTranslateProgress("لا توجد نصوص مختلطة للإصلاح"); setTimeout(() => setTranslateProgress(""), 3000); return; }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const BATCH = 20;
      const allUpdates: Record<string, string> = {};
      let processed = 0;
      for (let i = 0; i < mixedEntries.length; i += BATCH) {
        const batch = mixedEntries.slice(i, i + BATCH);
        setTranslateProgress(`🌐 إصلاح النصوص المختلطة... ${processed}/${mixedEntries.length}`);
        const response = await fetch(`${supabaseUrl}/functions/v1/fix-mixed-language`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: batch, glossary: activeGlossary }),
        });
        if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.error || `خطأ ${response.status}`); }
        const data = await response.json();
        if (data.translations) {
          for (const [key, val] of Object.entries(data.translations)) {
            if (state.translations[key] !== val) {
              setPreviousTranslations(prev => ({ ...prev, [key]: state.translations[key] || '' }));
              allUpdates[key] = val as string;
            }
          }
        }
        processed += batch.length;
      }
      const fixedCount = Object.keys(allUpdates).length;
      if (fixedCount > 0) setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...allUpdates } } : null);
      setTranslateProgress(`✅ تم إصلاح ${fixedCount} ترجمة مختلطة اللغة`);
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) {
      setTranslateProgress(`❌ خطأ: ${err instanceof Error ? err.message : 'غير معروف'}`);
      setTimeout(() => setTranslateProgress(""), 4000);
    } finally { setFixingMixed(false); }
  };

  // === File IO (extracted to useEditorFileIO) ===
  const filterLabel = filterCategory.length > 0 ? filterCategory.join('+')
    : filterFile !== "all" ? filterFile
    : "";

  // === Clear translations (with undo) ===
  const isFilterActive = filterLabel !== "";
  const [clearUndoBackup, setClearUndoBackup] = useState<Record<string, string> | null>(null);
  const clearUndoTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleClearTranslations = useCallback((scope: 'all' | 'filtered') => {
    if (!state) return;
    // Save backup for undo
    const backup = { ...state.translations };
    setClearUndoBackup(backup);
    // Clear previous undo timer
    if (clearUndoTimerRef.current) clearTimeout(clearUndoTimerRef.current);
    clearUndoTimerRef.current = setTimeout(() => setClearUndoBackup(null), 15000);

    if (scope === 'all') {
      setState(prev => prev ? { ...prev, translations: {} } : null);
      setLastSaved(`🗑️ تم مسح جميع الترجمات (${Object.keys(state.translations).length})`);
    } else {
      const keysToRemove = new Set(filteredEntries.map(e => `${e.msbtFile}:${e.index}`));
      const newTranslations = { ...state.translations };
      let removed = 0;
      for (const key of keysToRemove) {
        if (newTranslations[key]?.trim()) {
          delete newTranslations[key];
          removed++;
        }
      }
      setState(prev => prev ? { ...prev, translations: newTranslations } : null);
      setLastSaved(`🗑️ تم مسح ${removed} ترجمة (${filterLabel || 'القسم المحدد'})`);
    }
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, filteredEntries, filterLabel]);

  const handleUndoClear = useCallback(() => {
    if (!clearUndoBackup) return;
    setState(prev => prev ? { ...prev, translations: clearUndoBackup } : null);
    setClearUndoBackup(null);
    if (clearUndoTimerRef.current) clearTimeout(clearUndoTimerRef.current);
    setLastSaved("↩️ تم التراجع عن المسح واستعادة الترجمات ✅");
    setTimeout(() => setLastSaved(""), 4000);
  }, [clearUndoBackup]);

  const fileIO = useEditorFileIO({ state, setState, setLastSaved, filteredEntries, filterLabel });
  const { normalizeArabicPresentationForms } = fileIO;

  // === Smart Review (AI deep analysis) ===
  const handleSmartReview = async () => {
    if (!state) return;
    setSmartReviewing(true);
    setSmartReviewFindings(null);
    toast({ title: "🔬 بدأت المراجعة الذكية", description: "تحليل عميق للترجمات في الخلفية..." });
    try {
      const reviewEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim() && !reviewedKeysRef.current.has(key); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], maxBytes: e.maxBytes || 0 }));
      if (reviewEntries.length === 0) {
        toast({ title: "لا توجد ترجمات للمراجعة" });
        return;
      }
      setTranslateProgress(`🔬 جاري المراجعة الذكية العميقة (${reviewEntries.length} نص)...`);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: reviewEntries, glossary: activeGlossary, action: 'smart-review', aiModel }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `خطأ ${response.status}`);
      }
      const data = await response.json();
      setSmartReviewFindings(data.findings || []);
      const count = data.findings?.length || 0;
      setTranslateProgress(count > 0 ? `🔬 تم العثور على ${count} مشكلة` : `✅ لم يتم العثور على مشاكل!`);
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) {
      toast({ title: "خطأ في المراجعة الذكية", description: err instanceof Error ? err.message : 'غير معروف', variant: "destructive" });
      setTranslateProgress("");
    } finally { setSmartReviewing(false); }
  };
  handleSmartReviewRef.current = handleSmartReview;

  const handleApplySmartFix = (key: string, fix: string) => {
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: fix } } : null);
    setSmartReviewFindings(prev => prev ? prev.filter(f => f.key !== key) : null);
  };

  const handleApplyAllSmartFixes = () => {
    if (!smartReviewFindings || !state) return;
    const updates: Record<string, string> = {};
    for (const f of smartReviewFindings) {
      if (f.fix) updates[f.key] = f.fix;
    }
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setSmartReviewFindings([]);
    toast({ title: `✅ تم تطبيق ${Object.keys(updates).length} إصلاح` });
  };

  const handleDismissSmartFinding = (_key: string) => {
    // Dismissal is handled in the panel via local state
  };

  // === Grammar Check (dedicated AI grammar analysis) ===
  const handleGrammarCheck = async () => {
    if (!state) return;
    setSmartReviewing(true);
    setSmartReviewFindings(null);
    toast({ title: "📝 بدأ فحص القواعد النحوية", description: "تحليل الأخطاء النحوية والإملائية..." });
    try {
      const reviewEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], maxBytes: e.maxBytes || 0 }));
      if (reviewEntries.length === 0) {
        toast({ title: "لا توجد ترجمات للفحص" });
        return;
      }
      setTranslateProgress(`📝 جاري فحص القواعد النحوية (${reviewEntries.length} نص)...`);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: reviewEntries, glossary: activeGlossary, action: 'grammar-check', aiModel }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `خطأ ${response.status}`);
      }
      const data = await response.json();
      setSmartReviewFindings(data.findings || []);
      const count = data.findings?.length || 0;
      setTranslateProgress(count > 0 ? `📝 تم العثور على ${count} خطأ نحوي/إملائي` : `✅ النصوص سليمة نحوياً!`);
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) {
      toast({ title: "خطأ في فحص القواعد", description: err instanceof Error ? err.message : 'غير معروف', variant: "destructive" });
      setTranslateProgress("");
    } finally { setSmartReviewing(false); }
  };

  // === Context Review (context-aware translation review) ===
  const handleContextReview = async () => {
    if (!state) return;
    setSmartReviewing(true);
    setSmartReviewFindings(null);
    toast({ title: "🎯 بدأت المراجعة السياقية", description: "تحليل الترجمات في سياقها..." });
    try {
      const reviewEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], maxBytes: e.maxBytes || 0 }));
      if (reviewEntries.length === 0) {
        toast({ title: "لا توجد ترجمات للمراجعة" });
        return;
      }
      // Build context from surrounding translated entries
      const contextEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .slice(0, 30)
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`] }));

      setTranslateProgress(`🎯 جاري المراجعة السياقية (${reviewEntries.length} نص)...`);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: reviewEntries, glossary: activeGlossary, action: 'context-review', aiModel, contextEntries }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `خطأ ${response.status}`);
      }
      const data = await response.json();
      setSmartReviewFindings(data.findings || []);
      const count = data.findings?.length || 0;
      setTranslateProgress(count > 0 ? `🎯 تم العثور على ${count} مشكلة سياقية` : `✅ الترجمات متسقة سياقياً!`);
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) {
      toast({ title: "خطأ في المراجعة السياقية", description: err instanceof Error ? err.message : 'غير معروف', variant: "destructive" });
      setTranslateProgress("");
    } finally { setSmartReviewing(false); }
  };

  // === Auto-Correct (bulk spelling/grammar auto-fix) ===
  const handleStopAutoCorrect = () => { autoCorrectAbortRef.current?.abort(); };

  const handleAutoCorrect = async () => {
    if (!state) return;
    setSmartReviewing(true);
    setAutoCorrectResults(null);
    setAutoCorrectApplied(false);
    setAutoCorrectProgress(null);
    const abortCtrl = new AbortController();
    autoCorrectAbortRef.current = abortCtrl;
    try {
      const reviewEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], maxBytes: e.maxBytes || 0 }));
      if (reviewEntries.length === 0) { toast({ title: "لا توجد ترجمات للتصحيح" }); return; }
      const BATCH = 30;
      const batches: typeof reviewEntries[] = [];
      for (let i = 0; i < reviewEntries.length; i += BATCH) batches.push(reviewEntries.slice(i, i + BATCH));
      setAutoCorrectProgress({ current: 0, total: reviewEntries.length });
      setTranslateProgress(`✏️ جاري التصحيح الإملائي (0/${reviewEntries.length})...`);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const allCorrections: { key: string; original: string; current: string; corrected: string }[] = [];
      let processed = 0;
      for (const batch of batches) {
        if (abortCtrl.signal.aborted) break;
        const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: batch, action: 'auto-correct', aiModel }),
          signal: abortCtrl.signal,
        });
        if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.error || `خطأ ${response.status}`); }
        const data = await response.json();
        if (data.corrections) allCorrections.push(...data.corrections);
        processed += batch.length;
        setAutoCorrectProgress({ current: Math.min(processed, reviewEntries.length), total: reviewEntries.length });
        setTranslateProgress(`✏️ جاري التصحيح الإملائي (${Math.min(processed, reviewEntries.length)}/${reviewEntries.length})...`);
      }
      if (abortCtrl.signal.aborted) toast({ title: "⏹️ تم إيقاف التصحيح", description: `تم تصحيح ${allCorrections.length} نص` });
      if (allCorrections.length === 0) {
        setTranslateProgress("✅ جميع الترجمات سليمة إملائياً!");
      } else {
        const newTranslations = { ...state.translations };
        for (const c of allCorrections) newTranslations[c.key] = c.corrected;
        setState(prev => prev ? { ...prev, translations: newTranslations } : null);
        setAutoCorrectResults(allCorrections);
        setAutoCorrectApplied(true);
        setTranslateProgress(`✏️ تم تصحيح ${allCorrections.length} ترجمة تلقائياً`);
        toast({ title: `✅ تم تصحيح ${allCorrections.length} خطأ إملائي/نحوي` });
      }
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toast({ title: "خطأ في التصحيح التلقائي", description: err instanceof Error ? err.message : 'غير معروف', variant: "destructive" });
      setTranslateProgress("");
    } finally { setSmartReviewing(false); setAutoCorrectProgress(null); autoCorrectAbortRef.current = null; }
  };

  // === Detect Weak Translations ===
  const handleStopDetectWeak = () => { detectWeakAbortRef.current?.abort(); };

  const handleDetectWeak = async () => {
    if (!state) return;
    setDetectingWeak(true);
    setWeakTranslations(null);
    setDetectWeakProgress(null);
    const abortCtrl = new AbortController();
    detectWeakAbortRef.current = abortCtrl;
    try {
      const reviewEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], maxBytes: e.maxBytes || 0 }));
      if (reviewEntries.length === 0) { toast({ title: "لا توجد ترجمات للفحص" }); return; }
      const BATCH = 30;
      const batches: typeof reviewEntries[] = [];
      for (let i = 0; i < reviewEntries.length; i += BATCH) batches.push(reviewEntries.slice(i, i + BATCH));
      setDetectWeakProgress({ current: 0, total: reviewEntries.length });
      setTranslateProgress(`🔍 جاري تقييم الجودة (0/${reviewEntries.length})...`);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const allWeak: { key: string; original: string; current: string; score: number; reason: string; suggestion: string }[] = [];
      let processed = 0;
      for (const batch of batches) {
        if (abortCtrl.signal.aborted) break;
        const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: batch, glossary: activeGlossary, action: 'detect-weak', aiModel }),
          signal: abortCtrl.signal,
        });
        if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.error || `خطأ ${response.status}`); }
        const data = await response.json();
        if (data.weakEntries) allWeak.push(...data.weakEntries);
        processed += batch.length;
        setDetectWeakProgress({ current: Math.min(processed, reviewEntries.length), total: reviewEntries.length });
        setTranslateProgress(`🔍 جاري تقييم الجودة (${Math.min(processed, reviewEntries.length)}/${reviewEntries.length})...`);
      }
      if (abortCtrl.signal.aborted) toast({ title: "⏹️ تم إيقاف الكشف", description: `تم فحص ${processed} من ${reviewEntries.length}` });
      setWeakTranslations(allWeak);
      const count = allWeak.length;
      setTranslateProgress(count > 0 ? `🔍 تم العثور على ${count} ترجمة ركيكة` : `✅ جميع الترجمات بجودة عالية!`);
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toast({ title: "خطأ في كشف الترجمات", description: err instanceof Error ? err.message : 'غير معروف', variant: "destructive" });
      setTranslateProgress("");
    } finally { setDetectingWeak(false); setDetectWeakProgress(null); detectWeakAbortRef.current = null; }
  };

  const handleApplyWeakFix = (key: string, suggestion: string) => {
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: suggestion } } : null);
    setWeakTranslations(prev => prev ? prev.filter(w => w.key !== key) : null);
  };

  const handleApplyAllWeakFixes = () => {
    if (!weakTranslations || !state) return;
    const updates: Record<string, string> = {};
    for (const w of weakTranslations) {
      if (w.suggestion) updates[w.key] = w.suggestion;
    }
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setWeakTranslations([]);
    toast({ title: `✅ تم تطبيق ${Object.keys(updates).length} تحسين` });
  };

  // === Context-aware Re-translation ===
  const handleContextRetranslate = async () => {
    if (!state) return;
    setSmartReviewing(true);
    toast({ title: "🎯 بدأت إعادة الترجمة بالسياق", description: "إعادة ترجمة النصوص مع مراعاة السياق المحيط..." });
    try {
      const reviewEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], maxBytes: e.maxBytes || 0 }));
      if (reviewEntries.length === 0) { toast({ title: "لا توجد ترجمات لإعادة الترجمة" }); return; }

      // Build context from all translated entries in the current filter
      const contextEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .slice(0, 30)
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`] }));

      setTranslateProgress(`🎯 جاري إعادة الترجمة بالسياق (${reviewEntries.length} نص)...`);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: reviewEntries, glossary: activeGlossary, action: 'context-retranslate', aiModel, contextEntries }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `خطأ ${response.status}`);
      }
      const data = await response.json();
      const retranslations = data.retranslations || [];
      if (retranslations.length === 0) {
        setTranslateProgress("✅ لم يتم العثور على تحسينات سياقية");
        setTimeout(() => setTranslateProgress(""), 4000);
      } else {
        // Show as smart review findings for review before applying
        const findings = retranslations.map((r: any) => ({
          key: r.key,
          original: r.original,
          current: r.current,
          type: 'improvement' as const,
          issue: r.changes || 'تحسين سياقي',
          fix: r.retranslated,
        }));
        setSmartReviewFindings(findings);
        setTranslateProgress(`🎯 تم العثور على ${retranslations.length} تحسين سياقي`);
        setTimeout(() => setTranslateProgress(""), 4000);
      }
    } catch (err) {
      toast({ title: "خطأ في إعادة الترجمة", description: err instanceof Error ? err.message : 'غير معروف', variant: "destructive" });
      setTranslateProgress("");
    } finally { setSmartReviewing(false); }
  };

  // === Context-aware Translation Enhancement ===
  const handleEnhanceTranslations = async () => {
    if (!state) return;
    setEnhancingTranslations(true);
    setEnhanceResults(null);
    toast({ title: "🎯 بدأ التحسين السياقي", description: "تحليل الترجمات مع مراعاة السياق والشخصيات..." });
    
    try {
      const translatedEntries = filteredEntries
        .filter(e => {
          const key = `${e.msbtFile}:${e.index}`;
          return state.translations[key]?.trim();
        })
        .slice(0, 20) // Limit for performance
        .map(e => ({
          key: `${e.msbtFile}:${e.index}`,
          original: e.original,
          translation: state.translations[`${e.msbtFile}:${e.index}`],
          fileName: e.msbtFile,
        }));

      if (translatedEntries.length === 0) {
        setTranslateProgress("⚠️ لا توجد ترجمات للتحسين في النطاق المحدد");
        setTimeout(() => setTranslateProgress(""), 3000);
        setEnhancingTranslations(false);
        return;
      }

      setTranslateProgress(`🎯 جاري تحليل ${translatedEntries.length} ترجمة سياقياً...`);
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/enhance-translations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entries: translatedEntries,
          action: 'analyze',
          glossary: activeGlossary?.split('\n').slice(0, 200).join('\n'), // Send limited glossary
          aiModel,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `خطأ ${response.status}`);
      }

      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const withIssues = data.results.filter((r: any) => r.issues?.length > 0 || r.suggestions?.length > 0);
        setEnhanceResults(data.results);
        setTranslateProgress(`✅ تم تحليل ${data.results.length} ترجمة — ${withIssues.length} تحتاج تحسين`);
      } else {
        setTranslateProgress("✅ جميع الترجمات جيدة — لا توجد اقتراحات");
      }
      setTimeout(() => setTranslateProgress(""), 5000);

    } catch (err) {
      console.error('Enhance error:', err);
      toast({
        title: "خطأ في التحسين السياقي",
        description: err instanceof Error ? err.message : 'خطأ غير متوقع',
        variant: "destructive",
      });
      setTranslateProgress("");
    } finally {
      setEnhancingTranslations(false);
    }
  };

  const handleApplyEnhanceSuggestion = (key: string, newTranslation: string) => {
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: newTranslation } } : null);
    setEnhanceResults(prev => prev ? prev.filter(r => r.key !== key) : null);
    toast({ title: "✅ تم تطبيق الاقتراح" });
  };

  const handleApplyAllEnhanceSuggestions = () => {
    if (!enhanceResults || !state) return;
    const updates: Record<string, string> = {};
    for (const r of enhanceResults) {
      if (r.preferredSuggestion) {
        updates[r.key] = r.preferredSuggestion;
      } else if (r.suggestions?.[0]?.text) {
        updates[r.key] = r.suggestions[0].text;
      }
    }
    if (Object.keys(updates).length === 0) {
      toast({ title: "⚠️ لا توجد اقتراحات للتطبيق" });
      return;
    }
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setEnhanceResults([]);
    toast({ title: `✅ تم تطبيق ${Object.keys(updates).length} تحسين` });
  };

  const handleCloseEnhanceResults = () => {
    setEnhanceResults(null);
  };

  // === Advanced Translation Analysis (with batch processing) ===
  const ADVANCED_BATCH_SIZE = 50; // Larger batches for speed
  const MAX_ENTRIES_FOR_ANALYSIS = 500; // Max entries to analyze
  
  const handleAdvancedAnalysis = async (action: import("@/components/editor/AdvancedTranslationPanel").AnalysisAction) => {
    if (!state) return;
    setAdvancedAnalyzing(true);
    setAdvancedAnalysisTab(action);
    advancedAnalysisCancelRef.current = false;
    
    // Clear previous results
    setLiteralResults(null);
    setStyleResults(null);
    setConsistencyCheckResult(null);
    setAlternativeResults(null);
    setFullAnalysisResults(null);
    
    const actionLabels: Record<string, string> = {
      'literal-detect': '🔍 كشف الترجمات الحرفية',
      'style-unify': '🎨 توحيد الأسلوب',
      'consistency-check': '🛡️ فحص الاتساق الشامل',
      'alternatives': '📝 اقتراحات بديلة متعددة',
      'full-analysis': '🧠 تحليل شامل متكامل',
    };
    
    toast({ title: actionLabels[action], description: "جاري تجهيز النصوص للتحليل..." });
    
    try {
      // Get all translated entries (up to max limit)
      const allTranslatedEntries = filteredEntries
        .filter(e => {
          const key = `${e.msbtFile}:${e.index}`;
          return state.translations[key]?.trim();
        })
        .slice(0, MAX_ENTRIES_FOR_ANALYSIS)
        .map(e => ({
          key: `${e.msbtFile}:${e.index}`,
          original: e.original,
          translation: state.translations[`${e.msbtFile}:${e.index}`],
          fileName: e.msbtFile,
        }));

      if (allTranslatedEntries.length === 0) {
        setTranslateProgress("⚠️ لا توجد ترجمات للتحليل في النطاق المحدد");
        setTimeout(() => setTranslateProgress(""), 3000);
        setAdvancedAnalyzing(false);
        return;
      }

      const totalEntries = allTranslatedEntries.length;
      const totalBatches = Math.ceil(totalEntries / ADVANCED_BATCH_SIZE);
      
      setTranslateProgress(`${actionLabels[action]} — ${totalEntries} نص (${totalBatches} دفعات)`);
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const glossarySlice = activeGlossary?.split('\n').slice(0, 150).join('\n');
      
      // Accumulators for batch results
      let allLiteralResults: any[] = [];
      let allStyleResults: any[] = [];
      let allAlternativeResults: any[] = [];
      let allFullResults: any[] = [];
      let allInconsistencies: any[] = [];
      let totalScore = 0;
      let summaries: string[] = [];
      
      // Helper to commit partial results so user can see progress
      const commitPartialResults = (action: string) => {
        if (action === 'literal-detect' && allLiteralResults.length > 0) {
          setLiteralResults([...allLiteralResults]);
        } else if (action === 'style-unify' && allStyleResults.length > 0) {
          setStyleResults([...allStyleResults]);
        } else if (action === 'alternatives' && allAlternativeResults.length > 0) {
          setAlternativeResults([...allAlternativeResults]);
        } else if (action === 'full-analysis' && allFullResults.length > 0) {
          setFullAnalysisResults([...allFullResults]);
        } else if (action === 'consistency-check' && allInconsistencies.length > 0) {
          const unique = allInconsistencies.reduce((acc: any[], item) => {
            if (!acc.find(i => i.term === item.term)) acc.push(item);
            return acc;
          }, []);
          setConsistencyCheckResult({ inconsistencies: unique, score: totalBatches > 0 ? Math.round(totalScore / (batchIdx || 1)) : 0, summary: summaries.join(' | ') });
        }
      };
      
      let batchIdx = 0;
      // Process in batches
      for (batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
        // Check for cancellation — commit what we have so far
        if (advancedAnalysisCancelRef.current) {
          commitPartialResults(action);
          const processed = batchIdx * ADVANCED_BATCH_SIZE;
          setTranslateProgress(`⏹️ تم إيقاف التحليل — تم معالجة ${processed} من ${totalEntries} نص. النتائج الجزئية معروضة.`);
          setTimeout(() => setTranslateProgress(""), 6000);
          break;
        }
        
        const start = batchIdx * ADVANCED_BATCH_SIZE;
        const end = Math.min(start + ADVANCED_BATCH_SIZE, totalEntries);
        const batchEntries = allTranslatedEntries.slice(start, end);
        
        const progress = Math.round(((batchIdx + 1) / totalBatches) * 100);
        setTranslateProgress(`${actionLabels[action]} — دفعة ${batchIdx + 1}/${totalBatches} (${progress}%) — ${end}/${totalEntries} نص ⏸️`);
        
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/translation-analysis`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              entries: batchEntries,
              action,
              glossary: glossarySlice,
              aiModel,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 429) {
              toast({ title: "⚠️ حد الطلبات", description: "انتظر قليلاً ثم أعد المحاولة", variant: "destructive" });
              break; // Stop processing on rate limit
            }
            console.error(`Batch ${batchIdx + 1} error:`, errorData);
            continue; // Skip failed batch but continue
          }

          const data = await response.json();
          
          // Accumulate results based on action type
          if (action === 'literal-detect' && data.results) {
            const mapped = data.results.map((r: any, i: number) => ({
              key: batchEntries[r.index ?? i]?.key || `unknown:${start + i}`,
              original: batchEntries[r.index ?? i]?.original || '',
              translation: batchEntries[r.index ?? i]?.translation || '',
              ...r,
            }));
            allLiteralResults.push(...mapped);
          } else if (action === 'style-unify' && data.results) {
            const mapped = data.results.map((r: any, i: number) => ({
              key: batchEntries[r.index ?? i]?.key || `unknown:${start + i}`,
              original: batchEntries[r.index ?? i]?.original || '',
              translation: batchEntries[r.index ?? i]?.translation || '',
              ...r,
            }));
            allStyleResults.push(...mapped);
          } else if (action === 'consistency-check') {
            if (data.inconsistencies) allInconsistencies.push(...data.inconsistencies);
            if (data.score) totalScore += data.score;
            if (data.summary) summaries.push(data.summary);
          } else if (action === 'alternatives' && data.results) {
            const mapped = data.results.map((r: any, i: number) => ({
              key: batchEntries[r.index ?? i]?.key || `unknown:${start + i}`,
              original: batchEntries[r.index ?? i]?.original || '',
              translation: batchEntries[r.index ?? i]?.translation || '',
              ...r,
            }));
            allAlternativeResults.push(...mapped);
          } else if (action === 'full-analysis' && data.results) {
            const mapped = data.results.map((r: any, i: number) => ({
              key: batchEntries[r.index ?? i]?.key || `unknown:${start + i}`,
              original: batchEntries[r.index ?? i]?.original || '',
              translation: batchEntries[r.index ?? i]?.translation || '',
              ...r,
            }));
            allFullResults.push(...mapped);
          }
          
          // Show live intermediate results every 2 batches
          if ((batchIdx + 1) % 2 === 0 || batchIdx === totalBatches - 1) {
            commitPartialResults(action);
          }
          
          // Small delay between batches to avoid rate limiting
          if (batchIdx < totalBatches - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
        } catch (batchErr) {
          console.error(`Batch ${batchIdx + 1} failed:`, batchErr);
          continue; // Continue with next batch
        }
      }
      
      // Set final accumulated results
      if (action === 'literal-detect') {
        setLiteralResults(allLiteralResults);
        const literalCount = allLiteralResults.filter(r => r.isLiteral).length;
        setTranslateProgress(`✅ تم تحليل ${allLiteralResults.length} نص — ${literalCount} ترجمة حرفية`);
      } else if (action === 'style-unify') {
        setStyleResults(allStyleResults);
        const needsFix = allStyleResults.filter(r => r.styleIssues?.length > 0 || r.unifiedVersion).length;
        setTranslateProgress(`✅ تم تحليل ${allStyleResults.length} نص — ${needsFix} يحتاج توحيد`);
      } else if (action === 'consistency-check') {
        // Deduplicate inconsistencies by term
        const uniqueInconsistencies = allInconsistencies.reduce((acc: any[], item) => {
          const existing = acc.find(i => i.term === item.term);
          if (!existing) acc.push(item);
          return acc;
        }, []);
        setConsistencyCheckResult({
          inconsistencies: uniqueInconsistencies,
          score: totalBatches > 0 ? Math.round(totalScore / totalBatches) : 0,
          summary: summaries.join(' | '),
        });
        setTranslateProgress(`✅ درجة الاتساق: ${Math.round(totalScore / totalBatches)}/100 — ${uniqueInconsistencies.length} تناقض`);
      } else if (action === 'alternatives') {
        setAlternativeResults(allAlternativeResults);
        setTranslateProgress(`✅ ${allAlternativeResults.length} نص مع بدائل متعددة`);
      } else if (action === 'full-analysis') {
        setFullAnalysisResults(allFullResults);
        const literalCount = allFullResults.filter(r => r.isLiteral).length;
        const issueCount = allFullResults.filter(r => r.issues?.length > 0).length;
        setTranslateProgress(`✅ تحليل ${allFullResults.length} نص: ${literalCount} حرفية، ${issueCount} مشاكل`);
      }
      
      setTimeout(() => setTranslateProgress(""), 6000);

    } catch (err) {
      console.error('Advanced analysis error:', err);
      toast({
        title: "خطأ في التحليل",
        description: err instanceof Error ? err.message : 'خطأ غير متوقع',
        variant: "destructive",
      });
      setTranslateProgress("");
    } finally {
      setAdvancedAnalyzing(false);
    }
  };

  const handleApplyAdvancedSuggestion = (key: string, newTranslation: string) => {
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: newTranslation } } : null);
    setLiteralResults(prev => prev ? prev.filter(r => r.key !== key) : null);
    setStyleResults(prev => prev ? prev.filter(r => r.key !== key) : null);
    setAlternativeResults(prev => prev ? prev.filter(r => r.key !== key) : null);
    setFullAnalysisResults(prev => prev ? prev.filter(r => r.key !== key) : null);
    toast({ title: "✅ تم تطبيق التحسين" });
  };

  const handleApplyAllAdvanced = (action: import("@/components/editor/AdvancedTranslationPanel").AnalysisAction) => {
    if (!state) return;
    const updates: Record<string, string> = {};
    
    if (action === 'literal-detect' && literalResults) {
      for (const r of literalResults) {
        if (r.isLiteral && r.naturalVersion) updates[r.key] = r.naturalVersion;
      }
      setLiteralResults([]);
    } else if (action === 'style-unify' && styleResults) {
      for (const r of styleResults) {
        if (r.unifiedVersion) updates[r.key] = r.unifiedVersion;
      }
      setStyleResults([]);
    } else if (action === 'alternatives' && alternativeResults) {
      for (const r of alternativeResults) {
        const best = r.alternatives.find(a => a.style === r.recommended) || r.alternatives[0];
        if (best) updates[r.key] = best.text;
      }
      setAlternativeResults([]);
    } else if (action === 'full-analysis' && fullAnalysisResults) {
      for (const r of fullAnalysisResults) {
        if (r.recommended) updates[r.key] = r.recommended;
        else if (r.alternatives?.[0]?.text) updates[r.key] = r.alternatives[0].text;
      }
      setFullAnalysisResults([]);
    }
    
    if (Object.keys(updates).length === 0) {
      toast({ title: "⚠️ لا توجد اقتراحات للتطبيق" });
      return;
    }
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    toast({ title: `✅ تم تطبيق ${Object.keys(updates).length} تحسين` });
  };

  const handleStopAdvancedAnalysis = () => {
    advancedAnalysisCancelRef.current = true;
  };

  const handleCloseAdvancedPanel = () => {
    setLiteralResults(null);
    setStyleResults(null);
    setConsistencyCheckResult(null);
    setAlternativeResults(null);
    setFullAnalysisResults(null);
  };





  const handleImproveTranslations = async () => {
    if (!state) return;
    setImprovingTranslations(true); setImproveResults(null);
    toast({ title: "✨ بدأ التحسين", description: "جاري تحسين الترجمات في الخلفية..." });
    try {
      const translatedEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], maxBytes: e.maxBytes || 0 }));
      if (translatedEntries.length === 0) { setTranslateProgress("⚠️ لا توجد ترجمات لتحسينها في النطاق المحدد"); setTimeout(() => setTranslateProgress(""), 3000); return; }
      setTranslateProgress(`جاري تحسين ${translatedEntries.length} ترجمة...`);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: translatedEntries, glossary: activeGlossary, action: 'improve', aiModel }),
      });
      if (!response.ok) throw new Error(`خطأ ${response.status}`);
      const data = await response.json();
      const improvements = data.improvements || [];
      if (improvements.length === 0) { setTranslateProgress("✅ جميع الترجمات ممتازة — لا تحتاج تحسين!"); }
      else { setTranslateProgress(`✅ تم اقتراح تحسينات لـ ${improvements.length} ترجمة`); setImproveResults(improvements); }
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) { setTranslateProgress(`❌ خطأ في التحسين: ${err instanceof Error ? err.message : 'غير معروف'}`); setTimeout(() => setTranslateProgress(""), 4000); }
    finally { setImprovingTranslations(false); }
  };

  const handleApplyImprovement = (key: string, improved: string) => {
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: improved } } : null);
  };

  const handleApplyAllImprovements = () => {
    if (!state || !improveResults) return;
    const updates: Record<string, string> = {};
    improveResults.forEach((item) => { if (item.improvedBytes <= item.maxBytes || item.maxBytes === 0) updates[item.key] = item.improved; });
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setImproveResults(null);
    setLastSaved(`✅ تم تطبيق ${Object.keys(updates).length} تحسين`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  const handleImproveSingleTranslation = async (entry: ExtractedEntry) => {
    if (!state) return;
    const key = `${entry.msbtFile}:${entry.index}`;
    const translation = state.translations[key];
    if (!translation?.trim()) { setTranslateProgress("⚠️ لا توجد ترجمة لتحسينها"); setTimeout(() => setTranslateProgress(""), 3000); return; }
    setImprovingTranslations(true); setImproveResults(null);
    try {
      setTranslateProgress(`جاري تحسين الترجمة...`);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/review-translations`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [{ key, original: entry.original, translation, maxBytes: entry.maxBytes || 0 }], glossary: activeGlossary, action: 'improve', aiModel }),
      });
      if (!response.ok) throw new Error(`خطأ ${response.status}`);
      const data = await response.json();
      const improvements = data.improvements || [];
      if (improvements.length === 0) setTranslateProgress("✅ هذه الترجمة ممتازة — لا تحتاج تحسين!");
      else { setTranslateProgress(`✅ تم اقتراح تحسين لهذه الترجمة`); setImproveResults(improvements); }
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) { setTranslateProgress(`❌ خطأ في التحسين: ${err instanceof Error ? err.message : 'غير معروف'}`); setTimeout(() => setTranslateProgress(""), 4000); }
    finally { setImprovingTranslations(false); }
  };

  // === Consistency check ===
  const handleCheckConsistency = async () => {
    if (!state) return;
    setCheckingConsistency(true); setConsistencyResults(null);
    try {
      const translatedEntries = state.entries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], file: e.msbtFile }));
      if (translatedEntries.length === 0) { setTranslateProgress("⚠️ لا توجد ترجمات للفحص"); setTimeout(() => setTranslateProgress(""), 3000); return; }
      setTranslateProgress(`جاري فحص اتساق ${translatedEntries.length} ترجمة...`);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/check-consistency`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: translatedEntries, glossary: activeGlossary }),
      });
      if (!response.ok) throw new Error(`خطأ ${response.status}`);
      const data = await response.json();
      if (data.groups?.length === 0) { setTranslateProgress("✅ جميع المصطلحات متسقة — لا توجد تناقضات!"); }
      else { setTranslateProgress(`⚠️ تم اكتشاف ${data.groups?.length || 0} مصطلح غير متسق`); setConsistencyResults(data); }
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) { setTranslateProgress(`❌ خطأ في فحص الاتساق: ${err instanceof Error ? err.message : 'غير معروف'}`); setTimeout(() => setTranslateProgress(""), 4000); }
    finally { setCheckingConsistency(false); }
  };

  const handleApplyConsistencyFix = (groupIndex: number, bestTranslation: string) => {
    if (!consistencyResults || !state) return;
    const group = consistencyResults.groups[groupIndex];
    if (!group) return;
    const updates: Record<string, string> = {};
    for (const v of group.variants) { updates[v.key] = bestTranslation; }
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    // Remove this group from results
    const newGroups = consistencyResults.groups.filter((_, i) => i !== groupIndex);
    const newSuggestions = consistencyResults.aiSuggestions.filter((_, i) => i !== groupIndex);
    setConsistencyResults({ groups: newGroups, aiSuggestions: newSuggestions });
    setLastSaved(`✅ تم توحيد ترجمة "${group.term}" في ${group.variants.length} موضع`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  const handleApplyAllConsistencyFixes = () => {
    if (!consistencyResults || !state) return;
    const updates: Record<string, string> = {};
    let count = 0;
    consistencyResults.groups.forEach((group, i) => {
      const best = consistencyResults.aiSuggestions[i]?.best;
      if (best) {
        for (const v of group.variants) { updates[v.key] = best; }
        count++;
      }
    });
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setConsistencyResults(null);
    setLastSaved(`✅ تم توحيد ${count} مصطلح تلقائياً`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  // === Glossary Compliance Check ===
  const handleGlossaryCompliance = useCallback(() => {
    if (!state || !activeGlossary) {
      toast({ title: "⚠️ لا يوجد قاموس محمّل", description: "حمّل القاموس الشامل أولاً" });
      return;
    }
    setCheckingGlossaryCompliance(true);
    setGlossaryComplianceResults(null);
    setTranslateProgress("جاري فحص التزام القاموس...");

    // Run async to not block UI
    setTimeout(() => {
      try {
        const glossaryMap = parseGlossaryMap(activeGlossary);
        if (glossaryMap.size === 0) {
          setTranslateProgress("⚠️ القاموس فارغ");
          setTimeout(() => setTranslateProgress(""), 3000);
          setCheckingGlossaryCompliance(false);
          return;
        }

        // Sort terms by length (longest first) for greedy matching
        const sortedTerms = Array.from(glossaryMap.entries())
          .filter(([eng]) => eng.length >= 2)
          .sort((a, b) => b[0].length - a[0].length);

        const violations: import("@/components/editor/GlossaryCompliancePanel").GlossaryViolation[] = [];

        for (const entry of state.entries) {
          const key = `${entry.msbtFile}:${entry.index}`;
          const translation = state.translations[key];
          if (!translation?.trim()) continue;

          const originalLower = entry.original.toLowerCase();
          const entryViolations: { englishTerm: string; expectedArabic: string; foundFragment: string }[] = [];

          for (const [engLower, arabic] of sortedTerms) {
            // Check if the English term exists in the original
            const termRe = new RegExp(`\\b${engLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:'s)?\\b`, 'i');
            if (!termRe.test(originalLower)) continue;

            // Check if the expected Arabic translation exists in the translation
            if (translation.includes(arabic)) continue;

            // Term found in English but correct Arabic not in translation — violation
            entryViolations.push({
              englishTerm: engLower,
              expectedArabic: arabic,
              foundFragment: "", // We'll try to detect wrong translations below
            });
          }

          if (entryViolations.length === 0) continue;

          // Build corrected translation by replacing wrong terms
          let corrected = translation;
          for (const viol of entryViolations) {
            // Try to find other Arabic translations of this term in the text
            // by checking if any other glossary entry's Arabic appears that shouldn't
            // Simple approach: just ensure the expected term is present
            // We can't easily detect the "wrong" fragment without more context,
            // so we'll just flag it
          }

          // Build a corrected version by doing term replacement in original-order
          corrected = translation;
          for (const viol of entryViolations) {
            // If we can find the English term left untranslated in Arabic text
            const engInArabic = new RegExp(`\\b${viol.englishTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            if (engInArabic.test(corrected)) {
              viol.foundFragment = corrected.match(engInArabic)?.[0] || "";
              corrected = corrected.replace(engInArabic, viol.expectedArabic);
            }
          }

          violations.push({
            key,
            original: entry.original,
            translation,
            violations: entryViolations,
            corrected,
          });
        }

        if (violations.length === 0) {
          setTranslateProgress("✅ جميع الترجمات متوافقة مع القاموس!");
        } else {
          setTranslateProgress(`📖 تم اكتشاف ${violations.length} ترجمة تخالف القاموس`);
          setGlossaryComplianceResults(violations);
        }
        setTimeout(() => setTranslateProgress(""), 4000);
      } catch (err) {
        setTranslateProgress(`❌ خطأ: ${err instanceof Error ? err.message : 'غير معروف'}`);
        setTimeout(() => setTranslateProgress(""), 4000);
      } finally {
        setCheckingGlossaryCompliance(false);
      }
    }, 50);
  }, [state, activeGlossary, parseGlossaryMap, setTranslateProgress]);

  const handleApplyGlossaryFix = useCallback((index: number) => {
    if (!glossaryComplianceResults || !state) return;
    const v = glossaryComplianceResults[index];
    if (!v) return;
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [v.key]: v.corrected } } : null);
    setGlossaryComplianceResults(prev => prev ? prev.filter((_, i) => i !== index) : null);
    setLastSaved(`✅ تم تصحيح ترجمة وفق القاموس`);
    setTimeout(() => setLastSaved(""), 3000);
  }, [glossaryComplianceResults, state]);

  const handleApplyAllGlossaryFixes = useCallback(() => {
    if (!glossaryComplianceResults || !state) return;
    const updates: Record<string, string> = {};
    for (const v of glossaryComplianceResults) {
      updates[v.key] = v.corrected;
    }
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setGlossaryComplianceResults(null);
    setLastSaved(`✅ تم تصحيح ${glossaryComplianceResults.length} ترجمة وفق القاموس`);
    setTimeout(() => setLastSaved(""), 3000);
  }, [glossaryComplianceResults, state]);

  // === Cloud save/load ===
  const handleCloudSave = async () => {
    if (!state || !user) return;
    setCloudSyncing(true); setCloudStatus("جاري الحفظ في السحابة...");
    try {
      const translated = Object.values(state.translations).filter(v => v.trim() !== '').length;
      const { data: existing } = await supabase.from('translation_projects').select('id').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1);
      if (existing && existing.length > 0) {
        await supabase.from('translation_projects').update({ translations: state.translations, entry_count: state.entries.length, translated_count: translated }).eq('id', existing[0].id);
      } else {
        await supabase.from('translation_projects').insert({ user_id: user.id, translations: state.translations, entry_count: state.entries.length, translated_count: translated });
      }
      setCloudStatus("☁️ تم الحفظ في السحابة بنجاح!");
    } catch (err) { setCloudStatus(`❌ ${err instanceof Error ? err.message : 'خطأ في الحفظ'}`); }
    finally { setCloudSyncing(false); setTimeout(() => setCloudStatus(""), 4000); }
  };

  const handleCloudLoad = async () => {
    if (!user) return;
    setCloudSyncing(true); setCloudStatus("جاري التحميل من السحابة...");
    try {
      const { data, error } = await supabase.from('translation_projects').select('translations').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!data) { setCloudStatus("لا توجد ترجمات محفوظة في السحابة"); setTimeout(() => setCloudStatus(""), 3000); return; }
      const cloudTranslations = data.translations as Record<string, string>;
      setState(prev => { if (!prev) return null; return { ...prev, translations: { ...prev.translations, ...cloudTranslations } }; });
      setCloudStatus(`☁️ تم تحميل ${Object.keys(cloudTranslations).length} ترجمة من السحابة`);
    } catch (err) { setCloudStatus(`❌ ${err instanceof Error ? err.message : 'خطأ في التحميل'}`); }
    finally { setCloudSyncing(false); setTimeout(() => setCloudStatus(""), 4000); }
  };

  const loadDemoBdatData = useCallback(() => {
    const tableData: { table: string; cols: string[]; rows: number; texts: Record<string, string[]> }[] = [
      { table: "MNU_Msg", cols: ["Label", "Help"], rows: 12, texts: {
        Label: ["Confirm", "Cancel", "OK", "Back", "Next", "Save", "Load", "Options", "Quit", "Resume", "Retry", "Settings"],
        Help: ["Press A to confirm.", "Press B to cancel.", "Select an option.", "Open the menu.", "Change settings."],
      }},
      { table: "CHR_Dr", cols: ["Name", "Title", "Description"], rows: 10, texts: {
        Name: ["Noah", "Mio", "Eunie", "Taion", "Lanz", "Sena", "Riku", "Manana", "Ashera", "Zeon"],
        Title: ["Off-Seer of Keves", "Off-Seer of Agnus", "Healer of Colony 9", "Tactician of Agnus", "Defender of Colony 9"],
        Description: ["A soldier from Keves who plays the flute.", "A soldier from Agnus who plays the flute.", "Noah's childhood friend."],
      }},
      { table: "BTL_Arts", cols: ["Name", "Description"], rows: 15, texts: {
        Name: ["Sword Strike", "Air Slash", "Edge Thrust", "Shadow Eye", "Starfall", "Ground Beat", "Mega Spinning Edge", "Wide Slash", "Power Smash", "Butterfly Blade"],
        Description: ["A basic attack dealing physical damage.", "A wide-range slash hitting multiple enemies.", "An accurate thrust with high critical rate."],
      }},
      { table: "ENE_Monster", cols: ["Name", "Location"], rows: 8, texts: {
        Name: ["Territorial Rotbart", "Gogol", "Krabble", "Bunnit", "Feris", "Tirkin", "Sauros", "Igna"],
        Location: ["Aetia Region", "Fornis Region", "Pentelas Region", "Cadensia Region"],
      }},
      { table: "ITM_Equipment", cols: ["Name", "Effect"], rows: 10, texts: {
        Name: ["Steel Blade", "Silver Shield", "Power Ring", "Speed Boots", "Guard Crest", "Attack Charm", "HP Bangle", "Evasion Gem", "Critical Scope", "Auto-Heal Ring"],
        Effect: ["Increases attack power by 10%.", "Reduces damage taken by 15%.", "Boosts movement speed.", "Restores HP gradually."],
      }},
      { table: "QST_MainStory", cols: ["Title", "Objective"], rows: 8, texts: {
        Title: ["The Vanishing Flame", "Path to Swordmarch", "Colony 4 Liberation", "The Cloudkeep", "Origin", "The Last Chapter", "Bonds of Friendship", "A New Future"],
        Objective: ["Head to the battlefield.", "Defeat the enemy commander.", "Liberate Colony 4.", "Reach the top of Cloudkeep."],
      }},
      { table: "FLD_MapList", cols: ["Name", "Region"], rows: 8, texts: {
        Name: ["Colony 9", "Millick Meadows", "Alfeto Valley", "Great Cotte Falls", "Maktha Wildwood", "Erythia Sea", "Keves Castle", "Origin"],
        Region: ["Aetia Region", "Fornis Region", "Pentelas Region", "Cadensia Region"],
      }},
      { table: "SKL_Skill", cols: ["Name", "Description"], rows: 8, texts: {
        Name: ["HP Up", "Strength Up", "Agility Up", "Critical Up", "Ether Defense Up", "Arts Heal", "Power Charge", "Quick Step"],
        Description: ["Increases max HP by 10%.", "Increases physical attack.", "Increases agility.", "Increases critical hit rate."],
      }},
      { table: "GEM_Gem", cols: ["Name", "Effect"], rows: 6, texts: {
        Name: ["Steel Protection", "Steady Striker", "Swelling Scourge", "Disperse Bloodlust", "Lifebearer", "Ultimate Counter"],
        Effect: ["Reduces damage taken.", "Increases auto-attack speed.", "Boosts damage over time.", "Distributes aggro."],
      }},
      { table: "JOB_Class", cols: ["Name", "Role", "Description"], rows: 6, texts: {
        Name: ["Swordfighter", "Zephyr", "Medic Gunner", "Tactician", "Heavy Guard", "Martial Artist"],
        Role: ["Attacker", "Defender", "Healer", "Attacker", "Defender", "Attacker"],
        Description: ["A balanced attacker class.", "An agile defender class.", "A healing specialist.", "A tactical support class."],
      }},
      { table: "TIP_Tutorial", cols: ["Title", "Content"], rows: 6, texts: {
        Title: ["Basic Controls", "Combat Basics", "Chain Attacks", "Interlinks", "Gem Crafting", "Class Change"],
        Content: ["Use the left stick to move.", "Press A to auto-attack.", "Fill the chain gauge to unleash.", "Press up on D-pad to interlink."],
      }},
      { table: "MSG_NpcTalk", cols: ["Speaker", "Dialogue"], rows: 10, texts: {
        Speaker: ["Village Elder", "Merchant", "Guard", "Child", "Traveler", "Blacksmith", "Innkeeper", "Scholar", "Farmer", "Soldier"],
        Dialogue: ["Welcome, traveler.", "Care to see my wares?", "Halt! State your business.", "Wanna play?", "The road ahead is dangerous."],
      }},
      // Column-name categorization test entries (generic table prefixes)
      { table: "RSC_Data", cols: ["WindowTitle", "BtnLabel"], rows: 3, texts: {
        WindowTitle: ["Inventory Window", "Status Window", "Map Window"],
        BtnLabel: ["Open", "Close", "Toggle"],
      }},
      { table: "DAT_Info", cols: ["TaskSummary", "QuestPurpose"], rows: 3, texts: {
        TaskSummary: ["Defeat 5 monsters", "Collect 3 herbs", "Escort the NPC"],
        QuestPurpose: ["Help the colony", "Gather supplies", "Defend the camp"],
      }},
      { table: "WLD_Geo", cols: ["LandmarkName", "ColonyArea"], rows: 3, texts: {
        LandmarkName: ["Great Cotte Falls", "Alfeto Valley", "Maktha Wildwood"],
        ColonyArea: ["Colony 9 Area", "Colony 4 Area", "Colony Gamma Area"],
      }},
      { table: "CFG_Option", cols: ["VoiceSetting", "DisplayMode"], rows: 3, texts: {
        VoiceSetting: ["Japanese Voice", "English Voice", "No Voice"],
        DisplayMode: ["Full Screen", "Windowed", "Borderless"],
      }},
    ];
    const entries: ExtractedEntry[] = [];
    let idx = 0;
    for (const { table, cols, rows, texts } of tableData) {
      for (let row = 0; row < rows; row++) {
        for (const col of cols) {
          const t = texts[col] || ["Sample text"];
          entries.push({ msbtFile: "bdat", index: idx++, label: `${table}[${row}].${col}`, original: t[row % t.length], maxBytes: 0 });
        }
      }
    }
    setState({ entries, translations: {}, protectedEntries: new Set(), technicalBypass: new Set() });
    setLastSaved("✅ تم تحميل بيانات BDAT تجريبية");
    setTimeout(() => setLastSaved(""), 3000);
  }, []);

  const handleBulkReplace = useCallback((replacements: Record<string, string>) => {
    if (!state) return;
    const prev: Record<string, string> = {};
    for (const key of Object.keys(replacements)) {
      prev[key] = state.translations[key] || '';
    }
    setPreviousTranslations(p => ({ ...p, ...prev }));
    setState(s => s ? { ...s, translations: { ...s.translations, ...replacements } } : null);
    setLastSaved(`✅ تم استبدال ${Object.keys(replacements).length} نص`);
    setTimeout(() => setLastSaved(""), 3000);
  }, [state]);



  // === Universal Line Sync (all files — match Arabic line count to English \n count) ===
  const lineSyncAffectedCount = useMemo(() => {
    if (!state) return 0;
    const entriesToScan = isFilterActive ? filteredEntries : state.entries;
    let count = 0;
    for (const entry of entriesToScan) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const translation = state.translations[key];
      if (!translation?.trim()) continue;
      const englishLineCount = entry.original.split('\n').length;
      const arabicLineCount = translation.split('\n').length;
      if (englishLineCount !== arabicLineCount) count++;
    }
    return count;
  }, [state, isFilterActive, filteredEntries]);

  const handleScanLineSync = useCallback(() => {
    if (!state) return;
    const results: import("@/components/editor/NewlineSplitPanel").NewlineSplitResult[] = [];
    const entriesToScan = isFilterActive ? filteredEntries : state.entries;
    for (const entry of entriesToScan) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const translation = state.translations[key];
      if (!translation?.trim()) continue;

      const englishLineCount = entry.original.split('\n').length;
      const arabicLineCount = translation.split('\n').length;
      if (englishLineCount === arabicLineCount) continue;

      const flat = translation.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
      let after: string;
      if (englishLineCount <= 1) {
        after = flat;
      } else {
        // تقسيم متساوٍ بالكلمات حسب عدد أسطر النص الإنجليزي فقط (بدون حد أحرف)
        after = splitEvenlyByLines(flat, englishLineCount);
      }
      if (after === translation) continue;
      results.push({
        key, originalLines: englishLineCount, translationLines: arabicLineCount,
        before: translation, after, original: entry.original, status: 'pending',
      });
    }
    setLineSyncResults(results);
    if (results.length === 0) {
      setLastSaved(`✅ جميع الترجمات متطابقة الأسطر مع النص الإنجليزي`);
      setTimeout(() => setLastSaved(""), 4000);
    }
  }, [state, isFilterActive, filteredEntries, npcSplitCharLimit]);

  const handleApplyLineSync = useCallback((key: string) => {
    if (!state || !lineSyncResults) return;
    const item = lineSyncResults.find(r => r.key === key);
    if (!item) return;
    setPreviousTranslations(old => ({ ...old, [key]: state.translations[key] || '' }));
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setLineSyncResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'accepted' as const } : r) : null);
  }, [state, lineSyncResults]);

  const handleRejectLineSync = useCallback((key: string) => {
    setLineSyncResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'rejected' as const } : r) : null);
  }, []);

  const handleApplyAllLineSyncs = useCallback(() => {
    if (!state || !lineSyncResults) return;
    const pending = lineSyncResults.filter(r => r.status === 'pending');
    const newTranslations = { ...state.translations };
    const prevTrans: Record<string, string> = {};
    for (const item of pending) {
      prevTrans[item.key] = newTranslations[item.key] || '';
      newTranslations[item.key] = item.after;
    }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setLineSyncResults(prev => prev ? prev.map(r => r.status === 'pending' ? { ...r, status: 'accepted' as const } : r) : null);
    setLastSaved(`✅ تم مزامنة أسطر ${pending.length} ترجمة`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, lineSyncResults]);


  // === Restore original English texts from IndexedDB ===
  const handleRestoreOriginals = useCallback(async () => {
    if (!state) return;
    const savedOriginals = await idbGet<Record<string, string>>("originalTexts");
    if (!savedOriginals || Object.keys(savedOriginals).length === 0) {
      setLastSaved("⚠️ لا توجد نصوص أصلية محفوظة");
      setTimeout(() => setLastSaved(""), 3000);
      return;
    }
    let restoredCount = 0;
    const newEntries = state.entries.map(entry => {
      const key = `${entry.msbtFile}:${entry.index}`;
      const savedOriginal = savedOriginals[key];
      if (savedOriginal && savedOriginal !== entry.original) {
        restoredCount++;
        return { ...entry, original: savedOriginal };
      }
      return entry;
    });
    if (restoredCount > 0) {
      setState(prev => prev ? { ...prev, entries: newEntries } : null);
      setOriginalsDetectedAsPreviousBuild(false);
      setLastSaved(`✅ تم استعادة ${restoredCount} نص أصلي إنجليزي`);
    } else {
      setLastSaved("ℹ️ النصوص الأصلية متطابقة — لا حاجة للاستعادة");
    }
    setTimeout(() => setLastSaved(""), 5000);
  }, [state]);

  // === Diacritics Clean (scan + review) ===
  const diacriticsRegex = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

  const handleScanDiacritics = useCallback(() => {
    if (!state) return;
    const results: import("@/components/editor/DiacriticsCleanPanel").DiacriticsCleanResult[] = [];
    for (const [key, value] of Object.entries(state.translations)) {
      if (!value?.trim()) continue;
      const matches = value.match(diacriticsRegex);
      if (matches && matches.length > 0) {
        const after = value.replace(diacriticsRegex, '');
        if (after !== value) {
          results.push({ key, before: value, after, count: matches.length, status: 'pending' });
        }
      }
    }
    setDiacriticsCleanResults(results);
    if (results.length === 0) {
      setLastSaved("✅ لا توجد تشكيلات لإزالتها");
      setTimeout(() => setLastSaved(""), 4000);
    }
  }, [state]);

  const handleApplyDiacriticsClean = useCallback((key: string) => {
    if (!state || !diacriticsCleanResults) return;
    const item = diacriticsCleanResults.find(r => r.key === key);
    if (!item) return;
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setDiacriticsCleanResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'accepted' as const } : r) : null);
  }, [state, diacriticsCleanResults]);

  const handleRejectDiacriticsClean = useCallback((key: string) => {
    setDiacriticsCleanResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'rejected' as const } : r) : null);
  }, []);

  const handleApplyAllDiacriticsCleans = useCallback(() => {
    if (!state || !diacriticsCleanResults) return;
    const pending = diacriticsCleanResults.filter(r => r.status === 'pending');
    const newTranslations = { ...state.translations };
    for (const item of pending) {
      newTranslations[item.key] = item.after;
    }
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setDiacriticsCleanResults(prev => prev ? prev.map(r => r.status === 'pending' ? { ...r, status: 'accepted' as const } : r) : null);
    setLastSaved(`✅ تم إزالة التشكيلات من ${pending.length} ترجمة`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, diacriticsCleanResults]);

  // Keep old function name for backward compat (single-entry button in EntryCard)
  const handleRemoveAllDiacritics = handleScanDiacritics;

  // === Newline & Symbol Clean (remove \n, \., \:, \-, \\, and standalone n . \ : -) ===
  const handleScanNewlines = useCallback(() => {
    if (!state) return;
    const results: import("@/components/editor/NewlineCleanPanel").NewlineCleanResult[] = [];
    // Pattern: backslash+char combos OR standalone stray symbols (n . \ : -)
    // Standalone n only when surrounded by spaces or at start/end
    const cleanupPattern = /\\[n.:\-\\r]|(?<=\s|^)[n.:\\\-](?=\s|$)|(?<=\s|^)[a-zA-Z](?=\s|$)/g;
    for (const [key, value] of Object.entries(state.translations)) {
      if (!value?.trim()) continue;
      if (cleanupPattern.test(value)) {
        cleanupPattern.lastIndex = 0; // reset regex
        const count = (value.match(cleanupPattern) || []).length;
        const after = value.replace(cleanupPattern, ' ').replace(/ {2,}/g, ' ').trim();
        if (after !== value) {
          results.push({ key, before: value, after, count, status: 'pending' });
        }
        cleanupPattern.lastIndex = 0;
      }
    }
    setNewlineCleanResults(results);
    if (results.length === 0) {
      setLastSaved("✅ لم يتم اكتشاف أي رموز غير مرغوبة في الترجمات");
      setTimeout(() => setLastSaved(""), 4000);
    }
  }, [state]);

  const handleApplyNewlineClean = useCallback((key: string) => {
    if (!state || !newlineCleanResults) return;
    const item = newlineCleanResults.find(r => r.key === key);
    if (!item) return;
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setNewlineCleanResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'accepted' as const } : r) : null);
  }, [state, newlineCleanResults]);

  const handleRejectNewlineClean = useCallback((key: string) => {
    setNewlineCleanResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'rejected' as const } : r) : null);
  }, []);

  const handleApplyAllNewlineCleans = useCallback(() => {
    if (!state || !newlineCleanResults) return;
    const pending = newlineCleanResults.filter(r => r.status === 'pending');
    const newTranslations = { ...state.translations };
    for (const item of pending) {
      newTranslations[item.key] = item.after;
    }
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setNewlineCleanResults(prev => prev ? prev.map(r => r.status === 'pending' ? { ...r, status: 'accepted' as const } : r) : null);
    setLastSaved(`✅ تم تنظيف ${pending.length} ترجمة من الرموز غير المرغوبة`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, newlineCleanResults]);


  // === Newline Split (auto-split long translations at character limit) ===
  // === Newline Split (auto-split long translations at character limit) ===

  const splitAtWordBoundary = useCallback((text: string, charLimit: number): string => {
    // Don't split text that already has \n
    if (text.includes('\n')) return text;
    if (text.length <= charLimit) return text;

    const words = text.split(/\s+/).filter(w => w.length > 0);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (candidate.length > charLimit && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = candidate;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.join('\n');
  }, []);

  // Bubble dialogue files — newlines cause text to disappear in-game
  const BUBBLE_FILE_RE = /(?:^|[:/])(?:tlk_|fev_|cq_)/i;

  const handleScanNewlineSplit = useCallback(() => {
    if (!state) return;
    const results: import("@/components/editor/NewlineSplitPanel").NewlineSplitResult[] = [];
    const entriesToScan = isFilterActive ? filteredEntries : state.entries;
    for (const entry of entriesToScan) {
      const key = `${entry.msbtFile}:${entry.index}`;
      // Skip bubble dialogue files (tlk/fev/cq) — newlines hide text in-game
      if (BUBBLE_FILE_RE.test(key)) continue;
      const translation = state.translations[key];
      if (!translation?.trim()) continue;
      // Skip if already has line breaks
      if (translation.includes('\n')) continue;
      // Skip short translations — use English line count if available
      const englishLineCount = entry.original.split('\n').length;
      if (englishLineCount <= 1 && visualLength(translation) <= newlineSplitCharLimit) continue;
      const targetLines = englishLineCount > 1 ? englishLineCount : Math.max(2, Math.ceil(visualLength(translation) / newlineSplitCharLimit));
      const after = splitEvenlyByLines(translation, targetLines);
      if (after === translation) continue;
      const afterLines = after.split('\n').length;
      results.push({
        key,
        originalLines: afterLines,
        translationLines: 1,
        before: translation,
        after,
        original: entry.original,
        status: 'pending',
      });
    }
    setNewlineSplitResults(results);
    if (results.length === 0) {
      setLastSaved("✅ لم يتم اكتشاف نصوص طويلة تحتاج تقسيم");
      setTimeout(() => setLastSaved(""), 4000);
    }
  }, [state, isFilterActive, filteredEntries, newlineSplitCharLimit]);

  const handleApplyNewlineSplit = useCallback((key: string) => {
    if (!state || !newlineSplitResults) return;
    const item = newlineSplitResults.find(r => r.key === key);
    if (!item) return;
    setPreviousTranslations(old => ({ ...old, [key]: state.translations[key] || '' }));
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setNewlineSplitResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'accepted' as const } : r) : null);
  }, [state, newlineSplitResults]);

  const handleRejectNewlineSplit = useCallback((key: string) => {
    setNewlineSplitResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'rejected' as const } : r) : null);
  }, []);

  const handleApplyAllNewlineSplits = useCallback(() => {
    if (!state || !newlineSplitResults) return;
    const pending = newlineSplitResults.filter(r => r.status === 'pending');
    const newTranslations = { ...state.translations };
    const prevTrans: Record<string, string> = {};
    for (const item of pending) {
      prevTrans[item.key] = newTranslations[item.key] || '';
      newTranslations[item.key] = item.after;
    }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setNewlineSplitResults(prev => prev ? prev.map(r => r.status === 'pending' ? { ...r, status: 'accepted' as const } : r) : null);
    setLastSaved(`✅ تم تقسيم ${pending.length} نص مضغوط`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, newlineSplitResults]);

  // === NPC Dialogue Split (configurable chars for NPC dialogue files) ===
  const NPC_FILE_RE = /msg_(ask|cq|fev|nq|sq|tlk|tq)/i;

  // Count NPC entries that would be affected by the split tool
  const npcAffectedCount = useMemo(() => {
    if (!state) return 0;
    const entriesToScan = isFilterActive ? filteredEntries : state.entries;
    let count = 0;
    for (const entry of entriesToScan) {
      const key = `${entry.msbtFile}:${entry.index}`;
      if (!NPC_FILE_RE.test(key)) continue;
      const translation = state.translations[key];
      if (!translation?.trim()) continue;
      count++;
    }
    return count;
  }, [state, isFilterActive, filteredEntries]);

  const handleScanNpcSplit = useCallback(() => {
    if (!state) return;
    const results: import("@/components/editor/NewlineSplitPanel").NewlineSplitResult[] = [];
    const entriesToScan = isFilterActive ? filteredEntries : state.entries;
    for (const entry of entriesToScan) {
      const key = `${entry.msbtFile}:${entry.index}`;
      if (!NPC_FILE_RE.test(key)) continue;
      const translation = state.translations[key];
      if (!translation?.trim()) continue;

      // NPC Mode: sync Arabic line count to English \n count
      if (npcMode) {
        const englishLineCount = entry.original.split('\n').length;
        const flat = translation.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();

        let after: string;
        if (englishLineCount <= 1) {
          // English is one line → flatten Arabic
          after = flat;
        } else {
          // English has N lines → force Arabic to N lines
          after = splitEvenlyByLines(flat, englishLineCount);
        }
        if (after === translation) continue;
        results.push({
          key, originalLines: englishLineCount, translationLines: translation.split('\n').length,
          before: translation, after, original: entry.original, status: 'pending',
        });
        continue;
      }

      // Classic mode: split based on char limit
      const flat = translation.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (visualLength(flat) <= npcSplitCharLimit) {
        if (translation !== flat && translation.includes('\n')) {
          results.push({
            key, originalLines: 1, translationLines: translation.split('\n').length,
            before: translation, after: flat, original: entry.original, status: 'pending',
          });
        }
        continue;
      }
      const after = splitEvenlyByLines(translation, npcMaxLines);
      if (after === translation) continue;
      results.push({
        key, originalLines: after.split('\n').length, translationLines: translation.split('\n').length,
        before: translation, after, original: entry.original, status: 'pending',
      });
    }
    setNpcSplitResults(results);
    if (results.length === 0) {
      setLastSaved(npcMode
        ? `✅ لا توجد نصوص NPC تحتاج مزامنة أسطر`
        : `✅ لا توجد نصوص NPC تحتاج إعادة تقسيم عند ${npcSplitCharLimit} حرف`);
      setTimeout(() => setLastSaved(""), 4000);
    }
  }, [state, isFilterActive, filteredEntries, npcSplitCharLimit, npcMode, npcMaxLines]);

  const handleApplyNpcSplit = useCallback((key: string) => {
    if (!state || !npcSplitResults) return;
    const item = npcSplitResults.find(r => r.key === key);
    if (!item) return;
    setPreviousTranslations(old => ({ ...old, [key]: state.translations[key] || '' }));
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setNpcSplitResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'accepted' as const } : r) : null);
  }, [state, npcSplitResults]);

  const handleRejectNpcSplit = useCallback((key: string) => {
    setNpcSplitResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'rejected' as const } : r) : null);
  }, []);

  const handleApplyAllNpcSplits = useCallback(() => {
    if (!state || !npcSplitResults) return;
    const pending = npcSplitResults.filter(r => r.status === 'pending');
    const newTranslations = { ...state.translations };
    const prevTrans: Record<string, string> = {};
    for (const item of pending) {
      prevTrans[item.key] = newTranslations[item.key] || '';
      newTranslations[item.key] = item.after;
    }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setNpcSplitResults(prev => prev ? prev.map(r => r.status === 'pending' ? { ...r, status: 'accepted' as const } : r) : null);
    setLastSaved(`✅ تم تقسيم ${pending.length} نص NPC`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, npcSplitResults]);

  // === Unified Split: combines newline split + NPC split + line sync in one scan ===
  const handleScanAllSplits = useCallback(() => {
    if (!state) return;
    const results: import("@/components/editor/NewlineSplitPanel").NewlineSplitResult[] = [];
    const entriesToScan = isFilterActive ? filteredEntries : state.entries;
    const processedKeys = new Set<string>();

    for (const entry of entriesToScan) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const translation = state.translations[key];
      if (!translation?.trim()) continue;

      const isNpcFile = NPC_FILE_RE.test(key);
      const isBubbleFile = BUBBLE_FILE_RE.test(key);
      const englishLineCount = entry.original.split('\n').length;
      const arabicLineCount = translation.split('\n').length;
      const flat = translation.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();

      // 1) NPC files: apply NPC split logic
      if (isNpcFile) {
        if (npcMode) {
          let after: string;
          if (englishLineCount <= 1) {
            after = flat;
          } else {
            after = splitEvenlyByLines(flat, englishLineCount);
          }
          if (after !== translation) {
            results.push({
              key, originalLines: englishLineCount, translationLines: arabicLineCount,
              before: translation, after, original: entry.original, status: 'pending',
            });
            processedKeys.add(key);
          }
        } else {
          // Even with npcMode off, sync to English line count
          let after: string;
          if (englishLineCount <= 1) {
            after = flat;
          } else {
            after = splitEvenlyByLines(flat, englishLineCount);
          }
          if (after !== translation) {
            results.push({
              key, originalLines: englishLineCount, translationLines: arabicLineCount,
              before: translation, after, original: entry.original, status: 'pending',
            });
            processedKeys.add(key);
          }
        }
        continue;
      }

      // 2) Line sync: if English/Arabic line counts differ
      if (englishLineCount !== arabicLineCount && !processedKeys.has(key)) {
        let after: string;
        if (englishLineCount <= 1) {
          after = flat;
        } else {
          after = splitEvenlyByLines(flat, englishLineCount);
        }
        if (after !== translation) {
          results.push({
            key, originalLines: englishLineCount, translationLines: arabicLineCount,
            before: translation, after, original: entry.original, status: 'pending',
          });
          processedKeys.add(key);
        }
      }

      // 3) Newline split: long single-line texts (skip bubble files)
      if (!processedKeys.has(key) && !isBubbleFile && !translation.includes('\n') && visualLength(translation) > newlineSplitCharLimit) {
        const targetLines = Math.max(2, Math.ceil(visualLength(translation) / newlineSplitCharLimit));
        const after = splitEvenlyByLines(translation, targetLines);
        if (after !== translation) {
          results.push({
            key, originalLines: after.split('\n').length, translationLines: 1,
            before: translation, after, original: entry.original, status: 'pending',
          });
          processedKeys.add(key);
        }
      }
    }

    setUnifiedSplitResults(results);
    if (results.length === 0) {
      setLastSaved("✅ لا توجد نصوص تحتاج تقسيم أو مزامنة");
      setTimeout(() => setLastSaved(""), 4000);
    }
  }, [state, isFilterActive, filteredEntries, newlineSplitCharLimit, npcSplitCharLimit, npcMode, npcMaxLines]);

  const handleApplyUnifiedSplit = useCallback((key: string) => {
    if (!state || !unifiedSplitResults) return;
    const item = unifiedSplitResults.find(r => r.key === key);
    if (!item) return;
    setPreviousTranslations(old => ({ ...old, [key]: state.translations[key] || '' }));
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setUnifiedSplitResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'accepted' as const } : r) : null);
  }, [state, unifiedSplitResults]);

  const handleRejectUnifiedSplit = useCallback((key: string) => {
    setUnifiedSplitResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'rejected' as const } : r) : null);
  }, []);

  const handleApplyAllUnifiedSplits = useCallback(() => {
    if (!state || !unifiedSplitResults) return;
    const pending = unifiedSplitResults.filter(r => r.status === 'pending');
    const newTranslations = { ...state.translations };
    const prevTrans: Record<string, string> = {};
    for (const item of pending) {
      prevTrans[item.key] = newTranslations[item.key] || '';
      newTranslations[item.key] = item.after;
    }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setUnifiedSplitResults(prev => prev ? prev.map(r => r.status === 'pending' ? { ...r, status: 'accepted' as const } : r) : null);
    setLastSaved(`✅ تم تقسيم ومزامنة ${pending.length} نص`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, unifiedSplitResults]);


  /** Split a single entry's translation at word boundaries (per-entry inline button) */
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

  /** Fill all translations with a single word for font testing */
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

  /** Flatten all multi-line translations to single line (preserving word order) */
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
    if (count === 0) {
      setLastSaved("✅ لا توجد ترجمات متعددة الأسطر");
      setTimeout(() => setLastSaved(""), 3000);
      return;
    }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setLastSaved(`✅ تم دمج ${count} ترجمة إلى سطر واحد`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, isFilterActive, filteredEntries]);

  // === Pin Search ===
  const handleTogglePin = useCallback(() => {
    if (pinnedKeys) {
      // Unpin
      setPinnedKeys(null);
      setIsSearchPinned(false);
    } else {
      // Pin current filtered entries
      const keys = new Set(filteredEntries.map(e => `${e.msbtFile}:${e.index}`));
      setPinnedKeys(keys);
      setIsSearchPinned(true);
    }
  }, [pinnedKeys, filteredEntries]);


  // === Mirror Chars Clean (brackets & arrows) ===
  const handleScanMirrorChars = useCallback(() => {
    if (!state) return;
    const swapChars = (t: string) => {
      // Protect technical tags from being mirrored: [Tag:Value], {var}, <html>, PUA sequences
      const protected_: { placeholder: string; original: string }[] = [];
      let counter = 0;
      let safe = t.replace(/(\[\w+:[^\]]*?\s*\](?:\s*\([^)]{1,100}\))?|\{[\w]+\}|<[\w\/][^>]*>|[\uE000-\uE0FF]+|[\uFFF9-\uFFFB]+|\([A-Z][^)]{1,100}\))/g, (match) => {
        const ph = `\x01PROT${counter++}\x01`;
        protected_.push({ placeholder: ph, original: match });
        return ph;
      });
      // Swap brackets and arrows in non-protected text
      safe = safe
        .replace(/\(/g, '\x00OPEN\x00').replace(/\)/g, '(').replace(/\x00OPEN\x00/g, ')')
        .replace(/</g, '\x00LT\x00').replace(/>/g, '<').replace(/\x00LT\x00/g, '>');
      // Restore protected tags
      for (const p of protected_) {
        safe = safe.replace(p.placeholder, p.original);
      }
      return safe;
    };
    const results: import("@/components/editor/MirrorCharsCleanPanel").MirrorCharsResult[] = [];
    for (const [key, value] of Object.entries(state.translations)) {
      if (!value?.trim()) continue;
      const after = swapChars(value);
      if (after === value) continue;
      const count = (value.match(/[()<>]/g) || []).length;
      results.push({ key, before: value, after, count, status: 'pending' });
    }
    setMirrorCharsResults(results);
    if (results.length === 0) {
      setLastSaved("✅ لا توجد أقواس أو أسهم معكوسة");
      setTimeout(() => setLastSaved(""), 4000);
    }
  }, [state]);

  const handleApplyMirrorCharsClean = useCallback((key: string) => {
    if (!state || !mirrorCharsResults) return;
    const item = mirrorCharsResults.find(r => r.key === key);
    if (!item) return;
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setMirrorCharsResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'accepted' as const } : r) : null);
  }, [state, mirrorCharsResults]);

  const handleRejectMirrorCharsClean = useCallback((key: string) => {
    setMirrorCharsResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'rejected' as const } : r) : null);
  }, []);

  const handleApplyAllMirrorCharsCleans = useCallback(() => {
    if (!state || !mirrorCharsResults) return;
    const pending = mirrorCharsResults.filter(r => r.status === 'pending');
    const newTranslations = { ...state.translations };
    for (const item of pending) {
      newTranslations[item.key] = item.after;
    }
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setMirrorCharsResults(prev => prev ? prev.map(r => r.status === 'pending' ? { ...r, status: 'accepted' as const } : r) : null);
    setLastSaved(`✅ تم عكس ${pending.length} رمز`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, mirrorCharsResults]);

  // === Tag Bracket Fix ===
  const handleScanTagBrackets = useCallback(() => {
    if (!state) return;
    const results: import("@/components/editor/TagBracketFixPanel").TagBracketFixResult[] = [];
    let suspiciousUnfixableCount = 0;
    
    for (const entry of state.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const translation = state.translations[key];
      if (!translation?.trim()) continue;
      if (!hasTechnicalBracketTag(entry.original)) continue;

      // Use unified TAG_REGEX from xc3-tag-restoration for comprehensive tag detection
      const TAG_REGEX = /[\uFFF9-\uFFFC]|[\uE000-\uE0FF]+|\d+\s*\[[A-Z]{2,10}\]|\[[A-Z]{2,10}\]\s*\d+|\[\s*\w+\s*:[^\]]*?\](?:\s*\([^)]{1,100}\))?|\[\s*\w+\s*=\s*\w[^\]]*\]|\{\s*\w+\s*:\s*\w[^}]*\}|\{[\w]+\}/g;
      const allOriginalTags = [...entry.original.matchAll(new RegExp(TAG_REGEX.source, TAG_REGEX.flags))].map(m => m[0]);
      
      // Build original tag counts
      const origTagCount = new Map<string, number>();
      for (const t of allOriginalTags) origTagCount.set(t, (origTagCount.get(t) || 0) + 1);
      
      // Check translation tags
      const transTagsBefore = [...translation.matchAll(new RegExp(TAG_REGEX.source, TAG_REGEX.flags))].map(m => m[0]);
      const transCountBefore = new Map<string, number>();
      for (const t of transTagsBefore) transCountBefore.set(t, (transCountBefore.get(t) || 0) + 1);
      
      const hasMissingOriginalTag = allOriginalTags.some(t => (transCountBefore.get(t) || 0) < (origTagCount.get(t) || 0));
      const hasForeignTag = transTagsBefore.some(t => !origTagCount.has(t));
      const hasExtraTag = [...transCountBefore.entries()].some(([t, c]) => origTagCount.has(t) && c > (origTagCount.get(t) || 0));

      const { text: after, stats } = fixTagBracketsStrict(entry.original, translation);
      
      // Re-check on FIXED text with same unified regex
      const transTagsAfter = [...after.matchAll(new RegExp(TAG_REGEX.source, TAG_REGEX.flags))].map(m => m[0]);
      const transCountAfter = new Map<string, number>();
      for (const t of transTagsAfter) transCountAfter.set(t, (transCountAfter.get(t) || 0) + 1);
      
      const hasMissingAfterFix = allOriginalTags.some(t => (transCountAfter.get(t) || 0) < (origTagCount.get(t) || 0));
      const hasForeignAfterFix = transTagsAfter.some(t => !origTagCount.has(t));
      const hasExtraAfterFix = [...transCountAfter.entries()].some(([t, c]) => origTagCount.has(t) && c > (origTagCount.get(t) || 0));
      
      // Run restoreTagsLocally if tags are STILL wrong after bracket fix (missing, foreign, OR extra)
      let finalAfter = after;
      if (hasMissingAfterFix || hasForeignAfterFix || hasExtraAfterFix) {
        finalAfter = restoreTagsLocally(entry.original, after);
      }
      
      if (finalAfter === translation) {
        if (hasMissingOriginalTag || hasForeignTag) {
          suspiciousUnfixableCount++;
        }
        continue;
      }

      results.push({ key, before: translation, after: finalAfter, count: (stats.total || 0) + (finalAfter !== after ? 1 : 0), status: 'pending' });
    }

    setTagBracketFixResults(results);
    if (results.length === 0) {
      if (suspiciousUnfixableCount > 0) {
        setLastSaved(`⚠️ تم رصد ${suspiciousUnfixableCount} سطر فيه رموز تقنية غير صحيحة (مثل [ML]1) وتحتاج إصلاح الوسوم`);
      } else {
        setLastSaved("✅ جميع أقواس الرموز التقنية صحيحة");
      }
      setTimeout(() => setLastSaved(""), 5000);
    }
  }, [state]);

  const handleApplyTagBracketFix = useCallback((key: string) => {
    if (!state || !tagBracketFixResults) return;
    const item = tagBracketFixResults.find(r => r.key === key);
    if (!item) return;
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setTagBracketFixResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'accepted' as const } : r) : null);
  }, [state, tagBracketFixResults]);

  const handleRejectTagBracketFix = useCallback((key: string) => {
    setTagBracketFixResults(prev => prev ? prev.map(r => r.key === key ? { ...r, status: 'rejected' as const } : r) : null);
  }, []);

  const handleApplyAllTagBracketFixes = useCallback(() => {
    if (!state || !tagBracketFixResults) return;
    const pending = tagBracketFixResults.filter(r => r.status === 'pending');
    const newTranslations = { ...state.translations };
    for (const item of pending) {
      newTranslations[item.key] = item.after;
    }
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setTagBracketFixResults(prev => prev ? prev.map(r => r.status === 'pending' ? { ...r, status: 'accepted' as const } : r) : null);
    setLastSaved(`✅ تم إصلاح أقواس ${pending.length} رمز تقني`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, tagBracketFixResults]);


  // === Arabic Text Fixes (تاء/هاء، ياء/ألف مقصورة، كلمات مكررة، مخلفات AI) ===
  const handleScanArabicTextFixes = useCallback(() => {
    if (!state) return;
    const results = scanAllTextFixes(state.translations);
    setArabicTextFixResults(results);
    if (results.length === 0) {
      setLastSaved("✅ لا توجد مشاكل في النصوص العربية");
      setTimeout(() => setLastSaved(""), 4000);
    } else {
      toast({ title: `✨ تم العثور على ${results.length} مشكلة`, description: "راجع النتائج وقرر ما تريد تطبيقه" });
    }
  }, [state]);

  const handleApplyArabicTextFix = useCallback((key: string, fixType: string) => {
    if (!state || !arabicTextFixResults) return;
    const item = arabicTextFixResults.find(r => r.key === key && r.fixType === fixType);
    if (!item) return;
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: item.after } } : null);
    setArabicTextFixResults(prev => prev ? prev.map(r => (r.key === key && r.fixType === fixType) ? { ...r, status: 'accepted' as const } : r) : null);
  }, [state, arabicTextFixResults]);

  const handleRejectArabicTextFix = useCallback((key: string, fixType: string) => {
    setArabicTextFixResults(prev => prev ? prev.map(r => (r.key === key && r.fixType === fixType) ? { ...r, status: 'rejected' as const } : r) : null);
  }, []);

  const handleApplyAllArabicTextFixes = useCallback(() => {
    if (!state || !arabicTextFixResults) return;
    const pending = arabicTextFixResults.filter(r => r.status === 'pending');
    const newTranslations = { ...state.translations };
    // For same key with multiple chained fixes, apply the LAST one (most complete)
    for (const item of pending) {
      newTranslations[item.key] = item.after;
    }
    setState(prev => prev ? { ...prev, translations: newTranslations } : null);
    setArabicTextFixResults(prev => prev ? prev.map(r => r.status === 'pending' ? { ...r, status: 'accepted' as const } : r) : null);
    setLastSaved(`✅ تم تطبيق ${pending.length} إصلاح نصي`);
    setTimeout(() => setLastSaved(""), 4000);
  }, [state, arabicTextFixResults]);

  return {
    // State
    state, search, filterFile, filterCategory, filterStatus, filterTechnical, filterTable, filterColumn, showFindReplace, userGeminiKey, translationProvider, myMemoryEmail, myMemoryCharsUsed, aiRequestsToday, aiRequestsMonth, rebalanceNewlines, aiModel,
    pendingRecovery, handleRecoverSession, handleStartFresh,
    hasStoredOriginals, originalsDetectedAsPreviousBuild,
    building, buildProgress, dismissBuildProgress, translating, translateProgress,
    pendingPageTranslations, oldPageTranslations, pageTranslationOriginals, showPageCompare,
    lastSaved, cloudSyncing, cloudStatus,
    reviewing, reviewResults, tmStats, glossarySessionStats,
    suggestingShort, shortSuggestions,
    quickReviewMode, quickReviewIndex,
    showQualityStats, translatingSingle,
    previousTranslations, currentPage,
    showRetranslateConfirm, arabicNumerals, mirrorPunctuation,
    applyingArabic, improvingTranslations, improveResults,
    fixingMixed, filtersOpen, buildStats, buildPreview, showBuildConfirm, bdatFileStats,
    checkingConsistency, consistencyResults,
    scanningSentences, newlineCleanResults, diacriticsCleanResults, mirrorCharsResults, tagBracketFixResults, newlineSplitResults, npcSplitResults, lineSyncResults, unifiedSplitResults, arabicTextFixResults,
    smartReviewing, smartReviewFindings,
    enhanceResults, enhancingTranslations,
    // Advanced Analysis
    advancedAnalysisTab, literalResults, styleResults, consistencyCheckResult, alternativeResults, fullAnalysisResults, advancedAnalyzing, enhancedMemory,
    glossaryComplianceResults, checkingGlossaryCompliance,
    isSearchPinned, pinnedKeys,
    categoryProgress, qualityStats, needsImproveCount, translatedCount, tagsCount, fuzzyCount, byteOverflowCount, multiLineCount, newlinesCount, npcAffectedCount, lineSyncAffectedCount,
    bdatTableNames, bdatColumnNames, bdatTableCounts, bdatColumnCounts,
    ...glossary,
    msbtFiles, filteredEntries, paginatedEntries, totalPages,
    user,

    // Setters
    setSearch, setFilterFile, setFilterCategory, setFilterStatus, setFilterTechnical, setFilterTable, setFilterColumn,
    setFiltersOpen, setShowQualityStats, setQuickReviewMode, setQuickReviewIndex, setShowFindReplace,
    setCurrentPage, setShowRetranslateConfirm,
    ...settings,
    setReviewResults, setShortSuggestions, setImproveResults, setBuildStats, setShowBuildConfirm,
    setConsistencyResults, setNewlineCleanResults, setDiacriticsCleanResults, setMirrorCharsResults, setTagBracketFixResults, setNewlineSplitResults, setNpcSplitResults, setLineSyncResults, setUnifiedSplitResults, setArabicTextFixResults,
    setSmartReviewFindings,
    setGlossaryComplianceResults,
    setAdvancedAnalysisTab,
    autoSmartReview, setAutoSmartReview,

    // Handlers
    toggleProtection, toggleTechnicalBypass,
    handleProtectAllArabic, handleFixReversed, handleFixAllReversed,
    updateTranslation, handleUndoTranslation,
    handleTranslateSingle, handleAutoTranslate, handleTranslatePage, handleTranslateAllPages, handleTranslateFromGlossaryOnly, handleStopTranslate,
    glossaryPreviewEntries, showGlossaryPreview, applyGlossaryPreview, discardGlossaryPreview,
    handleRetranslatePage, handleFixDamagedTags, handleLocalFixDamagedTag, handleLocalFixAllDamagedTags, handleLocalFixSelectedTags, handleRedistributeTags, handleReviewTranslations,
    applyPendingTranslations, discardPendingTranslations,
    handleSuggestShorterTranslations, handleApplyShorterTranslation, handleApplyAllShorterTranslations,
    handleFixAllStuckCharacters, handleFixMixedLanguage,
    ...fileIO,
    handleImproveTranslations, handleApplyImprovement, handleApplyAllImprovements,
    handleImproveSingleTranslation,
    handleCheckConsistency, handleApplyConsistencyFix, handleApplyAllConsistencyFixes,
    handleSmartReview, handleGrammarCheck, handleContextReview, handleApplySmartFix, handleApplyAllSmartFixes, handleDismissSmartFinding,
    handleAutoCorrect, autoCorrectResults, autoCorrectApplied, autoCorrectProgress, handleStopAutoCorrect,
    handleDetectWeak, weakTranslations, detectingWeak, detectWeakProgress, handleStopDetectWeak, handleApplyWeakFix, handleApplyAllWeakFixes, setWeakTranslations,
    handleContextRetranslate,
    handleEnhanceTranslations, handleApplyEnhanceSuggestion, handleApplyAllEnhanceSuggestions, handleCloseEnhanceResults,
    // Advanced Analysis handlers
    handleAdvancedAnalysis, handleApplyAdvancedSuggestion, handleApplyAllAdvanced, handleCloseAdvancedPanel, saveToEnhancedMemory, handleStopAdvancedAnalysis,
    handleGlossaryCompliance, handleApplyGlossaryFix, handleApplyAllGlossaryFixes,
    handleAcceptFuzzy, handleRejectFuzzy, handleAcceptAllFuzzy, handleRejectAllFuzzy,
    handleCloudSave, handleCloudLoad,
    handleApplyArabicProcessing, handleUndoArabicProcessing, handlePreBuild, handleBuild, handleBulkReplace, loadDemoBdatData, handleCheckIntegrity, handleRestoreOriginals, handleRemoveAllDiacritics,
    handleScanNewlines, handleApplyNewlineClean, handleRejectNewlineClean, handleApplyAllNewlineCleans,
    handleScanDiacritics, handleApplyDiacriticsClean, handleRejectDiacriticsClean, handleApplyAllDiacriticsCleans,
    
    handleScanMirrorChars, handleApplyMirrorCharsClean, handleRejectMirrorCharsClean, handleApplyAllMirrorCharsCleans,
    handleScanTagBrackets, handleApplyTagBracketFix, handleRejectTagBracketFix, handleApplyAllTagBracketFixes,
    handleScanNewlineSplit, handleApplyNewlineSplit, handleRejectNewlineSplit, handleApplyAllNewlineSplits, handleSplitSingleEntry, handleFlattenAllNewlines, handleFontTest, newlineSplitCharLimit, setNewlineSplitCharLimit,
    handleScanNpcSplit, handleApplyNpcSplit, handleRejectNpcSplit, handleApplyAllNpcSplits,
    handleScanLineSync, handleApplyLineSync, handleRejectLineSync, handleApplyAllLineSyncs,
    handleScanAllSplits, handleApplyUnifiedSplit, handleRejectUnifiedSplit, handleApplyAllUnifiedSplits,
    
    handleScanArabicTextFixes, handleApplyArabicTextFix, handleRejectArabicTextFix, handleApplyAllArabicTextFixes,
    handleTogglePin,
    handleClearTranslations, handleUndoClear, clearUndoBackup, isFilterActive,
    integrityResult, showIntegrityDialog, setShowIntegrityDialog, checkingIntegrity,

    // Quality helpers
    isTranslationTooShort, isTranslationTooLong, hasStuckChars, isMixedLanguage, needsImprovement,
  };
}
