import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import { idbSet, idbGet, checkAndMigrateSchema } from "@/lib/idb-storage";
import { APP_VERSION } from "@/lib/version";
import { hasArabicPresentationForms } from "@/lib/arabic-processing";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";


import { useEditorGlossary } from "@/hooks/useEditorGlossary";
import { useEditorFileIO } from "@/hooks/useEditorFileIO";
import { useEditorQuality } from "@/hooks/useEditorQuality";
import { useEditorBuild } from "@/hooks/useEditorBuild";
import { useEditorTranslation } from "@/hooks/useEditorTranslation";
import { useEditorSettings } from "@/hooks/useEditorSettings";
import { useEditorScanResults } from "@/hooks/useEditorScanResults";
import { useEditorReview } from "@/hooks/useEditorReview";
import { useEditorCleanup } from "@/hooks/useEditorCleanup";
import { hasActiveEditorScope } from "@/lib/editor-scope";
import { deepDiagPredicates, matchesDeepDiagFilter } from "@/lib/deep-diagnostic-predicates";
import { useAutoPilot } from "@/hooks/useAutoPilot";
import { ExtractedEntry, EditorState, AUTOSAVE_DELAY, PAGE_SIZE, categorizeFile, categorizeBdatTable, categorizeDanganronpaFile, hasArabicChars, unReverseBidi, isTechnicalText, hasTechnicalTags, restoreTagsLocally, FilterStatus, FilterTechnical } from "@/components/editor/types";
export function useEditorState() {
  // === Extracted hooks ===
  const settings = useEditorSettings();
  const {
    arabicNumerals, mirrorPunctuation, userGeminiKey, userDeepSeekKey, userGroqKey, userCerebrasKey, userOpenRouterKey, setUserOpenRouterKey, aiModel, translationProvider,
    myMemoryEmail, myMemoryCharsUsed, addMyMemoryChars, aiRequestsToday, aiRequestsMonth,
    addAiRequest, rebalanceNewlines, npcMaxLines, npcMode, npcSplitCharLimit, setNpcSplitCharLimit,
    newlineSplitCharLimit, setNewlineSplitCharLimit, autoSmartReview, setAutoSmartReview,
    tmAutoReuse, setTmAutoReuse,
    aiThrottleEnabled, setAiThrottleEnabled,
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



  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
  const { building, buildProgress, dismissBuildProgress, applyingArabic, buildStats, setBuildStats, buildPreview, showBuildConfirm, setShowBuildConfirm, bdatFileStats, safetyRepairs, showSafetyReport, setShowSafetyReport, integrityResult, showIntegrityDialog, setShowIntegrityDialog, checkingIntegrity, handleApplyArabicProcessing, handleUndoArabicProcessing, handlePreBuild, handleBuild, handleCheckIntegrity } = build;


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
    // technicalBypass is declared as Set<string> on EditorState but serialized as string[]
    const storedBypass = (stored as unknown as { technicalBypass?: unknown }).technicalBypass;
    const bypassSet = new Set<string>(
      Array.isArray(storedBypass) ? (storedBypass as string[]) : []
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
      // Phase 1 — Schema versioning gate. Runs BEFORE any read so that an
      // incompatible old structure can be auto-backed-up + wiped first.
      try {
        const result = await checkAndMigrateSchema(APP_VERSION);
        if (result.status === "migrated") {
          toast({
            title: "🔄 ترقية بنية البيانات",
            description: result.backupTriggered
              ? `تم تنزيل نسخة احتياطية تلقائياً (من v${result.storedSchemaVersion} إلى v المستقرة) ثم مسح البيانات القديمة. يمكنك إعادة استيراد JSON.`
              : "تم تحديث بنية البيانات. لا توجد ترجمات قديمة لاسترجاعها.",
            duration: 12000,
          });
        } else if (result.status === "appVersionChanged") {
          console.info(`[idb] App version changed ${result.storedAppVersion} → ${APP_VERSION}`);
        }
      } catch (err) {
        console.error("[idb] schema check failed:", err);
      }

      // Check if stored originals exist
      const savedOriginals = await idbGet<Record<string, string>>("originalTexts");
      if (savedOriginals && Object.keys(savedOriginals).length > 0) {
        setHasStoredOriginals(true);
      }

      const stored = await idbGet<EditorState>("editorState");
      if (stored && stored.entries && stored.entries.length > 0) {
        const isFreshExtraction = !!(stored as { freshExtraction?: unknown }).freshExtraction;
        
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

  // === Deep diagnostic counts — uses shared predicates so the dropdown
  // badge count is GUARANTEED to match the filteredEntries length. ===
  const deepDiagnosticCounts = useMemo(() => {
    const counts = { xenoNMissing: 0, excessiveLines: 0, byteBudget: 0, newlineDiff: 0, identicalOriginal: 0 };
    if (!state) return counts;
    for (const e of state.entries) {
      const key = `${e.msbtFile}:${e.index}`;
      const translation = state.translations[key] || '';
      if (!translation.trim()) continue;
      if (deepDiagPredicates.xenoNMissing(e.original, translation)) counts.xenoNMissing++;
      if (deepDiagPredicates.excessiveLines(e.original, translation)) counts.excessiveLines++;
      if (deepDiagPredicates.byteBudget(e.original, translation)) counts.byteBudget++;
      if (deepDiagPredicates.newlineDiff(e.original, translation)) counts.newlineDiff++;
      if (deepDiagPredicates.identicalOriginal(e.original, translation)) counts.identicalOriginal++;
    }
    return counts;
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
      const isDr = !isBdat && e.msbtFile.includes(':') && !e.msbtFile.startsWith('bdat');
      const matchCategory = filterCategory.length === 0 || filterCategory.includes(isBdat ? categorizeBdatTable(e.label, sourceFile, e.original) : isDr ? categorizeDanganronpaFile(e.msbtFile) : categorizeFile(e.msbtFile));
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
        (filterStatus === "missing-tags" && qualityStats.missingTagKeys.has(key)) ||
        (filterStatus === "fuzzy" && !!(state.fuzzyScores?.[key])) ||
        (filterStatus === "byte-overflow" && e.maxBytes > 0 && isTranslated && new TextEncoder().encode(translation).length > e.maxBytes) ||
        (filterStatus === "has-newlines" && e.original.includes('\n')) ||
        (filterStatus === "xeno-n-missing" && matchesDeepDiagFilter("xeno-n-missing", e.original, translation)) ||
        (filterStatus === "excessive-lines" && matchesDeepDiagFilter("excessive-lines", e.original, translation)) ||
        (filterStatus === "byte-budget" && matchesDeepDiagFilter("byte-budget", e.original, translation)) ||
        (filterStatus === "newline-diff" && matchesDeepDiagFilter("newline-diff", e.original, translation)) ||
        (filterStatus === "identical-original" && matchesDeepDiagFilter("identical-original", e.original, translation));
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

  useEffect(() => { setCurrentPage(0); clearReviewedKeys(); }, [search, filterFile, filterCategory, filterStatus, filterTechnical, filterTable, filterColumn]);

  const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);
  const paginatedEntries = useMemo(() => {
    const start = currentPage * PAGE_SIZE;
    return filteredEntries.slice(start, start + PAGE_SIZE);
  }, [filteredEntries, currentPage]);


  // === Translation handlers ===
  const lastTagFixToastRef = useRef(0);
  const lastClosingTagToastRef = useRef(0);

  /** Detect closing colon-tags in original that are missing from translation */
  const findMissingClosingTags = (original: string, translation: string): string[] => {
    const closingTagRegex = /\[\s*\/\s*\w+\s*:[^\]]*\]/g;
    const origClosingTags = [...original.matchAll(closingTagRegex)].map(m => m[0]);
    if (origClosingTags.length === 0) return [];
    return origClosingTags.filter(tag => !translation.includes(tag));
  };

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
      // Check for missing closing tags BEFORE auto-fix (to show user what was wrong)
      const missingClosing = findMissingClosingTags(entry.original, value);

      const fixed = restoreTagsLocally(entry.original, value);
      if (fixed !== value) {
        finalValue = fixed;
        // Throttle toast to max once per 5 seconds
        const now = Date.now();

        // Show specific closing-tag warning with fix button
        if (missingClosing.length > 0 && now - lastClosingTagToastRef.current > 5000) {
          lastClosingTagToastRef.current = now;
          toast({
            title: "⚠️ وسوم إغلاق مفقودة",
            description: `تم اكتشاف ${missingClosing.length} وسم إغلاق مفقود (${missingClosing.join('، ')}) وتم إصلاحه تلقائياً`,
            duration: 5000,
          });
        } else if (now - lastTagFixToastRef.current > 5000) {
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
      import("@/lib/translation-history").then(m => m.addToHistory(key, finalValue)).catch(() => {});
    }
  };

  const updateTranslationsBatch = useCallback((updates: Record<string, string>) => {
    if (!state) return 0;

    const nextUpdates: Record<string, string> = {};
    const prevTranslationsBatch: Record<string, string> = {};

    for (const [key, value] of Object.entries(updates)) {
      const prev = state.translations[key] || '';
      if (prev === value) continue;
      prevTranslationsBatch[key] = prev;
      nextUpdates[key] = value;
    }

    const changedCount = Object.keys(nextUpdates).length;
    if (changedCount === 0) return 0;

    setPreviousTranslations(old => ({ ...old, ...prevTranslationsBatch }));
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...nextUpdates } } : null);

    return changedCount;
  }, [state, setState, setPreviousTranslations]);

  const handleUndoTranslation = (key: string) => {
    if (previousTranslations[key] !== undefined) {
      setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: previousTranslations[key] } } : null);
      setPreviousTranslations(old => { const copy = { ...old }; delete copy[key]; return copy; });
    }
  };

  const translation = useEditorTranslation({
    state, setState, setLastSaved, setTranslateProgress, setPreviousTranslations, updateTranslation,
    filterCategory, activeGlossary, parseGlossaryMap, paginatedEntries, filteredEntries, totalPages, setCurrentPage, userGeminiKey, userDeepSeekKey, userGroqKey, userCerebrasKey, userOpenRouterKey, translationProvider, myMemoryEmail, addMyMemoryChars, addAiRequest, rebalanceNewlines, npcMaxLines, npcMode, npcSplitCharLimit, aiModel, tmAutoReuse, aiThrottleEnabled,
  });
  const { translating, translatingSingle, tmStats, glossarySessionStats, failedEntries, handleTranslateSingle, handleAutoTranslate, handleTranslatePage, handleTranslateAllPages, handleTranslateFromGlossaryOnly, handleStopTranslate, handleRetranslatePage: _handleRetranslatePageRaw, handleRetryFailed, handleFixDamagedTags, pendingPageTranslations, oldPageTranslations, pageTranslationOriginals, showPageCompare, applyPendingTranslations: _applyPendingRaw, discardPendingTranslations, glossaryPreviewEntries, showGlossaryPreview, applyGlossaryPreview, discardGlossaryPreview } = translation;

  const autoPilot = useAutoPilot({
    state, setState, activeGlossary, parseGlossaryMap,
    translationProvider, userGeminiKey, userDeepSeekKey, userGroqKey, userCerebrasKey, userOpenRouterKey,
    myMemoryEmail, rebalanceNewlines, npcMaxLines, npcMode, aiModel,
    addAiRequest, addMyMemoryChars, qualityStats, filteredEntries,
  });

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


  // === File IO (extracted to useEditorFileIO) ===
  const filterStatusLabels: Record<string, string> = {
    'translated': 'مترجم', 'untranslated': 'غير مترجم', 'problems': 'مشاكل',
    'needs-improve': 'تحتاج تحسين', 'too-short': 'قصيرة', 'too-long': 'طويلة',
    'stuck-chars': 'أحرف ملتصقة', 'mixed-lang': 'مختلط', 'has-tags': 'أوسمة',
    'damaged-tags': 'أوسمة تالفة', 'fuzzy': 'غامض', 'byte-overflow': 'تجاوز',
    'has-newlines': 'أسطر متعددة',
  };
  const filterLabel = filterCategory.length > 0 ? filterCategory.join('+')
    : filterFile !== "all" ? filterFile
    : filterStatus !== "all" ? (filterStatusLabels[filterStatus] || filterStatus)
    : filterTechnical !== "all" ? filterTechnical
    : search.trim().length > 0 ? `بحث: ${search.trim()}`
    : filterTable !== "all" ? filterTable
    : filterColumn !== "all" ? filterColumn
    : pinnedKeys !== null ? "مثبّتة"
    : "";

  // === Clear translations (with undo) ===
  const isFilterActive = hasActiveEditorScope({
    search,
    filterFile,
    filterCategory,
    filterStatus,
    filterTechnical,
    filterTable,
    filterColumn,
    pinnedKeys,
  });
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

  // === Review (extracted to useEditorReview) ===
  const review = useEditorReview({
    state, setState, setTranslateProgress, setLastSaved, setPreviousTranslations,
    filteredEntries, activeGlossary, aiModel,
    setReviewing, setReviewResults, setSuggestingShort, setShortSuggestions,
    setImprovingTranslations, setImproveResults, setFixingMixed,
    setCheckingConsistency, setConsistencyResults,
    setSmartReviewing, setSmartReviewFindings,
    setEnhancingTranslations, setEnhanceResults,
    setAdvancedAnalyzing, setAdvancedAnalysisTab,
    setLiteralResults, setStyleResults, setConsistencyCheckResult, setAlternativeResults, setFullAnalysisResults,
    advancedAnalysisCancelRef,
    setAutoCorrectResults, setAutoCorrectApplied, setAutoCorrectProgress, autoCorrectAbortRef,
    setWeakTranslations, setDetectingWeak, setDetectWeakProgress, detectWeakAbortRef,
    reviewedKeysRef, addReviewedKeys,
    reviewResults, shortSuggestions, improveResults, consistencyResults, smartReviewFindings,
    enhanceResults, literalResults, styleResults, alternativeResults, fullAnalysisResults, weakTranslations,
    isMixedLanguage,
  });
  const {
    handleReviewTranslations, handleSuggestShorterTranslations, handleApplyShorterTranslation, handleApplyAllShorterTranslations,
    handleFixAllStuckCharacters, handleFixMixedLanguage,
    handleSmartReview, handleApplySmartFix, handleApplyAllSmartFixes, handleDismissSmartFinding,
    handleGrammarCheck, handleContextReview,
    handleAutoCorrect, handleStopAutoCorrect,
    handleDetectWeak, handleStopDetectWeak, handleApplyWeakFix, handleApplyAllWeakFixes,
    handleContextRetranslate,
    handleEnhanceTranslations, handleApplyEnhanceSuggestion, handleApplyAllEnhanceSuggestions, handleCloseEnhanceResults,
    handleAdvancedAnalysis, handleApplyAdvancedSuggestion, handleApplyAllAdvanced, handleStopAdvancedAnalysis, handleCloseAdvancedPanel,
    handleImproveTranslations, handleApplyImprovement, handleApplyAllImprovements, handleImproveSingleTranslation,
    handleCheckConsistency, handleApplyConsistencyFix, handleApplyAllConsistencyFixes,
  } = review;

  // === Cleanup (extracted to useEditorCleanup) ===
  const cleanup = useEditorCleanup({
    state, setState, setLastSaved, setPreviousTranslations,
    filteredEntries, isFilterActive,
    npcSplitCharLimit, npcMode, npcMaxLines, newlineSplitCharLimit,
    setDiacriticsCleanResults, setNewlineCleanResults, setMirrorCharsResults,
    setTagBracketFixResults, setArabicTextFixResults, setNewlineSplitResults,
    setNpcSplitResults, setLineSyncResults, setUnifiedSplitResults,
    diacriticsCleanResults, newlineCleanResults, mirrorCharsResults,
    tagBracketFixResults, arabicTextFixResults, newlineSplitResults,
    npcSplitResults, lineSyncResults, unifiedSplitResults,
  });
  const {
    handleScanDiacritics, handleApplyDiacriticsClean, handleRejectDiacriticsClean, handleApplyAllDiacriticsCleans, handleRemoveAllDiacritics,
    handleScanNewlines, handleApplyNewlineClean, handleRejectNewlineClean, handleApplyAllNewlineCleans,
    handleScanNewlineSplit, handleApplyNewlineSplit, handleRejectNewlineSplit, handleApplyAllNewlineSplits, handleSplitSingleEntry,
    handleScanNpcSplit, handleApplyNpcSplit, handleRejectNpcSplit, handleApplyAllNpcSplits, npcAffectedCount,
    handleScanLineSync, handleApplyLineSync, handleRejectLineSync, handleApplyAllLineSyncs, lineSyncAffectedCount,
    handleScanAllSplits, handleApplyUnifiedSplit, handleRejectUnifiedSplit, handleApplyAllUnifiedSplits,
    handleFontTest, handleFlattenAllNewlines,
    handleScanMirrorChars, handleApplyMirrorCharsClean, handleRejectMirrorCharsClean, handleApplyAllMirrorCharsCleans,
    handleScanTagBrackets, handleApplyTagBracketFix, handleRejectTagBracketFix, handleApplyAllTagBracketFixes,
    handleScanArabicTextFixes, handleApplyArabicTextFix, handleRejectArabicTextFix, handleApplyAllArabicTextFixes, handleScanLonelyLam,
  } = cleanup;






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

  const handleRestoreOriginals = useCallback(async () => {
    if (!state) return;
    const { idbGet } = await import("@/lib/idb-storage");
    const savedOriginals = await idbGet<Record<string, string>>("originalTexts");
    if (!savedOriginals) return;
    setPreviousTranslations({ ...state.translations });
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...savedOriginals } } : null);
    setHasStoredOriginals(false);
    toast({ title: "✅ تم استعادة النصوص الأصلية" });
  }, [state]);

  const handleTogglePin = useCallback(() => {
    if (isSearchPinned) {
      setPinnedKeys(null);
      setIsSearchPinned(false);
    } else {
      const keys = new Set(filteredEntries.map(e => `${e.msbtFile}:${e.index}`));
      setPinnedKeys(keys);
      setIsSearchPinned(true);
    }
  }, [isSearchPinned, filteredEntries]);

  return {
    // State
    state, search, filterFile, filterCategory, filterStatus, filterTechnical, filterTable, filterColumn, showFindReplace,
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
    showRetranslateConfirm,
    applyingArabic, improvingTranslations, improveResults,
    fixingMixed, filtersOpen, buildStats, buildPreview, showBuildConfirm, bdatFileStats, safetyRepairs, showSafetyReport, setShowSafetyReport,
    checkingConsistency, consistencyResults,
    scanningSentences, newlineCleanResults, diacriticsCleanResults, mirrorCharsResults, tagBracketFixResults, newlineSplitResults, npcSplitResults, lineSyncResults, unifiedSplitResults, arabicTextFixResults,
    smartReviewing, smartReviewFindings,
    enhanceResults, enhancingTranslations,
    // Advanced Analysis
    advancedAnalysisTab, literalResults, styleResults, consistencyCheckResult, alternativeResults, fullAnalysisResults, advancedAnalyzing,
    glossaryComplianceResults, checkingGlossaryCompliance,
    isSearchPinned, pinnedKeys,
    categoryProgress, qualityStats, needsImproveCount, translatedCount, tagsCount, fuzzyCount, byteOverflowCount, multiLineCount, newlinesCount, npcAffectedCount, lineSyncAffectedCount,
    deepDiagnosticCounts,
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
    tmAutoReuse, setTmAutoReuse,
    aiThrottleEnabled, setAiThrottleEnabled,

    // Handlers
    toggleProtection, toggleTechnicalBypass,
    handleProtectAllArabic, handleFixReversed, handleFixAllReversed,
    updateTranslation, updateTranslationsBatch, handleUndoTranslation,
    handleTranslateSingle, handleAutoTranslate, handleTranslatePage, handleTranslateAllPages, handleTranslateFromGlossaryOnly, handleStopTranslate,
    glossaryPreviewEntries, showGlossaryPreview, applyGlossaryPreview, discardGlossaryPreview,
    failedEntries, handleRetryFailed,
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
    
    handleScanArabicTextFixes, handleApplyArabicTextFix, handleRejectArabicTextFix, handleApplyAllArabicTextFixes, handleScanLonelyLam,
    handleTogglePin,
    handleClearTranslations, handleUndoClear, clearUndoBackup, isFilterActive,
    integrityResult, showIntegrityDialog, setShowIntegrityDialog, checkingIntegrity,

    // Quality helpers
    isTranslationTooShort, isTranslationTooLong, hasStuckChars, isMixedLanguage, needsImprovement,

    // AutoPilot
    autoPilot,
  };
}
