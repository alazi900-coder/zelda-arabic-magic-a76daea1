import { useState, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import {
  ExtractedEntry, EditorState, AI_BATCH_SIZE, PAGE_SIZE,
  categorizeFile, categorizeBdatTable, categorizeDanganronpaFile, isTechnicalText, hasTechnicalTags,
} from "@/components/editor/types";
import { restoreTagsLocally } from "@/lib/xc3-tag-restoration";
import { protectTags, restoreTags } from "@/lib/xc3-tag-protection";
import { fixTagBracketsStrict } from "@/lib/tag-bracket-fix";
import { splitEvenlyByLines } from "@/lib/balance-lines";
import { countEffectiveLines } from "@/lib/text-tokens";
import { fixMixedBidi } from "@/lib/arabic-processing";
import { getEdgeFunctionUrl, getSupabaseHeaders } from "@/lib/supabase-edge";

const NPC_FILE_RE = /msg_(ask|cq|fev|nq|sq|tlk|tq)/i;

interface UseEditorTranslationProps {
  state: EditorState | null;
  setState: React.Dispatch<React.SetStateAction<EditorState | null>>;
  setLastSaved: (msg: string) => void;
  setTranslateProgress: (msg: string) => void;
  setPreviousTranslations: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  updateTranslation: (key: string, value: string) => void;
  filterCategory: string[];
  activeGlossary: string;
  parseGlossaryMap: (glossary: string) => Map<string, string>;
  paginatedEntries: ExtractedEntry[];
  filteredEntries: ExtractedEntry[];
  totalPages: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  userGeminiKey: string;
  userDeepSeekKey: string;
  userGroqKey: string;
  userOpenRouterKey: string;
  translationProvider: 'gemini' | 'mymemory' | 'google' | 'deepseek' | 'groq' | 'openrouter';
  myMemoryEmail: string;
  addMyMemoryChars: (chars: number) => void;
  addAiRequest: (count?: number) => void;
  rebalanceNewlines: boolean;
  npcMaxLines: number;
  npcMode: boolean;
  npcSplitCharLimit: number;
  aiModel: string;
  tmAutoReuse: boolean;
  aiThrottleEnabled: boolean;
}

/**
 * Minimum spacing between consecutive AI batches, per provider.
 * Two profiles: free tier (no personal API key) vs. with personal key.
 * Free tier values are tuned to stay just under typical RPM limits, so
 * 100-text translations no longer trip 429 mid-run. With a personal key,
 * the limits are much higher and we use a small delay only to avoid
 * bursting on flaky networks.
 */
const PROVIDER_BATCH_DELAY_MS = {
  gemini:     { free: 4000, paid: 500 },  // ~15 RPM free tier
  openrouter: { free: 3000, paid: 1000 }, // ~20 RPM typical free model
  groq:       { free: 2000, paid: 500 },  // ~30 RPM free
  deepseek:   { free: 0,    paid: 0 },    // generous; no proactive throttle
  mymemory:   { free: 0,    paid: 0 },    // not AI; own char-budget logic
  google:     { free: 0,    paid: 0 },    // not AI
} as const;

export function useEditorTranslation({
  state, setState, setLastSaved, setTranslateProgress, setPreviousTranslations, updateTranslation,
  filterCategory, activeGlossary, parseGlossaryMap, paginatedEntries, filteredEntries, totalPages, setCurrentPage, userGeminiKey, userDeepSeekKey, userGroqKey, userOpenRouterKey, translationProvider, myMemoryEmail, addMyMemoryChars, addAiRequest, rebalanceNewlines, npcMaxLines, npcMode, npcSplitCharLimit, aiModel, tmAutoReuse, aiThrottleEnabled,
}: UseEditorTranslationProps) {

  /**
   * Detect a translation that came back un-translated. Catches the two failure
   * modes the backend currently doesn't notice:
   *   1) the model echoed the English source verbatim
   *   2) the model returned a plain English string with no Arabic at all
   * Tag-only / number-only originals are intentionally excluded so things like
   * "100" → "100" or "TAG_0" → "TAG_0" are still treated as success.
   */
  const looksUntranslated = (original: string, translated: string): boolean => {
    const t = (translated || '').trim();
    if (!t) return false;
    if (/[\u0600-\u06FF]/.test(t)) return false;
    if (/[a-zA-Z]{3,}/.test(t)) return true;
    if (t === (original || '').trim()) return true;
    return false;
  };

  /** Auto-sync Arabic line count to match English \n count (universal — all files) */
  const autoSyncLines = (key: string, translated: string, originalEntry?: ExtractedEntry): string => {
    if (!originalEntry) return translated;
    const englishLineCount = countEffectiveLines(originalEntry.original);

    // Protect tags before any text manipulation
    const { cleanText, tags } = protectTags(translated);

    // Flatten (remove newlines, collapse spaces)
    const flat = cleanText.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();

    let balanced: string;
    if (englishLineCount <= 1) {
      balanced = flat;
    } else {
      balanced = splitEvenlyByLines(flat, englishLineCount);
    }

    // Restore tags
    const result = restoreTags(balanced, tags);

    // Validate: warn if any placeholder leaked
    if (/TAG_\d+/.test(result)) {
      console.warn(`[autoSyncLines] Unreplaced tag placeholder in key: ${key}`);
    }

    return result;
  };
  const [translating, setTranslating] = useState(false);
  const [translatingSingle, setTranslatingSingle] = useState<string | null>(null);
  const [tmStats, setTmStats] = useState<{ reused: number; sent: number } | null>(null);
  const [glossarySessionStats, setGlossarySessionStats] = useState<{
    directMatches: number; lockedTerms: number; contextTerms: number;
    batchesCompleted: number; totalBatches: number; textsTranslated: number; freeTranslations: number;
  }>({ directMatches: 0, lockedTerms: 0, contextTerms: 0, batchesCompleted: 0, totalBatches: 0, textsTranslated: 0, freeTranslations: 0 });
  const abortControllerRef = useRef<AbortController | null>(null);

  // Failed entries tracking: entries sent to AI that got no translation back
  const [failedEntries, setFailedEntries] = useState<ExtractedEntry[]>([]);

  // Page translation compare state
  const [pendingPageTranslations, setPendingPageTranslations] = useState<Record<string, string> | null>(null);
  const [oldPageTranslations, setOldPageTranslations] = useState<Record<string, string>>({});
  const [pageTranslationOriginals, setPageTranslationOriginals] = useState<Record<string, string>>({});
  const [showPageCompare, setShowPageCompare] = useState(false);

  // Glossary preview state
  const [glossaryPreviewEntries, setGlossaryPreviewEntries] = useState<Array<{
    key: string; original: string; newTranslation: string; oldTranslation: string; matchType: 'exact' | 'partial';
  }>>([]);
  const [pendingGlossaryTranslations, setPendingGlossaryTranslations] = useState<Record<string, string>>({});
  const [showGlossaryPreview, setShowGlossaryPreview] = useState(false);

  const applyPendingTranslations = (selectedKeys?: Set<string>) => {
    if (!state || !pendingPageTranslations) return;
    const toApply: Record<string, string> = {};
    for (const [key, val] of Object.entries(pendingPageTranslations)) {
      if (!selectedKeys || selectedKeys.has(key)) {
        toApply[key] = val;
      }
    }
    const safeToApply = autoFixTags(toApply);
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...safeToApply } } : null);
    setPendingPageTranslations(null);
    setOldPageTranslations({});
    setPageTranslationOriginals({});
    setShowPageCompare(false);
  };

  const discardPendingTranslations = () => {
    setPendingPageTranslations(null);
    setOldPageTranslations({});
    setPageTranslationOriginals({});
    setShowPageCompare(false);
  };

  /** Auto-fix: restore protected tags, fix broken brackets, then restore any remaining missing tags */
  const autoFixTags = (translations: Record<string, string>, protectedMap?: Map<string, ReturnType<typeof protectTags>>): Record<string, string> => {
    if (!state) return translations;
    const fixed: Record<string, string> = {};
    for (const [key, trans] of Object.entries(translations)) {
      let result = trans;
      // First restore protected tag placeholders
      const p = protectedMap?.get(key);
      if (p && p.tags.length > 0) {
        result = restoreTags(result, p.tags);
      }
      // Then restore any remaining missing tags
      const entry = state.entries.find(e => `${e.msbtFile}:${e.index}` === key);
      if (entry && hasTechnicalTags(entry.original)) {
        result = restoreTagsLocally(entry.original, result);
        // Fix broken brackets around [Tag:Value] tags
        result = autoFixTagBrackets(entry.original, result);
      }
      // Auto-sync line count to match English source
      result = autoSyncLines(key, result, entry);
      // Fix BiDi alignment for mixed Arabic/English
      result = fixMixedBidi(result);
      fixed[key] = result;
    }
    return fixed;
  };

  /** Fix broken/reversed/orphan brackets around [Tag:Value] technical tags */
  const autoFixTagBrackets = (original: string, translation: string): string => {
    return fixTagBracketsStrict(original, translation).text;
  };

  const handleTranslateSingle = async (entry: ExtractedEntry) => {
    if (!state) return;
    const key = `${entry.msbtFile}:${entry.index}`;
    setTranslatingSingle(key);
    try {
      const glossaryMap = parseGlossaryMap(activeGlossary);
      const originalNorm = entry.original.trim().toLowerCase();
      // TM exact-match reuse (gated by user setting): saves an API call when an
      // identical original already has a translation elsewhere in the project.
      if (tmAutoReuse) {
        for (const [otherKey, otherTr] of Object.entries(state.translations)) {
          if (otherKey === key || !otherTr.trim()) continue;
          const otherEntry = state.entries.find(e => `${e.msbtFile}:${e.index}` === otherKey);
          if (otherEntry && otherEntry.original.trim().toLowerCase() === originalNorm) {
            updateTranslation(key, otherTr);
            setLastSaved(`⚡ من ذاكرة الترجمة (بدون ذكاء اصطناعي)`);
            setTimeout(() => setLastSaved(""), 3000);
            return;
          }
        }
      }
      const glossaryHit = glossaryMap.get(originalNorm);
      if (glossaryHit) {
        updateTranslation(key, glossaryHit);
        setLastSaved(`📖 ترجمة مباشرة من القاموس (بدون ذكاء اصطناعي)`);
        setTimeout(() => setLastSaved(""), 3000);
        return;
      }
      // Send original text directly — server handles tag protection (avoid double-protection)
      const response = await fetch(getEdgeFunctionUrl("translate-entries"), {
        method: 'POST',
        headers: getSupabaseHeaders(),
        body: JSON.stringify({ entries: [{ key, original: entry.original }], glossary: activeGlossary, userApiKey: translationProvider === 'gemini' ? (userGeminiKey || undefined) : undefined, providerApiKey: (translationProvider === 'deepseek' ? userDeepSeekKey : translationProvider === 'groq' ? userGroqKey : translationProvider === 'openrouter' ? userOpenRouterKey : undefined) || undefined, provider: translationProvider, myMemoryEmail: myMemoryEmail || undefined, rebalanceNewlines: rebalanceNewlines || undefined, npcMaxLines, npcMode: npcMode || undefined, aiModel }),
      });
      if (!response.ok) { const errData = await response.json().catch(() => null); throw new Error(errData?.error || `خطأ ${response.status}`); }
      const data = await response.json();
      addAiRequest(1);
      if (data.charsUsed) addMyMemoryChars(data.charsUsed);
      if (data.fallbackUsed) {
        toast({
          title: "🔄 تم التبديل لموديل بديل",
          description: `الموديل الأصلي ${data.fallbackUsed.primary} غير متاح — استُخدم ${data.fallbackUsed.actual}`,
        });
      }
      if (data.translations && data.translations[key]) {
        const translated = data.translations[key];
        if (looksUntranslated(entry.original, translated)) {
          toast({
            title: "⚠️ الترجمة بقيت إنجليزية",
            description: "حاول مرة أخرى أو بدّل الموديل لموديل أقوى",
            variant: "destructive",
          });
          return;
        }
        let processed = translated;
        // Post-process: local tag repair + auto-sync lines
        if (hasTechnicalTags(entry.original)) {
          processed = restoreTagsLocally(entry.original, processed);
          processed = autoFixTagBrackets(entry.original, processed);
        }
        // Auto-sync line count to match English source
        processed = autoSyncLines(key, processed, entry);
        // Fix BiDi alignment for mixed Arabic/English
        processed = fixMixedBidi(processed);
        updateTranslation(key, processed);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'خطأ في الترجمة';
      console.error('Single translate error:', err);
      toast({ title: "❌ فشل الترجمة", description: errMsg, variant: "destructive" });
    }
    finally { setTranslatingSingle(null); }
  };

  /** Categorize an entry using the correct function (BDAT vs MSBT) */
  const categorizeEntry = (e: ExtractedEntry): string => {
    const isBdat = /^.+?\[\d+\]\./.test(e.label);
    if (isBdat) {
      const sourceFile = e.msbtFile.startsWith('bdat-bin:') ? e.msbtFile.split(':')[1] : e.msbtFile.startsWith('bdat:') ? e.msbtFile.slice(5) : undefined;
      return categorizeBdatTable(e.label, sourceFile, e.original);
    }
    const isDr = e.msbtFile.includes(':') && !e.msbtFile.startsWith('bdat');
    if (isDr) return categorizeDanganronpaFile(e.msbtFile);
    return categorizeFile(e.msbtFile);
  };

  const handleAutoTranslate = async () => {
    if (!state) return;
    const arabicRegex = /[\u0600-\u06FF]/;
    let skipEmpty = 0, skipArabic = 0, skipTechnical = 0, skipTranslated = 0, skipCategory = 0;
    const untranslated = state.entries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      const matchCategory = filterCategory.length === 0 || filterCategory.includes(categorizeEntry(e));
      if (!matchCategory) { skipCategory++; return false; }
      if (!e.original.trim()) { skipEmpty++; return false; }
      if (arabicRegex.test(e.original)) { skipArabic++; return false; }
      if (isTechnicalText(e.original) && !state.technicalBypass?.has(key)) { skipTechnical++; return false; }
      if (state.translations[key]?.trim()) { skipTranslated++; return false; }
      return true;
    });

    if (untranslated.length === 0) {
      const reasons: string[] = [];
      if (skipArabic > 0) reasons.push(`${skipArabic} نص عربي أصلاً`);
      if (skipTechnical > 0) reasons.push(`${skipTechnical} نص تقني`);
      if (skipTranslated > 0) reasons.push(`${skipTranslated} مترجم بالفعل`);
      if (skipCategory > 0) reasons.push(`${skipCategory} خارج الفئة`);
      setTranslateProgress(`✅ لا توجد نصوص تحتاج ترجمة${reasons.length > 0 ? ` (${reasons.join('، ')})` : ''}`);
      setTimeout(() => setTranslateProgress(""), 5000);
      return;
    }

    // Translation Memory — exact-match reuse (gated by user setting)
    const tmReused: Record<string, string> = {};
    const afterTM: typeof untranslated = [];
    if (tmAutoReuse) {
      const tmMap = new Map<string, string>();
      for (const [key, val] of Object.entries(state.translations)) {
        if (val.trim()) {
          const entry = state.entries.find(e => `${e.msbtFile}:${e.index}` === key);
          if (entry) {
            const norm = entry.original.trim().toLowerCase();
            if (!tmMap.has(norm)) tmMap.set(norm, val);
          }
        }
      }
      for (const e of untranslated) {
        const norm = e.original.trim().toLowerCase();
        const cached = tmMap.get(norm);
        if (cached) { tmReused[`${e.msbtFile}:${e.index}`] = cached; }
        else { afterTM.push(e); }
      }
    } else {
      // TM disabled — send everything to AI/glossary path
      afterTM.push(...untranslated);
    }

    // Glossary direct translation (free, no AI)
    const glossaryMap = parseGlossaryMap(activeGlossary);
    const glossaryReused: Record<string, string> = {};
    const needsAI: typeof untranslated = [];
    for (const e of afterTM) {
      const norm = e.original.trim().toLowerCase();
      const glossaryHit = glossaryMap.get(norm);
      if (glossaryHit) { glossaryReused[`${e.msbtFile}:${e.index}`] = glossaryHit; }
      else { needsAI.push(e); }
    }

    const freeTranslations = { ...tmReused, ...glossaryReused };
    if (Object.keys(freeTranslations).length > 0) {
      const safeFreeTranslations = autoFixTags(freeTranslations);
      setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...safeFreeTranslations } } : null);
    }
    const tmCount = Object.keys(tmReused).length;
    const glossaryCount = Object.keys(glossaryReused).length;
    setTmStats({ reused: tmCount + glossaryCount, sent: needsAI.length });
    if (needsAI.length === 0) {
      const parts: string[] = [];
      if (tmCount > 0) parts.push(`${tmCount} من الذاكرة`);
      if (glossaryCount > 0) parts.push(`${glossaryCount} من القاموس 📖`);
      setTranslateProgress(`✅ تم ترجمة ${tmCount + glossaryCount} نص مجاناً (${parts.join(' + ')}) — لا حاجة للذكاء الاصطناعي!`);
      setTimeout(() => setTranslateProgress(""), 5000);
      return;
    }

    setTranslating(true);
    const totalBatches = Math.ceil(needsAI.length / AI_BATCH_SIZE);
    let allTranslations: Record<string, string> = {};
    const totalGlossaryStats = { directMatches: 0, lockedTerms: 0, contextTerms: 0 };
    const freeCount = Object.keys(freeTranslations).length;
    setGlossarySessionStats({ directMatches: 0, lockedTerms: 0, contextTerms: 0, batchesCompleted: 0, totalBatches, textsTranslated: 0, freeTranslations: freeCount });
    abortControllerRef.current = new AbortController();

    // Helper: sleep that aborts if the signal fires (used for transient-error backoff)
    const sleepWithAbort = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      const t = setTimeout(resolve, ms);
      const onAbort = () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); };
      signal.addEventListener('abort', onAbort, { once: true });
    });

    // Helper: fetch a batch with auto-split retry on 500 errors
    // retriesLeft: budget for transient-error retries (429 / network), separate from auto-split depth
    const fetchBatchWithRetry = async (
      batchEntries: { key: string; original: string }[],
      signal: AbortSignal,
      depth = 0,
      retriesLeft = 2,
    ): Promise<{ translations: Record<string, string>; charsUsed?: number; glossaryStats?: { directMatches?: number; lockedTerms?: number; contextTerms?: number } }> => {
      try {
        const response = await fetch(getEdgeFunctionUrl("translate-entries"), {
          method: 'POST',
          headers: getSupabaseHeaders(),
          signal,
          body: JSON.stringify({ entries: batchEntries, glossary: activeGlossary, userApiKey: translationProvider === 'gemini' ? (userGeminiKey || undefined) : undefined, providerApiKey: (translationProvider === 'deepseek' ? userDeepSeekKey : translationProvider === 'groq' ? userGroqKey : translationProvider === 'openrouter' ? userOpenRouterKey : undefined) || undefined, provider: translationProvider, myMemoryEmail: myMemoryEmail || undefined, rebalanceNewlines: rebalanceNewlines || undefined, npcMaxLines, npcMode: npcMode || undefined, aiModel }),
        });
        if (response.status === 429) {
          // Rate-limited: wait then retry once. After that, surface the error (no split — wastes quota)
          if (retriesLeft > 0) {
            console.warn(`[rate-limit] 429 received — waiting 8s before retry (left: ${retriesLeft})`);
            setTranslateProgress(`⏳ تجاوزت حد الطلبات — انتظار 8 ثوانٍ قبل إعادة المحاولة...`);
            await sleepWithAbort(8000, signal);
            return fetchBatchWithRetry(batchEntries, signal, depth, retriesLeft - 1);
          }
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'تجاوزت حد الطلبات');
        }
        if (response.status === 401) {
          // Auth: never retry
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'مفتاح API غير صالح');
        }
        if (response.status >= 500 && batchEntries.length > 1 && depth < 3) {
          // Auto-split: divide batch in half and retry each sub-batch
          console.warn(`[auto-split] Batch of ${batchEntries.length} failed (${response.status}), splitting into halves (depth ${depth + 1})`);
          const mid = Math.ceil(batchEntries.length / 2);
          const [r1, r2] = await Promise.all([
            fetchBatchWithRetry(batchEntries.slice(0, mid), signal, depth + 1),
            fetchBatchWithRetry(batchEntries.slice(mid), signal, depth + 1),
          ]);
          return {
            translations: { ...r1.translations, ...r2.translations },
            charsUsed: (r1.charsUsed || 0) + (r2.charsUsed || 0),
            glossaryStats: {
              directMatches: (r1.glossaryStats?.directMatches || 0) + (r2.glossaryStats?.directMatches || 0),
              lockedTerms: (r1.glossaryStats?.lockedTerms || 0) + (r2.glossaryStats?.lockedTerms || 0),
              contextTerms: (r1.glossaryStats?.contextTerms || 0) + (r2.glossaryStats?.contextTerms || 0),
            },
          };
        }
        if (!response.ok) { const errData = await response.json().catch(() => null); throw new Error(errData?.error || `خطأ ${response.status}`); }
        return await response.json();
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        // Network-level errors (TypeError) are usually transient — wait + retry before splitting
        const isNetworkError = err instanceof TypeError;
        if (isNetworkError && retriesLeft > 0) {
          const waitMs = retriesLeft === 2 ? 1000 : 3000;
          console.warn(`[network] Transient fetch error — waiting ${waitMs}ms before retry (left: ${retriesLeft}):`, (err as Error).message);
          setTranslateProgress(`⏳ خطأ شبكة — إعادة محاولة بعد ${Math.round(waitMs / 1000)} ثانية...`);
          await sleepWithAbort(waitMs, signal);
          return fetchBatchWithRetry(batchEntries, signal, depth, retriesLeft - 1);
        }
        // Single-entry batch can't be split further
        if (batchEntries.length <= 1 || depth >= 3) throw err;
        // Try splitting on any other error
        console.warn(`[auto-split] Batch error, splitting (depth ${depth + 1}):`, (err as Error).message);
        const mid = Math.ceil(batchEntries.length / 2);
        const [r1, r2] = await Promise.all([
          fetchBatchWithRetry(batchEntries.slice(0, mid), signal, depth + 1),
          fetchBatchWithRetry(batchEntries.slice(mid), signal, depth + 1),
        ]);
        return {
          translations: { ...r1.translations, ...r2.translations },
          charsUsed: (r1.charsUsed || 0) + (r2.charsUsed || 0),
          glossaryStats: {
            directMatches: (r1.glossaryStats?.directMatches || 0) + (r2.glossaryStats?.directMatches || 0),
            lockedTerms: (r1.glossaryStats?.lockedTerms || 0) + (r2.glossaryStats?.lockedTerms || 0),
            contextTerms: (r1.glossaryStats?.contextTerms || 0) + (r2.glossaryStats?.contextTerms || 0),
          },
        };
      }
    };

    // Resolve per-provider batch delay (throttle). Skipped when user disables it.
    const providerKey = (translationProvider in PROVIDER_BATCH_DELAY_MS)
      ? translationProvider as keyof typeof PROVIDER_BATCH_DELAY_MS
      : null;
    const hasPersonalKey =
      (translationProvider === 'gemini'     && !!userGeminiKey)     ||
      (translationProvider === 'openrouter' && !!userOpenRouterKey) ||
      (translationProvider === 'groq'       && !!userGroqKey)       ||
      (translationProvider === 'deepseek'   && !!userDeepSeekKey);
    const batchDelayMs = aiThrottleEnabled && providerKey
      ? PROVIDER_BATCH_DELAY_MS[providerKey][hasPersonalKey ? 'paid' : 'free']
      : 0;
    let lastBatchEndAt = 0;

    try {
      for (let b = 0; b < totalBatches; b++) {
        if (abortControllerRef.current.signal.aborted) {
          setTranslateProgress("⏹️ تم إيقاف الترجمة");
          setTimeout(() => setTranslateProgress(""), 3000);
          break;
        }
        // Proactive throttle: keep at least batchDelayMs between successive
        // requests so we don't trip provider RPM limits mid-run.
        if (batchDelayMs > 0 && lastBatchEndAt > 0) {
          const elapsed = Date.now() - lastBatchEndAt;
          const wait = batchDelayMs - elapsed;
          if (wait > 0) {
            setTranslateProgress(`⏳ تنظيم سرعة الإرسال — انتظار ${(wait / 1000).toFixed(1)} ثانية...`);
            try { await sleepWithAbort(wait, abortControllerRef.current.signal); }
            catch { break; } // aborted during throttle wait
          }
        }
        const batch = needsAI.slice(b * AI_BATCH_SIZE, (b + 1) * AI_BATCH_SIZE);
        setTranslateProgress(`🔄 ترجمة الدفعة ${b + 1}/${totalBatches} (${batch.length} نص)...`);

        const entries = batch.map(e => ({
          key: `${e.msbtFile}:${e.index}`,
          original: e.original,
        }));
        
        const data = await fetchBatchWithRetry(entries, abortControllerRef.current.signal);
        lastBatchEndAt = Date.now();
        addAiRequest(1);
        if (data.charsUsed) addMyMemoryChars(data.charsUsed);
        // Accumulate glossary stats
        if (data.glossaryStats) {
          totalGlossaryStats.directMatches += data.glossaryStats.directMatches || 0;
          totalGlossaryStats.lockedTerms += data.glossaryStats.lockedTerms || 0;
          totalGlossaryStats.contextTerms += data.glossaryStats.contextTerms || 0;
        }
        // Update live session stats
        const batchTranslated = data.translations ? Object.keys(data.translations).length : 0;
        setGlossarySessionStats(prev => ({
          ...prev,
          directMatches: totalGlossaryStats.directMatches,
          lockedTerms: totalGlossaryStats.lockedTerms,
          contextTerms: totalGlossaryStats.contextTerms,
          batchesCompleted: b + 1,
          textsTranslated: prev.textsTranslated + batchTranslated,
        }));
        if (data.translations) {
          const fixedTranslations = autoFixTags(data.translations);
          // Drop silently-failed entries (model echoed English) — they fall
          // through to the failed list and the user can retry them in bulk.
          const accepted: Record<string, string> = {};
          for (const [k, v] of Object.entries(fixedTranslations)) {
            const ent = needsAI.find(e => `${e.msbtFile}:${e.index}` === k);
            if (ent && looksUntranslated(ent.original, v)) continue;
            accepted[k] = v;
          }
          allTranslations = { ...allTranslations, ...accepted };
          setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...accepted } } : null);
        }
      }
      if (!abortControllerRef.current?.signal.aborted) {
        const total = Object.keys(allTranslations).length;
        // Compute entries that got no translation back (failed silently)
        const failed = needsAI.filter(e => !allTranslations[`${e.msbtFile}:${e.index}`]);
        setFailedEntries(failed);
        const glossaryParts: string[] = [];
        if (totalGlossaryStats.directMatches > 0) glossaryParts.push(`📖 ${totalGlossaryStats.directMatches} مطابقة مباشرة`);
        if (totalGlossaryStats.lockedTerms > 0) glossaryParts.push(`🔒 ${totalGlossaryStats.lockedTerms} مصطلح مُقفَل`);
        if (totalGlossaryStats.contextTerms > 0) glossaryParts.push(`📋 ${totalGlossaryStats.contextTerms} مصطلح سياقي`);
        const glossaryInfo = glossaryParts.length > 0 ? ` | القاموس: ${glossaryParts.join(' + ')}` : '';
        const failedInfo = failed.length > 0 ? ` | ⚠️ ${failed.length} نص فشل (انقر تكرار)` : '';
        setTranslateProgress(`✅ تم ترجمة ${total} نص بنجاح${tmCount > 0 ? ` + ${tmCount} من الذاكرة` : ''}${glossaryInfo}${failedInfo}`);
        setTimeout(() => setTranslateProgress(""), 8000);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setTranslateProgress("⏹️ تم إيقاف الترجمة يدوياً");
        setTimeout(() => setTranslateProgress(""), 4000);
      } else {
        const savedCount = Object.keys(allTranslations).length;
        const errMsg = err instanceof Error ? err.message : 'خطأ في الترجمة';
        setTranslateProgress(`❌ ${errMsg}${savedCount > 0 ? ` (تم حفظ ${savedCount} نص قبل الخطأ)` : ''}`);
        setTimeout(() => setTranslateProgress(""), 5000);
      }
    } finally {
      setTranslating(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopTranslate = () => { if (abortControllerRef.current) abortControllerRef.current.abort(); };

  const handleRetranslatePage = async () => {
    if (!state) return;
    const entriesToRetranslate = paginatedEntries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      return state.translations[key]?.trim() && !isTechnicalText(e.original);
    });
    if (entriesToRetranslate.length === 0) {
      setTranslateProgress("⚠️ لا توجد ترجمات في هذه الصفحة لإعادة ترجمتها");
      setTimeout(() => setTranslateProgress(""), 3000);
      return;
    }
    const prevTrans: Record<string, string> = {};
    for (const e of entriesToRetranslate) {
      const key = `${e.msbtFile}:${e.index}`;
      prevTrans[key] = state.translations[key] || '';
    }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));
    setTranslating(true);
    abortControllerRef.current = new AbortController();
    try {
      const totalBatches = Math.ceil(entriesToRetranslate.length / AI_BATCH_SIZE);
      for (let b = 0; b < totalBatches; b++) {
        if (abortControllerRef.current.signal.aborted) {
          setTranslateProgress("⏹️ تم إيقاف إعادة الترجمة");
          setTimeout(() => setTranslateProgress(""), 3000);
          break;
        }
        const batch = entriesToRetranslate.slice(b * AI_BATCH_SIZE, (b + 1) * AI_BATCH_SIZE);
        setTranslateProgress(`🔄 إعادة ترجمة الدفعة ${b + 1}/${totalBatches} (${batch.length} نص)...`);
        const entries = batch.map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original }));
        const response = await fetch(getEdgeFunctionUrl("translate-entries"), {
          method: 'POST',
          headers: getSupabaseHeaders(),
          signal: abortControllerRef.current.signal,
           body: JSON.stringify({ entries, glossary: activeGlossary, userApiKey: translationProvider === 'gemini' ? (userGeminiKey || undefined) : undefined, providerApiKey: (translationProvider === 'deepseek' ? userDeepSeekKey : translationProvider === 'groq' ? userGroqKey : translationProvider === 'openrouter' ? userOpenRouterKey : undefined) || undefined, provider: translationProvider, myMemoryEmail: myMemoryEmail || undefined, rebalanceNewlines: rebalanceNewlines || undefined, npcMaxLines, npcMode: npcMode || undefined, aiModel }),
        });
        if (!response.ok) { const errData = await response.json().catch(() => null); throw new Error(errData?.error || `خطأ ${response.status}`); }
        const data = await response.json();
        addAiRequest(1);
        if (data.charsUsed) addMyMemoryChars(data.charsUsed);
        if (data.translations) {
          const fixedTranslations = autoFixTags(data.translations);
          // Drop silently-failed entries so the user notices and can retry.
          const accepted: Record<string, string> = {};
          for (const [k, v] of Object.entries(fixedTranslations)) {
            const ent = entriesToRetranslate.find(e => `${e.msbtFile}:${e.index}` === k);
            if (ent && looksUntranslated(ent.original, v)) continue;
            accepted[k] = v;
          }
          setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...accepted } } : null);
        }
      }
      setTranslateProgress(`✅ تم إعادة ترجمة ${entriesToRetranslate.length} نص في هذه الصفحة`);
      setTimeout(() => setTranslateProgress(""), 4000);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setTranslateProgress(`❌ خطأ: ${err instanceof Error ? err.message : 'غير معروف'}`);
        setTimeout(() => setTranslateProgress(""), 4000);
      }
    } finally { setTranslating(false); }
  };

  const handleFixDamagedTags = async (damagedTagKeys: Set<string>) => {
    if (!state || damagedTagKeys.size === 0) return;
    const entriesToFix = state.entries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      return damagedTagKeys.has(key);
    });
    if (entriesToFix.length === 0) return;

    // Save previous translations for undo
    const prevTrans: Record<string, string> = {};
    for (const e of entriesToFix) {
      const key = `${e.msbtFile}:${e.index}`;
      prevTrans[key] = state.translations[key] || '';
    }
    setPreviousTranslations(old => ({ ...old, ...prevTrans }));

    setTranslating(true);
    abortControllerRef.current = new AbortController();
    let fixedCount = 0;
    try {
      const totalBatches = Math.ceil(entriesToFix.length / AI_BATCH_SIZE);
      for (let b = 0; b < totalBatches; b++) {
        if (abortControllerRef.current.signal.aborted) break;
        const batch = entriesToFix.slice(b * AI_BATCH_SIZE, (b + 1) * AI_BATCH_SIZE);
        setTranslateProgress(`🔧 إصلاح الرموز التالفة ${b + 1}/${totalBatches} (${batch.length} نص)...`);
        const entries = batch.map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original }));
        const response = await fetch(getEdgeFunctionUrl("translate-entries"), {
          method: 'POST',
          headers: getSupabaseHeaders(),
          signal: abortControllerRef.current.signal,
           body: JSON.stringify({ entries, glossary: activeGlossary, userApiKey: translationProvider === 'gemini' ? (userGeminiKey || undefined) : undefined, providerApiKey: (translationProvider === 'deepseek' ? userDeepSeekKey : translationProvider === 'groq' ? userGroqKey : translationProvider === 'openrouter' ? userOpenRouterKey : undefined) || undefined, provider: translationProvider, myMemoryEmail: myMemoryEmail || undefined, rebalanceNewlines: rebalanceNewlines || undefined, npcMaxLines, npcMode: npcMode || undefined, aiModel }),
        });
        if (!response.ok) { const errData = await response.json().catch(() => null); throw new Error(errData?.error || `خطأ ${response.status}`); }
        const data = await response.json();
        addAiRequest(1);
        if (data.charsUsed) addMyMemoryChars(data.charsUsed);
        if (data.translations) {
          const fixedTranslations = autoFixTags(data.translations);
          fixedCount += Object.keys(fixedTranslations).length;
          setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...fixedTranslations } } : null);
        }
      }
      setTranslateProgress(`✅ تم إصلاح ${fixedCount} نص تالف بنجاح`);
      toast({ title: "✅ تم الإصلاح", description: `تم إصلاح ${fixedCount} نص تالف وإعادة ترجمته بنجاح` });
      setTimeout(() => setTranslateProgress(""), 5000);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : 'غير معروف';
        setTranslateProgress(`❌ خطأ: ${msg}`);
        toast({ title: "❌ فشل الإصلاح", description: msg, variant: "destructive" });
        setTimeout(() => setTranslateProgress(""), 4000);
      }
    } finally { setTranslating(false); }
  };

  const handleTranslatePage = async (forceRetranslate = false, memoryOnly = false) => {
    if (!state) return;
    const arabicRegex = /[\u0600-\u06FF]/;
    let skipEmpty = 0, skipArabic = 0, skipTechnical = 0, skipTranslated = 0;
    const candidates = paginatedEntries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      if (!e.original.trim()) { skipEmpty++; return false; }
      if (arabicRegex.test(e.original)) { skipArabic++; return false; }
      if (isTechnicalText(e.original) && !state.technicalBypass?.has(key)) { skipTechnical++; return false; }
      if (!forceRetranslate && state.translations[key]?.trim()) { skipTranslated++; return false; }
      return true;
    });

    // If no untranslated entries and there are translated ones, ask user to re-translate
    if (candidates.length === 0 && skipTranslated > 0 && !forceRetranslate) {
      const confirmed = window.confirm(
        `✅ الصفحة مترجمة بالكامل (${skipTranslated} نص مترجم).\n\nهل تريد إعادة ترجمتها؟`
      );
      if (confirmed) {
        return handleTranslatePage(true, memoryOnly);
      }
      return;
    }

    if (candidates.length === 0) {
      const reasons: string[] = [];
      if (skipArabic > 0) reasons.push(`${skipArabic} نص عربي أصلاً`);
      if (skipTechnical > 0) reasons.push(`${skipTechnical} نص تقني`);
      setTranslateProgress(`✅ لا توجد نصوص تحتاج ترجمة في هذه الصفحة${reasons.length > 0 ? ` (${reasons.join('، ')})` : ''}`);
      setTimeout(() => setTranslateProgress(""), 5000);
      return;
    }

    // Save previous translations for comparison
    const oldTrans: Record<string, string> = {};
    const originalsMap: Record<string, string> = {};
    for (const e of candidates) {
      const key = `${e.msbtFile}:${e.index}`;
      oldTrans[key] = state.translations[key] || '';
      originalsMap[key] = e.original;
    }

    if (memoryOnly) {
      // Memory-only mode: use TM + Glossary, skip AI entirely
      const tmMap = new Map<string, string>();
      for (const [key, val] of Object.entries(state.translations)) {
        if (val.trim()) {
          const entry = state.entries.find(e => `${e.msbtFile}:${e.index}` === key);
          if (entry) {
            const norm = entry.original.trim().toLowerCase();
            if (!tmMap.has(norm)) tmMap.set(norm, val);
          }
        }
      }
      const tmReused: Record<string, string> = {};
      const afterTM: typeof candidates = [];
      for (const e of candidates) {
        const norm = e.original.trim().toLowerCase();
        const cached = tmMap.get(norm);
        if (cached) { tmReused[`${e.msbtFile}:${e.index}`] = cached; }
        else { afterTM.push(e); }
      }

      const glossaryMap = parseGlossaryMap(activeGlossary);
      const glossaryReused: Record<string, string> = {};
      const remaining: typeof candidates = [];
      for (const e of afterTM) {
        const norm = e.original.trim().toLowerCase();
        const glossaryHit = glossaryMap.get(norm);
        if (glossaryHit) { glossaryReused[`${e.msbtFile}:${e.index}`] = glossaryHit; }
        else { remaining.push(e); }
      }

      const freeTranslations = { ...tmReused, ...glossaryReused };
      const totalFree = Object.keys(freeTranslations).length;
      if (totalFree > 0) {
        // Show compare dialog for memory-only too
        setOldPageTranslations(oldTrans);
        setPageTranslationOriginals(originalsMap);
        const safeFreeTranslations = autoFixTags(freeTranslations);
        setPendingPageTranslations(safeFreeTranslations);
        setShowPageCompare(true);
      }
      const tmCount = Object.keys(tmReused).length;
      const glossaryCount = Object.keys(glossaryReused).length;
      setTmStats({ reused: tmCount + glossaryCount, sent: 0 });
      const parts: string[] = [];
      if (tmCount > 0) parts.push(`${tmCount} من الذاكرة`);
      if (glossaryCount > 0) parts.push(`${glossaryCount} من القاموس 📖`);
      if (remaining.length > 0) {
        setTranslateProgress(`✅ تم ترجمة ${totalFree} نص مجاناً (${parts.join(' + ')}) — تم تخطي ${remaining.length} نص (بدون ذكاء اصطناعي)`);
      } else {
        setTranslateProgress(`✅ تم ترجمة ${totalFree} نص مجاناً (${parts.join(' + ')}) — لا حاجة للذكاء الاصطناعي!`);
      }
      setTimeout(() => setTranslateProgress(""), 5000);
      return;
    }

    // AI mode: translate in batches of 10
    const PAGE_AI_BATCH = 10;
    const needsAI = candidates;
    setTmStats({ reused: 0, sent: needsAI.length });
    if (needsAI.length === 0) {
      setTranslateProgress(`✅ لا توجد نصوص تحتاج ترجمة`);
      setTimeout(() => setTranslateProgress(""), 5000);
      return;
    }

    setTranslating(true);
    const allTranslations: Record<string, string> = {};
    abortControllerRef.current = new AbortController();

    try {
      const totalBatches = Math.ceil(needsAI.length / PAGE_AI_BATCH);
      for (let b = 0; b < totalBatches; b++) {
        if (abortControllerRef.current.signal.aborted) {
          setTranslateProgress("⏹️ تم إيقاف الترجمة");
          setTimeout(() => setTranslateProgress(""), 3000);
          break;
        }
        const batch = needsAI.slice(b * PAGE_AI_BATCH, (b + 1) * PAGE_AI_BATCH);
        setTranslateProgress(`🔄 ترجمة الدفعة ${b + 1}/${totalBatches} (${batch.length} نص)...`);

        const entries = batch.map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original }));
        const response = await fetch(getEdgeFunctionUrl("translate-entries"), {
          method: 'POST',
          headers: getSupabaseHeaders(),
          signal: abortControllerRef.current.signal,
          body: JSON.stringify({
            entries,
            glossary: activeGlossary,
            userApiKey: translationProvider === 'gemini' ? (userGeminiKey || undefined) : undefined,
            providerApiKey: (translationProvider === 'deepseek' ? userDeepSeekKey : translationProvider === 'groq' ? userGroqKey : translationProvider === 'openrouter' ? userOpenRouterKey : undefined) || undefined,
            provider: translationProvider,
            myMemoryEmail: myMemoryEmail || undefined,
            npcMaxLines,
            aiModel,
          }),
        });
        if (!response.ok) { const errData = await response.json().catch(() => null); throw new Error(errData?.error || `خطأ ${response.status}`); }
        const data = await response.json();
        addAiRequest(1);
        if (data.charsUsed) addMyMemoryChars(data.charsUsed);
        if (data.translations) {
          for (const entry of batch) {
            const key = `${entry.msbtFile}:${entry.index}`;
            if (data.translations[key]) {
              let translated = data.translations[key];
              if (hasTechnicalTags(entry.original)) {
                translated = restoreTagsLocally(entry.original, translated);
                translated = autoFixTagBrackets(entry.original, translated);
              }
              translated = autoSyncLines(key, translated, entry);
              allTranslations[key] = translated;
            }
          }
        }
      }

      // Show compare dialog instead of applying immediately
      if (Object.keys(allTranslations).length > 0) {
        setOldPageTranslations(oldTrans);
        setPageTranslationOriginals(originalsMap);
        setPendingPageTranslations(allTranslations);
        setShowPageCompare(true);
        setTranslateProgress(`✅ تم ترجمة ${Object.keys(allTranslations).length} نص — راجع النتائج`);
        setTimeout(() => setTranslateProgress(""), 5000);
      } else if (!abortControllerRef.current?.signal.aborted) {
        setTranslateProgress(`⚠️ لم يتم ترجمة أي نص`);
        setTimeout(() => setTranslateProgress(""), 5000);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Show what we have so far
        if (Object.keys(allTranslations).length > 0) {
          setOldPageTranslations(oldTrans);
          setPageTranslationOriginals(originalsMap);
          setPendingPageTranslations(allTranslations);
          setShowPageCompare(true);
          setTranslateProgress(`⏹️ تم إيقاف الترجمة — ${Object.keys(allTranslations).length} نص جاهز للمراجعة`);
        } else {
          setTranslateProgress("⏹️ تم إيقاف الترجمة يدوياً");
        }
        setTimeout(() => setTranslateProgress(""), 4000);
      } else {
        // Show what we have so far even on error
        if (Object.keys(allTranslations).length > 0) {
          setOldPageTranslations(oldTrans);
          setPageTranslationOriginals(originalsMap);
          setPendingPageTranslations(allTranslations);
          setShowPageCompare(true);
        }
        const errMsg = err instanceof Error ? err.message : 'خطأ في الترجمة';
        setTranslateProgress(`❌ ${errMsg}${Object.keys(allTranslations).length > 0 ? ` (${Object.keys(allTranslations).length} نص جاهز للمراجعة)` : ''}`);
        setTimeout(() => setTranslateProgress(""), 5000);
      }
    } finally {
      setTranslating(false);
      abortControllerRef.current = null;
    }
  };

  const handleTranslateAllPages = async (memoryOnly = false, forceRetranslate = false) => {
    if (!state) return;
    const arabicRegex = /[\u0600-\u06FF]/;
    const allPages = totalPages;

    // Collect ALL translatable candidates across all pages (including already-translated if forced)
    let totalCandidates = 0;
    let totalSkippedTranslated = 0;
    for (let p = 0; p < allPages; p++) {
      const pageEntries = filteredEntries.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
      for (const e of pageEntries) {
        const key = `${e.msbtFile}:${e.index}`;
        if (!e.original.trim()) continue;
        if (arabicRegex.test(e.original)) continue;
        if (isTechnicalText(e.original) && !state.technicalBypass?.has(key)) continue;
        if (!forceRetranslate && state.translations[key]?.trim()) { totalSkippedTranslated++; continue; }
        totalCandidates++;
      }
    }

    // If no candidates but there are translated ones, ask user to re-translate
    if (totalCandidates === 0 && totalSkippedTranslated > 0 && !forceRetranslate) {
      const confirmed = window.confirm(
        `✅ جميع الصفحات مترجمة بالكامل (${totalSkippedTranslated} نص مترجم).\n\nهل تريد إعادة ترجمتها؟`
      );
      if (confirmed) {
        return handleTranslateAllPages(memoryOnly, true);
      }
      return;
    }

    if (totalCandidates === 0) {
      setTranslateProgress("✅ لا توجد نصوص تحتاج ترجمة!");
      setTimeout(() => setTranslateProgress(""), 5000);
      return;
    }

    // Save previous translations for comparison
    const oldTrans: Record<string, string> = {};
    const originalsMap: Record<string, string> = {};
    for (let p = 0; p < allPages; p++) {
      const pageEntries = filteredEntries.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
      for (const e of pageEntries) {
        const key = `${e.msbtFile}:${e.index}`;
        if (!e.original.trim()) continue;
        if (arabicRegex.test(e.original)) continue;
        if (isTechnicalText(e.original) && !state.technicalBypass?.has(key)) continue;
        if (!forceRetranslate && state.translations[key]?.trim()) continue;
        oldTrans[key] = state.translations[key] || '';
        originalsMap[key] = e.original;
      }
    }

    setTranslating(true);
    abortControllerRef.current = new AbortController();
    const allTranslations: Record<string, string> = {};
    let pagesCompleted = 0;

    try {
      for (let p = 0; p < allPages; p++) {
        if (abortControllerRef.current.signal.aborted) break;

        const pageEntries = filteredEntries.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
        const candidates = pageEntries.filter(e => {
          const key = `${e.msbtFile}:${e.index}`;
          if (!e.original.trim()) return false;
          if (arabicRegex.test(e.original)) return false;
          if (isTechnicalText(e.original) && !state.technicalBypass?.has(key)) return false;
          if (!forceRetranslate && state.translations[key]?.trim()) return false;
          return true;
        });

        if (candidates.length === 0) {
          pagesCompleted++;
          continue;
        }

        // Navigate to this page visually
        setCurrentPage(() => p);
        setTranslateProgress(`📄 صفحة ${p + 1}/${allPages} — ترجمة ${candidates.length} نص...`);

        if (memoryOnly) {
          // Memory-only: TM + Glossary
          const tmMap = new Map<string, string>();
          for (const [key, val] of Object.entries(state.translations)) {
            if (val.trim()) {
              const entry = state.entries.find(e => `${e.msbtFile}:${e.index}` === key);
              if (entry) {
                const norm = entry.original.trim().toLowerCase();
                if (!tmMap.has(norm)) tmMap.set(norm, val);
              }
            }
          }
          const glossaryMap = parseGlossaryMap(activeGlossary);
          for (const e of candidates) {
            const norm = e.original.trim().toLowerCase();
            const key = `${e.msbtFile}:${e.index}`;
            const cached = tmMap.get(norm);
            if (cached) { allTranslations[key] = cached; continue; }
            const glossaryHit = glossaryMap.get(norm);
            if (glossaryHit) { allTranslations[key] = glossaryHit; }
          }
        } else {
          // AI mode: translate in batches of 10
          const ALL_PAGES_BATCH = 10;
          const totalBatches = Math.ceil(candidates.length / ALL_PAGES_BATCH);
          for (let b = 0; b < totalBatches; b++) {
            if (abortControllerRef.current.signal.aborted) break;
            const batch = candidates.slice(b * ALL_PAGES_BATCH, (b + 1) * ALL_PAGES_BATCH);
            setTranslateProgress(`📄 صفحة ${p + 1}/${allPages} — دفعة ${b + 1}/${totalBatches} (${batch.length} نص)...`);

            const entries = batch.map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original }));
            const response = await fetch(getEdgeFunctionUrl("translate-entries"), {
              method: 'POST',
              headers: getSupabaseHeaders(),
              signal: abortControllerRef.current.signal,
              body: JSON.stringify({
                entries,
                glossary: activeGlossary,
                userApiKey: translationProvider === 'gemini' ? (userGeminiKey || undefined) : undefined,
                providerApiKey: (translationProvider === 'deepseek' ? userDeepSeekKey : translationProvider === 'groq' ? userGroqKey : translationProvider === 'openrouter' ? userOpenRouterKey : undefined) || undefined,
                provider: translationProvider,
                myMemoryEmail: myMemoryEmail || undefined,
                npcMaxLines,
                aiModel,
              }),
            });
            if (!response.ok) { const errData = await response.json().catch(() => null); throw new Error(errData?.error || `خطأ ${response.status}`); }
            const data = await response.json();
            addAiRequest(1);
            if (data.charsUsed) addMyMemoryChars(data.charsUsed);
            if (data.translations) {
              for (const entry of batch) {
                const key = `${entry.msbtFile}:${entry.index}`;
                if (data.translations[key]) {
                  let translated = data.translations[key];
                  if (hasTechnicalTags(entry.original)) {
                    translated = restoreTagsLocally(entry.original, translated);
                    translated = autoFixTagBrackets(entry.original, translated);
                  }
                  allTranslations[key] = translated;
                }
              }
            }
          }
        }
        pagesCompleted++;
      }

      // Show compare dialog with all results
      if (Object.keys(allTranslations).length > 0) {
        const safeTranslations = autoFixTags(allTranslations);
        setOldPageTranslations(oldTrans);
        setPageTranslationOriginals(originalsMap);
        setPendingPageTranslations(safeTranslations);
        setShowPageCompare(true);
        setTranslateProgress(`✅ تم ترجمة ${Object.keys(safeTranslations).length} نص في ${pagesCompleted} صفحة — راجع النتائج`);
        setTimeout(() => setTranslateProgress(""), 8000);
      } else if (!abortControllerRef.current?.signal.aborted) {
        setTranslateProgress(`⚠️ لم يتم ترجمة أي نص`);
        setTimeout(() => setTranslateProgress(""), 5000);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        if (Object.keys(allTranslations).length > 0) {
          const safeTranslations = autoFixTags(allTranslations);
          setOldPageTranslations(oldTrans);
          setPageTranslationOriginals(originalsMap);
          setPendingPageTranslations(safeTranslations);
          setShowPageCompare(true);
          setTranslateProgress(`⏹️ تم إيقاف الترجمة — ${Object.keys(allTranslations).length} نص جاهز للمراجعة`);
        } else {
          setTranslateProgress("⏹️ تم إيقاف الترجمة يدوياً");
        }
        setTimeout(() => setTranslateProgress(""), 4000);
      } else {
        if (Object.keys(allTranslations).length > 0) {
          const safeTranslations = autoFixTags(allTranslations);
          setOldPageTranslations(oldTrans);
          setPageTranslationOriginals(originalsMap);
          setPendingPageTranslations(safeTranslations);
          setShowPageCompare(true);
        }
        const errMsg = err instanceof Error ? err.message : 'خطأ في الترجمة';
        setTranslateProgress(`❌ ${errMsg}${Object.keys(allTranslations).length > 0 ? ` (${Object.keys(allTranslations).length} نص جاهز للمراجعة)` : ''}`);
        setTimeout(() => setTranslateProgress(""), 5000);
      }
    } finally {
      setTranslating(false);
      abortControllerRef.current = null;
    }
  };

  /** Build a word-boundary-aware regex for a glossary term */
  const buildGlossaryTermRegex = (term: string): RegExp => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Use word boundary that works for English terms — handles possessives, punctuation, brackets
    // \b doesn't work well at start/end with special chars, so use lookaround-like approach
    const before = `(?<![a-zA-Z0-9])`;
    const after = `(?![a-zA-Z0-9])`;
    return new RegExp(`${before}${escaped}${after}`, 'gi');
  };

  /** Translate using glossary only — no AI, no TM. Supports both exact and partial matching. */
  const handleTranslateFromGlossaryOnly = () => {
    if (!state) return;
    const glossaryMap = parseGlossaryMap(activeGlossary);
    if (glossaryMap.size === 0) {
      toast({ title: "⚠️ لا يوجد قاموس", description: "يرجى تحميل قاموس أولاً قبل استخدام هذه الميزة", variant: "destructive" });
      return;
    }
    const arabicRegex = /[\u0600-\u06FF]/;
    const glossaryTranslations: Record<string, string> = {};
    const previewEntries: Array<{ key: string; original: string; newTranslation: string; oldTranslation: string; matchType: 'exact' | 'partial' }> = [];
    let skipEmpty = 0, skipArabic = 0, skipTechnical = 0, skipNoMatch = 0;
    let exactMatches = 0, partialMatches = 0;

    // Sort glossary entries by key length (longest first) for greedy partial matching
    const sortedGlossaryEntries = Array.from(glossaryMap.entries())
      .sort((a, b) => b[0].length - a[0].length);

    // Pre-build regexes for partial matching (cached for performance)
    const glossaryRegexes = sortedGlossaryEntries.map(([key, value]) => ({
      key,
      value,
      regex: buildGlossaryTermRegex(key),
    }));

    const targetEntries = filterCategory.length > 0
      ? state.entries.filter(e => filterCategory.includes(categorizeEntry(e)))
      : state.entries;

    for (const e of targetEntries) {
      const key = `${e.msbtFile}:${e.index}`;
      if (!e.original.trim()) { skipEmpty++; continue; }
      if (arabicRegex.test(e.original)) { skipArabic++; continue; }
      if (isTechnicalText(e.original) && !state.technicalBypass?.has(key)) { skipTechnical++; continue; }

      const norm = e.original.trim().toLowerCase();
      const existingTranslation = state.translations[key]?.trim() || '';

      // Try exact match first (only for untranslated entries)
      if (!existingTranslation) {
        const exactHit = glossaryMap.get(norm);
        if (exactHit) {
          glossaryTranslations[key] = exactHit;
          previewEntries.push({ key, original: e.original, newTranslation: exactHit, oldTranslation: existingTranslation, matchType: 'exact' });
          exactMatches++;
          continue;
        }
      }

      // Try partial matching: replace ALL glossary terms found within the text
      // Works on both untranslated (original English) and already-translated entries
      const sourceText = existingTranslation || e.original;
      let result = sourceText;
      let matched = false;
      const usedRanges: Array<[number, number]> = []; // prevent overlapping replacements

      for (const { key: glossaryKey, value: glossaryValue, regex } of glossaryRegexes) {
        // Quick pre-filter: skip if term not present at all (case-insensitive)
        if (!result.toLowerCase().includes(glossaryKey)) continue;
        // Skip if the Arabic translation is already present in the result
        if (result.includes(glossaryValue)) continue;

        // Find ALL occurrences (not just first)
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        const matches: Array<{ start: number; end: number }> = [];
        while ((match = regex.exec(result)) !== null) {
          matches.push({ start: match.index, end: match.index + match[0].length });
        }

        // Process matches in reverse order to preserve indices
        for (let mi = matches.length - 1; mi >= 0; mi--) {
          const { start: matchStart, end: matchEnd } = matches[mi];

          // Check if this range overlaps with any already-replaced range
          const overlaps = usedRanges.some(([s, e]) =>
            (matchStart >= s && matchStart < e) || (matchEnd > s && matchEnd <= e)
          );
          if (overlaps) continue;

          // Replace the matched portion with the Arabic translation
          result = result.slice(0, matchStart) + glossaryValue + result.slice(matchEnd);
          // Track the new range (after replacement, length may differ)
          const newEnd = matchStart + glossaryValue.length;
          usedRanges.push([matchStart, newEnd]);
          matched = true;
        }
      }

      if (matched && result !== sourceText) {
        glossaryTranslations[key] = result;
        previewEntries.push({ key, original: e.original, newTranslation: result, oldTranslation: existingTranslation, matchType: 'partial' });
        partialMatches++;
      } else {
        skipNoMatch++;
      }
    }

    const count = Object.keys(glossaryTranslations).length;
    if (count === 0) {
      const reasons: string[] = [];
      if (skipNoMatch > 0) reasons.push(`${skipNoMatch} بدون تطابق في القاموس`);
      if (skipArabic > 0) reasons.push(`${skipArabic} نص عربي`);
      if (skipTechnical > 0) reasons.push(`${skipTechnical} نص تقني`);
      setTranslateProgress(`⚠️ لم يتم العثور على تطابقات في القاموس${reasons.length > 0 ? ` (${reasons.join('، ')})` : ''}`);
      setTimeout(() => setTranslateProgress(""), 5000);
      return;
    }

    // Show preview instead of applying directly
    setPendingGlossaryTranslations(glossaryTranslations);
    setGlossaryPreviewEntries(previewEntries);
    setShowGlossaryPreview(true);
    const parts: string[] = [];
    if (exactMatches > 0) parts.push(`${exactMatches} تطابق كامل`);
    if (partialMatches > 0) parts.push(`${partialMatches} تطابق جزئي`);
    setTranslateProgress(`📋 تم العثور على ${count} تطابق (${parts.join(' + ')}) — راجع المعاينة للتطبيق`);
    setTimeout(() => setTranslateProgress(""), 6000);
  };

  const applyGlossaryPreview = (selectedKeys: Set<string>) => {
    if (!state) return;
    const toApply: Record<string, string> = {};
    for (const [key, val] of Object.entries(pendingGlossaryTranslations)) {
      if (selectedKeys.has(key)) toApply[key] = val;
    }
    const safeTranslations = autoFixTags(toApply);
    setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...safeTranslations } } : null);
    setShowGlossaryPreview(false);
    setGlossaryPreviewEntries([]);
    setPendingGlossaryTranslations({});
    setTranslateProgress(`✅ تم تطبيق ${Object.keys(toApply).length} ترجمة من القاموس 📖`);
    setTimeout(() => setTranslateProgress(""), 5000);
  };

  const discardGlossaryPreview = () => {
    setShowGlossaryPreview(false);
    setGlossaryPreviewEntries([]);
    setPendingGlossaryTranslations({});
  };

  /** Retry translating entries that failed silently in the last auto-translate run */
  const handleRetryFailed = async () => {
    if (!state || failedEntries.length === 0) return;
    const toRetry = [...failedEntries];
    setFailedEntries([]);
    setTranslating(true);
    abortControllerRef.current = new AbortController();
    let recovered = 0;
    const stillFailed: ExtractedEntry[] = [];
    try {
      // Retry one entry at a time to maximise success rate
      for (let i = 0; i < toRetry.length; i++) {
        if (abortControllerRef.current.signal.aborted) break;
        const entry = toRetry[i];
        const key = `${entry.msbtFile}:${entry.index}`;
        setTranslateProgress(`🔄 إعادة محاولة ${i + 1}/${toRetry.length}: ${entry.label || key}...`);
        try {
          const response = await fetch(getEdgeFunctionUrl("translate-entries"), {
            method: 'POST',
            headers: getSupabaseHeaders(),
            signal: abortControllerRef.current.signal,
            body: JSON.stringify({
              entries: [{ key, original: entry.original }],
              glossary: activeGlossary,
              userApiKey: translationProvider === 'gemini' ? (userGeminiKey || undefined) : undefined,
              providerApiKey: (translationProvider === 'deepseek' ? userDeepSeekKey : translationProvider === 'groq' ? userGroqKey : translationProvider === 'openrouter' ? userOpenRouterKey : undefined) || undefined,
              provider: translationProvider,
              myMemoryEmail: myMemoryEmail || undefined,
              rebalanceNewlines: rebalanceNewlines || undefined,
              npcMaxLines,
              aiModel,
            }),
          });
          if (!response.ok) { stillFailed.push(entry); continue; }
          const data = await response.json();
          addAiRequest(1);
          if (data.charsUsed) addMyMemoryChars(data.charsUsed);
          if (data.translations?.[key]) {
            const fixedTranslations = autoFixTags({ [key]: data.translations[key] });
            recovered++;
            setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...fixedTranslations } } : null);
          } else {
            stillFailed.push(entry);
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') throw err;
          stillFailed.push(entry);
        }
      }
      setFailedEntries(stillFailed);
      setTranslateProgress(recovered > 0
        ? `✅ تم استرداد ${recovered} نص${stillFailed.length > 0 ? ` | ⚠️ ${stillFailed.length} فشل مجدداً` : ''}`
        : `⚠️ لم يتم استرداد أي نص — قد تكون النصوص معقدة جداً`
      );
      setTimeout(() => setTranslateProgress(""), 6000);
    } catch (err) {
      setFailedEntries(stillFailed.length > 0 ? stillFailed : toRetry);
      if ((err as Error).name !== 'AbortError') {
        setTranslateProgress(`❌ فشل إعادة المحاولة: ${err instanceof Error ? err.message : 'خطأ'}`);
        setTimeout(() => setTranslateProgress(""), 4000);
      }
    } finally {
      setTranslating(false);
      abortControllerRef.current = null;
    }
  };

  return {
    translating,
    translatingSingle,
    tmStats,
    glossarySessionStats,
    failedEntries,
    pendingPageTranslations,
    oldPageTranslations,
    pageTranslationOriginals,
    showPageCompare,
    applyPendingTranslations,
    discardPendingTranslations,
    glossaryPreviewEntries,
    showGlossaryPreview,
    applyGlossaryPreview,
    discardGlossaryPreview,
    handleTranslateSingle,
    handleAutoTranslate,
    handleTranslatePage,
    handleTranslateAllPages,
    handleTranslateFromGlossaryOnly,
    handleStopTranslate,
    handleRetranslatePage,
    handleRetryFailed,
    handleFixDamagedTags,
  };
}
