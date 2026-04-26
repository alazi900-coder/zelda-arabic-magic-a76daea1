import { useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import { getEdgeFunctionUrl, getSupabaseHeaders } from "@/lib/supabase-edge";
import type {
  EditorState, ExtractedEntry,
  ReviewResults, ShortSuggestion, ImproveResult,
} from "@/components/editor/types";
import type {
  AnalysisAction, LiteralResult, StyleResult,
  ConsistencyResult, ConsistencyItem, AlternativeResult, FullAnalysisResult,
} from "@/components/editor/AdvancedTranslationPanel";
import type { SmartReviewFinding } from "@/components/editor/SmartReviewPanel";
import type { EnhanceResult } from "@/components/editor/TranslationEnhancePanel";

// ============================================================
// Types local to this hook (not already defined elsewhere)
// ============================================================

/** Shape used by handleApplyConsistencyFix — note variants here include `file`. */
export interface ConsistencyPanelGroup {
  term: string;
  variants: { key: string; translation: string; file: string }[];
}

export interface ConsistencyPanelResults {
  groups: ConsistencyPanelGroup[];
  aiSuggestions: { best: string; reason: string }[];
}

export interface WeakTranslation {
  key: string;
  suggestion?: string;
  score?: number;
  reason?: string;
}

export interface AutoCorrectResult {
  key: string;
  original: string;
  current: string;
  corrected: string;
}

export interface Progress {
  current: number;
  total: number;
}

interface UseEditorReviewParams {
  state: EditorState | null;
  setState: React.Dispatch<React.SetStateAction<EditorState | null>>;
  setTranslateProgress: (v: string) => void;
  setLastSaved: (v: string) => void;
  setPreviousTranslations: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  filteredEntries: ExtractedEntry[];
  activeGlossary: string;
  aiModel: string;
  // Scan result setters from useEditorScanResults
  setReviewing: (v: boolean) => void;
  setReviewResults: React.Dispatch<React.SetStateAction<ReviewResults | null>>;
  setSuggestingShort: (v: boolean) => void;
  setShortSuggestions: React.Dispatch<React.SetStateAction<ShortSuggestion[] | null>>;
  setImprovingTranslations: (v: boolean) => void;
  setImproveResults: React.Dispatch<React.SetStateAction<ImproveResult[] | null>>;
  setFixingMixed: (v: boolean) => void;
  setCheckingConsistency: (v: boolean) => void;
  setConsistencyResults: React.Dispatch<React.SetStateAction<ConsistencyPanelResults | null>>;
  setSmartReviewing: (v: boolean) => void;
  setSmartReviewFindings: React.Dispatch<React.SetStateAction<SmartReviewFinding[] | null>>;
  setEnhancingTranslations: (v: boolean) => void;
  setEnhanceResults: React.Dispatch<React.SetStateAction<EnhanceResult[] | null>>;
  setAdvancedAnalyzing: (v: boolean) => void;
  setAdvancedAnalysisTab: React.Dispatch<React.SetStateAction<AnalysisAction>>;
  setLiteralResults: React.Dispatch<React.SetStateAction<LiteralResult[] | null>>;
  setStyleResults: React.Dispatch<React.SetStateAction<StyleResult[] | null>>;
  setConsistencyCheckResult: (v: ConsistencyResult | null) => void;
  setAlternativeResults: React.Dispatch<React.SetStateAction<AlternativeResult[] | null>>;
  setFullAnalysisResults: React.Dispatch<React.SetStateAction<FullAnalysisResult[] | null>>;
  advancedAnalysisCancelRef: React.MutableRefObject<boolean>;
  setAutoCorrectResults: (v: AutoCorrectResult[] | null) => void;
  setAutoCorrectApplied: React.Dispatch<React.SetStateAction<boolean>>;
  setAutoCorrectProgress: (v: Progress | null) => void;
  autoCorrectAbortRef: React.MutableRefObject<AbortController | null>;
  setWeakTranslations: React.Dispatch<React.SetStateAction<WeakTranslation[] | null>>;
  setDetectingWeak: (v: boolean) => void;
  setDetectWeakProgress: (v: Progress | null) => void;
  detectWeakAbortRef: React.MutableRefObject<AbortController | null>;
  reviewedKeysRef: React.MutableRefObject<Set<string>>;
  addReviewedKeys: (keys: string[]) => void;
  reviewResults: ReviewResults | null;
  shortSuggestions: ShortSuggestion[] | null;
  improveResults: ImproveResult[] | null;
  consistencyResults: ConsistencyPanelResults | null;
  smartReviewFindings: SmartReviewFinding[] | null;
  enhanceResults: EnhanceResult[] | null;
  literalResults: LiteralResult[] | null;
  styleResults: StyleResult[] | null;
  alternativeResults: AlternativeResult[] | null;
  fullAnalysisResults: FullAnalysisResult[] | null;
  weakTranslations: WeakTranslation[] | null;
  isMixedLanguage: (text: string) => boolean;
}

export function useEditorReview(params: UseEditorReviewParams) {
  const {
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
  } = params;

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
      const response = await fetch(getEdgeFunctionUrl("review-translations"), {
        method: 'POST',
        headers: getSupabaseHeaders(),
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
      const response = await fetch(getEdgeFunctionUrl("review-translations"), {
        method: 'POST',
        headers: getSupabaseHeaders(),
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

  // === Fix stuck characters ===
  const handleFixAllStuckCharacters = () => {
    if (!state) return;
    const { hasArabicPresentationForms, removeArabicPresentationForms } = require("@/lib/arabic-processing");
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

  // === Fix mixed language ===
  const handleFixMixedLanguage = async () => {
    if (!state) return;
    setFixingMixed(true);
    setTranslateProgress("🌐 جاري إصلاح النصوص المختلطة...");
    try {
      const mixedEntries = state.entries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; const t = state.translations[key]; return t?.trim() && isMixedLanguage(t); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`] }));
      if (mixedEntries.length === 0) { setTranslateProgress("لا توجد نصوص مختلطة للإصلاح"); setTimeout(() => setTranslateProgress(""), 3000); return; }
      const BATCH = 20;
      const allUpdates: Record<string, string> = {};
      let processed = 0;
      for (let i = 0; i < mixedEntries.length; i += BATCH) {
        const batch = mixedEntries.slice(i, i + BATCH);
        setTranslateProgress(`🌐 إصلاح النصوص المختلطة... ${processed}/${mixedEntries.length}`);
        const response = await fetch(getEdgeFunctionUrl("fix-mixed-language"), {
          method: 'POST',
          headers: getSupabaseHeaders(),
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

  // === Smart Review ===
  const handleSmartReview = async () => {
    if (!state) return;
    setSmartReviewing(true);
    setSmartReviewFindings(null);
    toast({ title: "🔬 بدأت المراجعة الذكية", description: "تحليل عميق للترجمات في الخلفية..." });
    try {
      const reviewEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim() && !reviewedKeysRef.current.has(key); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], maxBytes: e.maxBytes || 0 }));
      if (reviewEntries.length === 0) { toast({ title: "لا توجد ترجمات للمراجعة" }); return; }
      setTranslateProgress(`🔬 جاري المراجعة الذكية العميقة (${reviewEntries.length} نص)...`);
      const response = await fetch(getEdgeFunctionUrl("review-translations"), {
        method: 'POST',
        headers: getSupabaseHeaders(),
        body: JSON.stringify({ entries: reviewEntries, glossary: activeGlossary, action: 'smart-review', aiModel }),
      });
      if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.error || `خطأ ${response.status}`); }
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

  const handleApplySmartFix = (key: string, fix: string) => {
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: fix } } : null);
    setSmartReviewFindings((prev) => prev ? prev.filter((f) => f.key !== key) : null);
    addReviewedKeys([key]);
  };

  const handleApplyAllSmartFixes = () => {
    if (!smartReviewFindings || !state) return;
    const updates: Record<string, string> = {};
    for (const f of smartReviewFindings) { if (f.fix) updates[f.key] = f.fix; }
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setSmartReviewFindings([]);
    addReviewedKeys(Object.keys(updates));
    toast({ title: `✅ تم تطبيق ${Object.keys(updates).length} إصلاح` });
  };

  const handleDismissSmartFinding = (key: string) => { addReviewedKeys([key]); };

  // === Grammar Check ===
  const handleGrammarCheck = async () => {
    if (!state) return;
    setSmartReviewing(true);
    setSmartReviewFindings(null);
    toast({ title: "📝 بدأ فحص القواعد النحوية", description: "تحليل الأخطاء النحوية والإملائية..." });
    try {
      const reviewEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim() && !reviewedKeysRef.current.has(key); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], maxBytes: e.maxBytes || 0 }));
      if (reviewEntries.length === 0) { toast({ title: "لا توجد ترجمات للفحص" }); return; }
      setTranslateProgress(`📝 جاري فحص القواعد النحوية (${reviewEntries.length} نص)...`);
      const response = await fetch(getEdgeFunctionUrl("review-translations"), {
        method: 'POST',
        headers: getSupabaseHeaders(),
        body: JSON.stringify({ entries: reviewEntries, glossary: activeGlossary, action: 'grammar-check', aiModel }),
      });
      if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.error || `خطأ ${response.status}`); }
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

  // === Context Review ===
  const handleContextReview = async () => {
    if (!state) return;
    setSmartReviewing(true);
    setSmartReviewFindings(null);
    toast({ title: "🎯 بدأت المراجعة السياقية", description: "تحليل الترجمات في سياقها..." });
    try {
      const reviewEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim() && !reviewedKeysRef.current.has(key); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], maxBytes: e.maxBytes || 0 }));
      if (reviewEntries.length === 0) { toast({ title: "لا توجد ترجمات للمراجعة" }); return; }
      const contextEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .slice(0, 30)
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`] }));
      setTranslateProgress(`🎯 جاري المراجعة السياقية (${reviewEntries.length} نص)...`);
      const response = await fetch(getEdgeFunctionUrl("review-translations"), {
        method: 'POST',
        headers: getSupabaseHeaders(),
        body: JSON.stringify({ entries: reviewEntries, glossary: activeGlossary, action: 'context-review', aiModel, contextEntries }),
      });
      if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.error || `خطأ ${response.status}`); }
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

  // === Auto-Correct ===
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
      const allCorrections: { key: string; original: string; current: string; corrected: string }[] = [];
      let processed = 0;
      for (const batch of batches) {
        if (abortCtrl.signal.aborted) break;
        const response = await fetch(getEdgeFunctionUrl("review-translations"), {
          method: 'POST',
          headers: getSupabaseHeaders(),
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

  // === Detect Weak ===
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
      const allWeak: { key: string; original: string; current: string; score: number; reason: string; suggestion: string }[] = [];
      let processed = 0;
      for (const batch of batches) {
        if (abortCtrl.signal.aborted) break;
        const response = await fetch(getEdgeFunctionUrl("review-translations"), {
          method: 'POST',
          headers: getSupabaseHeaders(),
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
    setWeakTranslations((prev) => prev ? prev.filter((w) => w.key !== key) : null);
  };

  const handleApplyAllWeakFixes = () => {
    if (!weakTranslations || !state) return;
    const updates: Record<string, string> = {};
    for (const w of weakTranslations) { if (w.suggestion) updates[w.key] = w.suggestion; }
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setWeakTranslations([]);
    toast({ title: `✅ تم تطبيق ${Object.keys(updates).length} تحسين` });
  };

  // === Context Re-translation ===
  const handleContextRetranslate = async () => {
    if (!state) return;
    setSmartReviewing(true);
    toast({ title: "🎯 بدأت إعادة الترجمة بالسياق", description: "إعادة ترجمة النصوص مع مراعاة السياق المحيط..." });
    try {
      const reviewEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], maxBytes: e.maxBytes || 0 }));
      if (reviewEntries.length === 0) { toast({ title: "لا توجد ترجمات لإعادة الترجمة" }); return; }
      const contextEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .slice(0, 30)
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`] }));
      setTranslateProgress(`🎯 جاري إعادة الترجمة بالسياق (${reviewEntries.length} نص)...`);
      const response = await fetch(getEdgeFunctionUrl("review-translations"), {
        method: 'POST',
        headers: getSupabaseHeaders(),
        body: JSON.stringify({ entries: reviewEntries, glossary: activeGlossary, action: 'context-retranslate', aiModel, contextEntries }),
      });
      if (!response.ok) { const errData = await response.json().catch(() => ({})); throw new Error(errData.error || `خطأ ${response.status}`); }
      const data = await response.json();
      const retranslations = data.retranslations || [];
      if (retranslations.length === 0) {
        setTranslateProgress("✅ لم يتم العثور على تحسينات سياقية");
        setTimeout(() => setTranslateProgress(""), 4000);
      } else {
        const findings: SmartReviewFinding[] = retranslations.map((r: {
          key: string; original: string; current: string;
          changes?: string; retranslated?: string;
        }) => ({
          key: r.key, original: r.original, current: r.current,
          type: 'naturalness',
          issue: r.changes || 'تحسين سياقي',
          fix: r.retranslated || '',
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

  // === Enhance Translations ===
  const handleEnhanceTranslations = async () => {
    if (!state) return;
    setEnhancingTranslations(true);
    setEnhanceResults(null);
    toast({ title: "🎯 بدأ التحسين السياقي", description: "تحليل الترجمات مع مراعاة السياق والشخصيات..." });
    try {
      const translatedEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .slice(0, 20)
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], fileName: e.msbtFile }));
      if (translatedEntries.length === 0) {
        setTranslateProgress("⚠️ لا توجد ترجمات للتحسين في النطاق المحدد");
        setTimeout(() => setTranslateProgress(""), 3000);
        setEnhancingTranslations(false);
        return;
      }
      setTranslateProgress(`🎯 جاري تحليل ${translatedEntries.length} ترجمة سياقياً...`);
      const response = await fetch(getEdgeFunctionUrl("enhance-translations"), {
        method: 'POST',
        headers: { ...getSupabaseHeaders() },
        body: JSON.stringify({ entries: translatedEntries, action: 'analyze', glossary: activeGlossary?.split('\n').slice(0, 200).join('\n'), aiModel }),
      });
      if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(errorData.error || `خطأ ${response.status}`); }
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const withIssues = (data.results as EnhanceResult[]).filter((r) => (r.issues?.length ?? 0) > 0 || (r.suggestions?.length ?? 0) > 0);
        setEnhanceResults(data.results);
        setTranslateProgress(`✅ تم تحليل ${data.results.length} ترجمة — ${withIssues.length} تحتاج تحسين`);
      } else {
        setTranslateProgress("✅ جميع الترجمات جيدة — لا توجد اقتراحات");
      }
      setTimeout(() => setTranslateProgress(""), 5000);
    } catch (err) {
      console.error('Enhance error:', err);
      toast({ title: "خطأ في التحسين السياقي", description: err instanceof Error ? err.message : 'خطأ غير متوقع', variant: "destructive" });
      setTranslateProgress("");
    } finally { setEnhancingTranslations(false); }
  };

  const handleApplyEnhanceSuggestion = (key: string, newTranslation: string) => {
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: newTranslation } } : null);
    setEnhanceResults((prev) => prev ? prev.filter((r) => r.key !== key) : null);
    toast({ title: "✅ تم تطبيق الاقتراح" });
  };

  const handleApplyAllEnhanceSuggestions = () => {
    if (!enhanceResults || !state) return;
    const updates: Record<string, string> = {};
    for (const r of enhanceResults) {
      if (r.preferredSuggestion) updates[r.key] = r.preferredSuggestion;
      else if (r.suggestions?.[0]?.text) updates[r.key] = r.suggestions[0].text;
    }
    if (Object.keys(updates).length === 0) { toast({ title: "⚠️ لا توجد اقتراحات للتطبيق" }); return; }
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setEnhanceResults([]);
    toast({ title: `✅ تم تطبيق ${Object.keys(updates).length} تحسين` });
  };

  const handleCloseEnhanceResults = () => { setEnhanceResults(null); };

  // === Advanced Analysis ===
  const ADVANCED_BATCH_SIZE = 50;
  const MAX_ENTRIES_FOR_ANALYSIS = 500;

  const handleAdvancedAnalysis = async (action: AnalysisAction) => {
    if (!state) return;
    setAdvancedAnalyzing(true);
    setAdvancedAnalysisTab(action);
    advancedAnalysisCancelRef.current = false;
    setLiteralResults(null); setStyleResults(null); setConsistencyCheckResult(null); setAlternativeResults(null); setFullAnalysisResults(null);

    const actionLabels: Record<string, string> = {
      'literal-detect': '🔍 كشف الترجمات الحرفية', 'style-unify': '🎨 توحيد الأسلوب',
      'consistency-check': '🛡️ فحص الاتساق الشامل', 'alternatives': '📝 اقتراحات بديلة متعددة', 'full-analysis': '🧠 تحليل شامل متكامل',
    };
    toast({ title: actionLabels[action], description: "جاري تجهيز النصوص للتحليل..." });

    try {
      const allTranslatedEntries = filteredEntries
        .filter(e => { const key = `${e.msbtFile}:${e.index}`; return state.translations[key]?.trim(); })
        .slice(0, MAX_ENTRIES_FOR_ANALYSIS)
        .map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original, translation: state.translations[`${e.msbtFile}:${e.index}`], fileName: e.msbtFile }));
      if (allTranslatedEntries.length === 0) {
        setTranslateProgress("⚠️ لا توجد ترجمات للتحليل في النطاق المحدد");
        setTimeout(() => setTranslateProgress(""), 3000);
        setAdvancedAnalyzing(false);
        return;
      }

      const totalEntries = allTranslatedEntries.length;
      const totalBatches = Math.ceil(totalEntries / ADVANCED_BATCH_SIZE);
      setTranslateProgress(`${actionLabels[action]} — ${totalEntries} نص (${totalBatches} دفعات)`);
      const glossarySlice = activeGlossary?.split('\n').slice(0, 150).join('\n');

      let allLiteralResults: LiteralResult[] = [];
      let allStyleResults: StyleResult[] = [];
      let allAlternativeResults: AlternativeResult[] = [];
      let allFullResults: FullAnalysisResult[] = [];
      let allInconsistencies: ConsistencyItem[] = [];
      let totalScore = 0;
      let summaries: string[] = [];

      const commitPartialResults = (action: string) => {
        if (action === 'literal-detect' && allLiteralResults.length > 0) setLiteralResults([...allLiteralResults]);
        else if (action === 'style-unify' && allStyleResults.length > 0) setStyleResults([...allStyleResults]);
        else if (action === 'alternatives' && allAlternativeResults.length > 0) setAlternativeResults([...allAlternativeResults]);
        else if (action === 'full-analysis' && allFullResults.length > 0) setFullAnalysisResults([...allFullResults]);
        else if (action === 'consistency-check' && allInconsistencies.length > 0) {
          const unique = allInconsistencies.reduce<typeof allInconsistencies>((acc, item) => { if (!acc.find(i => i.term === item.term)) acc.push(item); return acc; }, []);
          setConsistencyCheckResult({ inconsistencies: unique, score: totalBatches > 0 ? Math.round(totalScore / (batchIdx || 1)) : 0, summary: summaries.join(' | ') });
        }
      };

      let batchIdx = 0;
      for (batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
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
          const response = await fetch(getEdgeFunctionUrl("translation-analysis"), {
            method: 'POST',
            headers: { ...getSupabaseHeaders() },
            body: JSON.stringify({ entries: batchEntries, action, glossary: glossarySlice, aiModel }),
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 429) { toast({ title: "⚠️ حد الطلبات", description: "انتظر قليلاً ثم أعد المحاولة", variant: "destructive" }); break; }
            console.error(`Batch ${batchIdx + 1} error:`, errorData);
            continue;
          }
          const data = await response.json();
          type RawAnalysisResult = { index?: number } & Record<string, unknown>;
          // Each action returns its own shape; we trust the server and cast after
          // enriching with key/original/translation from the batch context.
          const mapWithContext = <T>(results: RawAnalysisResult[]): T[] =>
            results.map((r, i) => ({
              key: batchEntries[r.index ?? i]?.key || `unknown:${start + i}`,
              original: batchEntries[r.index ?? i]?.original || '',
              translation: batchEntries[r.index ?? i]?.translation || '',
              ...r,
            })) as unknown as T[];
          if (action === 'literal-detect' && data.results) {
            allLiteralResults.push(...mapWithContext<LiteralResult>(data.results));
          } else if (action === 'style-unify' && data.results) {
            allStyleResults.push(...mapWithContext<StyleResult>(data.results));
          } else if (action === 'consistency-check') {
            if (data.inconsistencies) allInconsistencies.push(...data.inconsistencies);
            if (data.score) totalScore += data.score;
            if (data.summary) summaries.push(data.summary);
          } else if (action === 'alternatives' && data.results) {
            allAlternativeResults.push(...mapWithContext<AlternativeResult>(data.results));
          } else if (action === 'full-analysis' && data.results) {
            allFullResults.push(...mapWithContext<FullAnalysisResult>(data.results));
          }
          if ((batchIdx + 1) % 2 === 0 || batchIdx === totalBatches - 1) commitPartialResults(action);
          if (batchIdx < totalBatches - 1) await new Promise(resolve => setTimeout(resolve, 200));
        } catch (batchErr) { console.error(`Batch ${batchIdx + 1} failed:`, batchErr); continue; }
      }

      // Final results
      if (action === 'literal-detect') {
        setLiteralResults(allLiteralResults);
        setTranslateProgress(`✅ تم تحليل ${allLiteralResults.length} نص — ${allLiteralResults.filter(r => r.isLiteral).length} ترجمة حرفية`);
      } else if (action === 'style-unify') {
        setStyleResults(allStyleResults);
        setTranslateProgress(`✅ تم تحليل ${allStyleResults.length} نص — ${allStyleResults.filter(r => r.styleIssues?.length > 0 || r.unifiedVersion).length} يحتاج توحيد`);
      } else if (action === 'consistency-check') {
        const uniqueInconsistencies = allInconsistencies.reduce<typeof allInconsistencies>((acc, item) => { if (!acc.find(i => i.term === item.term)) acc.push(item); return acc; }, []);
        setConsistencyCheckResult({ inconsistencies: uniqueInconsistencies, score: totalBatches > 0 ? Math.round(totalScore / totalBatches) : 0, summary: summaries.join(' | ') });
        setTranslateProgress(`✅ درجة الاتساق: ${Math.round(totalScore / totalBatches)}/100 — ${uniqueInconsistencies.length} تناقض`);
      } else if (action === 'alternatives') {
        setAlternativeResults(allAlternativeResults);
        setTranslateProgress(`✅ ${allAlternativeResults.length} نص مع بدائل متعددة`);
      } else if (action === 'full-analysis') {
        setFullAnalysisResults(allFullResults);
        setTranslateProgress(`✅ تحليل ${allFullResults.length} نص: ${allFullResults.filter(r => r.isLiteral).length} حرفية، ${allFullResults.filter(r => r.issues?.length > 0).length} مشاكل`);
      }
      setTimeout(() => setTranslateProgress(""), 6000);
    } catch (err) {
      console.error('Advanced analysis error:', err);
      toast({ title: "خطأ في التحليل", description: err instanceof Error ? err.message : 'خطأ غير متوقع', variant: "destructive" });
      setTranslateProgress("");
    } finally { setAdvancedAnalyzing(false); }
  };

  const handleApplyAdvancedSuggestion = (key: string, newTranslation: string) => {
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, [key]: newTranslation } } : null);
    setLiteralResults((prev) => prev ? prev.filter((r) => r.key !== key) : null);
    setStyleResults((prev) => prev ? prev.filter((r) => r.key !== key) : null);
    setAlternativeResults((prev) => prev ? prev.filter((r) => r.key !== key) : null);
    setFullAnalysisResults((prev) => prev ? prev.filter((r) => r.key !== key) : null);
    toast({ title: "✅ تم تطبيق التحسين" });
  };

  const handleApplyAllAdvanced = (action: AnalysisAction) => {
    if (!state) return;
    const updates: Record<string, string> = {};
    if (action === 'literal-detect' && literalResults) { for (const r of literalResults) { if (r.isLiteral && r.naturalVersion) updates[r.key] = r.naturalVersion; } setLiteralResults([]); }
    else if (action === 'style-unify' && styleResults) { for (const r of styleResults) { if (r.unifiedVersion) updates[r.key] = r.unifiedVersion; } setStyleResults([]); }
    else if (action === 'alternatives' && alternativeResults) { for (const r of alternativeResults) { const best = r.alternatives?.find((a) => a.style === r.recommended) || r.alternatives?.[0]; if (best) updates[r.key] = best.text; } setAlternativeResults([]); }
    else if (action === 'full-analysis' && fullAnalysisResults) { for (const r of fullAnalysisResults) { if (r.recommended) updates[r.key] = r.recommended; else if (r.alternatives?.[0]?.text) updates[r.key] = r.alternatives[0].text; } setFullAnalysisResults([]); }
    if (Object.keys(updates).length === 0) { toast({ title: "⚠️ لا توجد اقتراحات للتطبيق" }); return; }
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    toast({ title: `✅ تم تطبيق ${Object.keys(updates).length} تحسين` });
  };

  const handleStopAdvancedAnalysis = () => { advancedAnalysisCancelRef.current = true; };

  const handleCloseAdvancedPanel = () => {
    setLiteralResults(null); setStyleResults(null); setConsistencyCheckResult(null); setAlternativeResults(null); setFullAnalysisResults(null);
  };

  // === Improve Translations ===
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
      const response = await fetch(getEdgeFunctionUrl("review-translations"), {
        method: 'POST',
        headers: getSupabaseHeaders(),
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
      const response = await fetch(getEdgeFunctionUrl("review-translations"), {
        method: 'POST',
        headers: getSupabaseHeaders(),
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
      const response = await fetch(getEdgeFunctionUrl("check-consistency"), {
        method: 'POST',
        headers: getSupabaseHeaders(),
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
      if (best) { for (const v of group.variants) { updates[v.key] = best; } count++; }
    });
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setConsistencyResults(null);
    setLastSaved(`✅ تم توحيد ${count} مصطلح تلقائياً`);
    setTimeout(() => setLastSaved(""), 3000);
  };

  return {
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
  };
}
