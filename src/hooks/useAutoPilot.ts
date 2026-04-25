import { useState, useRef, useCallback, useMemo } from "react";
import { toast } from "@/hooks/use-toast";
import type { EditorState, ExtractedEntry } from "@/components/editor/types";
import { isTechnicalText } from "@/components/editor/types";
import { getEdgeFunctionUrl, getSupabaseHeaders } from "@/lib/supabase-edge";

export interface AutoPilotLog {
  id: number;
  phase: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'phase';
}

export interface AutoPilotReport {
  totalEntries: number;
  alreadyTranslated: number;
  fromMemory: number;
  fromGlossary: number;
  fromAI: number;
  failed: number;
  tagsFixed: number;
  weakFound: number;
  weakFixed: number;
  duration: number;
  isFreeRun: boolean;
}

export type AutoPilotMode = 'smart' | 'free';

interface UseAutoPilotProps {
  state: EditorState | null;
  setState: React.Dispatch<React.SetStateAction<EditorState | null>>;
  activeGlossary: string;
  parseGlossaryMap: (g: string) => Map<string, string>;
  translationProvider: string;
  userGeminiKey: string;
  userDeepSeekKey: string;
  userGroqKey: string;
  userOpenRouterKey: string;
  myMemoryEmail: string;
  rebalanceNewlines: boolean;
  npcMaxLines: number;
  npcMode?: boolean;
  aiModel: string;
  addAiRequest: (n?: number) => void;
  addMyMemoryChars: (n: number) => void;
  qualityStats: { damagedTagKeys: Set<string> };
  filteredEntries: ExtractedEntry[];
}

const AI_BATCH = 5;

function pickFreeProvider(
  userOpenRouterKey: string,
  userGroqKey: string,
  myMemoryEmail: string,
): { provider: string; model?: string; label: string } {
  if (userOpenRouterKey) return { provider: 'openrouter', model: 'qwen/qwen-2.5-72b-instruct:free', label: 'Qwen 2.5 72B (OpenRouter مجاني)' };
  if (userGroqKey) return { provider: 'groq', label: 'Groq Llama 3.3 (مجاني)' };
  return { provider: 'google', label: 'Google Translate (مجاني تماماً)' };
}

export function useAutoPilot({
  state, setState, activeGlossary, parseGlossaryMap,
  translationProvider, userGeminiKey, userDeepSeekKey, userGroqKey, userOpenRouterKey,
  myMemoryEmail, rebalanceNewlines, npcMaxLines, npcMode, aiModel,
  addAiRequest, addMyMemoryChars, qualityStats, filteredEntries,
}: UseAutoPilotProps) {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [logs, setLogs] = useState<AutoPilotLog[]>([]);
  const [report, setReport] = useState<AutoPilotReport | null>(null);
  const [mode, setMode] = useState<AutoPilotMode>('smart');
  const [previewMode, setPreviewMode] = useState(false);
  const [pendingTranslations, setPendingTranslations] = useState<Record<string, string> | null>(null);
  const [pendingOriginals, setPendingOriginals] = useState<Record<string, string>>({});
  const [pendingOldTranslations, setPendingOldTranslations] = useState<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);
  const logIdRef = useRef(0);

  const freeProviderLabel = useMemo(
    () => pickFreeProvider(userOpenRouterKey, userGroqKey, myMemoryEmail).label,
    [userOpenRouterKey, userGroqKey, myMemoryEmail],
  );

  const stop = useCallback(() => { abortRef.current?.abort(); }, []);

  const buildFetchBody = useCallback((
    entries: { key: string; original: string }[],
    forceProvider?: string,
    forceModel?: string,
  ) => {
    const prov = forceProvider || translationProvider;
    const provKey = prov === 'deepseek' ? userDeepSeekKey
      : prov === 'groq' ? userGroqKey
      : prov === 'openrouter' ? userOpenRouterKey
      : undefined;
    return JSON.stringify({
      entries,
      glossary: activeGlossary,
      userApiKey: prov === 'gemini' ? (userGeminiKey || undefined) : undefined,
      providerApiKey: provKey || undefined,
      provider: prov,
      myMemoryEmail: (prov === 'mymemory' ? myMemoryEmail : undefined) || undefined,
      rebalanceNewlines: rebalanceNewlines || undefined,
      npcMaxLines,
      npcMode: npcMode || undefined,
      aiModel: forceModel || (prov === 'gemini' ? aiModel : prov === 'openrouter' && aiModel?.includes('/') ? aiModel : undefined),
    });
  }, [activeGlossary, translationProvider, userGeminiKey, userDeepSeekKey, userGroqKey,
      userOpenRouterKey, myMemoryEmail, rebalanceNewlines, npcMaxLines, npcMode, aiModel]);

  const run = useCallback(async (runMode: AutoPilotMode = mode) => {
    if (!state || running) return;
    const startTime = Date.now();
    setRunning(true);
    setLogs([]);
    setReport(null);
    setProgress(null);
    setPhaseIndex(0);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const stats: AutoPilotReport = {
      totalEntries: 0, alreadyTranslated: 0, fromMemory: 0,
      fromGlossary: 0, fromAI: 0, failed: 0,
      tagsFixed: 0, weakFound: 0, weakFixed: 0, duration: 0,
      isFreeRun: runMode === 'free',
    };

    // وضع المعاينة: تجميع الترجمات بدلاً من تطبيقها مباشرة
    const pendingAcc: Record<string, string> = {};
    const isPreview = previewMode;
    if (isPreview) {
      const origMap: Record<string, string> = {};
      const oldMap: Record<string, string> = {};
      for (const e of state.entries) {
        const key = `${e.msbtFile}:${e.index}`;
        origMap[key] = e.original;
        oldMap[key] = state.translations[key] || '';
      }
      setPendingOriginals(origMap);
      setPendingOldTranslations(oldMap);
      setPendingTranslations(null);
    }
    const addTranslations = (t: Record<string, string>) => {
      if (isPreview) { Object.assign(pendingAcc, t); }
      else { setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...t } } : null); }
    };

    const freeChoice = pickFreeProvider(userOpenRouterKey, userGroqKey, myMemoryEmail);
    const aiProvider = runMode === 'free' ? freeChoice.provider : translationProvider;
    const aiModelOverride = runMode === 'free' ? freeChoice.model : undefined;

    // سلسلة Fallback: عند انتهاء الحصة يتحول تلقائياً للمزود التالي
    const fallbackChain: Array<{ provider: string; model?: string; label: string }> = runMode === 'free'
      ? [
          ...(aiProvider !== 'groq' && userGroqKey ? [{ provider: 'groq', label: 'Groq Llama 3.3' }] : []),
          { provider: 'google', label: 'Google Translate' },
        ]
      : [
          // الوضع الذكي: إذا انتهت الحصة تحول للمجاني تلقائياً
          ...(userOpenRouterKey ? [{ provider: 'openrouter', model: 'qwen/qwen-2.5-72b-instruct:free', label: 'Qwen (OpenRouter مجاني)' }] : []),
          ...(userGroqKey ? [{ provider: 'groq', label: 'Groq Llama 3.3' }] : []),
          { provider: 'google', label: 'Google Translate' },
        ];

    const log = (msg: string, type: AutoPilotLog['type'] = 'info', ph = '') =>
      setLogs(prev => [...prev, { id: ++logIdRef.current, phase: ph, message: msg, type }]);

    try {
      // ══════════════════════════════════════════════════════
      // المرحلة 1 — تحليل الوضع
      // ══════════════════════════════════════════════════════
      setPhase("📊 تحليل الوضع"); setPhaseIndex(1);
      log(`🚀 بدء الوكيل — الوضع: ${runMode === 'free' ? `مجاني (${freeChoice.label})` : `ذكي (${translationProvider})`}`, 'phase', "1");

      const arabicRe = /[؀-ۿ]/;
      const allEntries = filteredEntries.length > 0 ? filteredEntries : state.entries;
      const untranslated: ExtractedEntry[] = [];

      for (const e of allEntries) {
        const key = `${e.msbtFile}:${e.index}`;
        if (!e.original.trim() || arabicRe.test(e.original) || isTechnicalText(e.original)) continue;
        if (state.translations[key]?.trim()) { stats.alreadyTranslated++; continue; }
        untranslated.push(e);
      }

      stats.totalEntries = allEntries.length;
      const technicalCount = allEntries.length - stats.alreadyTranslated - untranslated.length;
      log(`إجمالي: ${stats.totalEntries} | مترجم: ${stats.alreadyTranslated} | يحتاج ترجمة: ${untranslated.length} | تقني: ${technicalCount}`, 'info', "1");

      if (untranslated.length === 0 && qualityStats.damagedTagKeys.size === 0) {
        log("✅ كل شيء مترجم ونظيف — لا يوجد عمل!", 'success', "1");
        stats.duration = Math.round((Date.now() - startTime) / 1000);
        setReport(stats);
        setPhase("✅ مكتمل"); setPhaseIndex(6);
        setRunning(false);
        return;
      }

      // ══════════════════════════════════════════════════════
      // المرحلة 2 — ذاكرة الترجمة + القاموس
      // ══════════════════════════════════════════════════════
      setPhase("💾 ذاكرة + قاموس"); setPhaseIndex(2);
      log(`بحث في ${Object.keys(state.translations).length} ترجمة موجودة وفي القاموس...`, 'phase', "2");

      const tmMap = new Map<string, string>();
      for (const [key, val] of Object.entries(state.translations)) {
        if (!val.trim()) continue;
        const entry = state.entries.find(e => `${e.msbtFile}:${e.index}` === key);
        if (entry) {
          const norm = entry.original.trim().toLowerCase();
          if (!tmMap.has(norm)) tmMap.set(norm, val);
        }
      }

      const glossaryMap = parseGlossaryMap(activeGlossary);
      const freeTranslations: Record<string, string> = {};
      const needsAI: ExtractedEntry[] = [];

      for (const e of untranslated) {
        if (signal.aborted) throw new DOMException('abort', 'AbortError');
        const key = `${e.msbtFile}:${e.index}`;
        const norm = e.original.trim().toLowerCase();
        const tmHit = tmMap.get(norm);
        if (tmHit) { freeTranslations[key] = tmHit; stats.fromMemory++; continue; }
        const gHit = glossaryMap.get(norm);
        if (gHit) { freeTranslations[key] = gHit; stats.fromGlossary++; continue; }
        needsAI.push(e);
      }

      if (Object.keys(freeTranslations).length > 0) {
        addTranslations(freeTranslations);
        log(`✅ مجاني: ${stats.fromMemory} من الذاكرة + ${stats.fromGlossary} من القاموس`, 'success', "2");
      } else {
        log("لم تُوجد مطابقات مجانية — كل شيء يحتاج AI", 'info', "2");
      }

      // ══════════════════════════════════════════════════════
      // المرحلة 3 — الترجمة بالذكاء الاصطناعي
      // ══════════════════════════════════════════════════════
      if (needsAI.length > 0) {
        setPhase("🤖 ترجمة AI"); setPhaseIndex(3);
        const totalBatches = Math.ceil(needsAI.length / AI_BATCH);
        const remaining = [...fallbackChain]; // نسخة قابلة للاستهلاك
        let curProvider = aiProvider;
        let curModel: string | undefined = aiModelOverride;
        log(`إرسال ${needsAI.length} نص عبر ${totalBatches} دفعة (${curProvider})...`, 'phase', "3");
        setProgress({ current: 0, total: needsAI.length });

        let done = 0;
        const failedEntries: ExtractedEntry[] = [];
        const isQuotaErr = (msg: string) => /انتهت الحصة|quota|429|rate.?limit|no credits|insufficient/i.test(msg);

        let batchIdx = 0;
        while (batchIdx < totalBatches) {
          if (signal.aborted) throw new DOMException('abort', 'AbortError');
          const batch = needsAI.slice(batchIdx * AI_BATCH, (batchIdx + 1) * AI_BATCH);
          const entries = batch.map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original }));

          try {
            const response = await fetch(getEdgeFunctionUrl("translate-entries"), {
              method: 'POST', headers: getSupabaseHeaders(), signal,
              body: buildFetchBody(entries, curProvider, curModel),
            });
            if (!response.ok) {
              const errData = await response.json().catch(() => null);
              throw new Error(errData?.error || `خطأ ${response.status}`);
            }
            const data = await response.json();
            addAiRequest(1);
            if (data.charsUsed) addMyMemoryChars(data.charsUsed);
            if (data.translations) {
              addTranslations(data.translations);
              stats.fromAI += Object.keys(data.translations).length;
              for (const e of batch) {
                if (!data.translations[`${e.msbtFile}:${e.index}`]) failedEntries.push(e);
              }
            }
            done += batch.length;
            batchIdx++;
          } catch (err) {
            if ((err as Error).name === 'AbortError') throw err;
            const errMsg = (err as Error).message;

            // انتهت الحصة → تحول تلقائي للمزود التالي
            if (isQuotaErr(errMsg) && remaining.length > 0) {
              const next = remaining.shift()!;
              log(`⚠️ انتهت حصة ${curProvider} — تحويل تلقائي لـ ${next.label}`, 'warning', "3");
              toast({ title: "⚡ تحويل تلقائي للمحرك", description: `انتهت حصة ${curProvider} — يُستخدم الآن: ${next.label}` });
              curProvider = next.provider;
              curModel = next.model;
              // أعد نفس الدفعة مع المزود الجديد (لا تزيد batchIdx)
              continue;
            }

            // فشل دائم — سجّل وانتقل للتالية
            log(`⚠️ دفعة ${batchIdx + 1} فشلت: ${errMsg}`, 'warning', "3");
            failedEntries.push(...batch);
            done += batch.length;
            batchIdx++;
          }

          setProgress({ current: done, total: needsAI.length });
          if (batchIdx % 5 === 0 && batchIdx > 0) {
            log(`✔ تقدم: ${stats.fromAI} تُرجم، ${failedEntries.length} فشل حتى الآن`, 'info', "3");
          }
        }

        stats.failed = failedEntries.length;

        // إعادة محاولة الفاشلة فرداً (حتى 20)
        if (failedEntries.length > 0 && failedEntries.length <= 20) {
          log(`🔄 إعادة محاولة ${failedEntries.length} نص فاشل...`, 'info', "3");
          let recovered = 0;
          for (const e of failedEntries) {
            if (signal.aborted) break;
            const key = `${e.msbtFile}:${e.index}`;
            try {
              const resp = await fetch(getEdgeFunctionUrl("translate-entries"), {
                method: 'POST', headers: getSupabaseHeaders(), signal,
                body: buildFetchBody([{ key, original: e.original }], curProvider, curModel),
              });
              if (resp.ok) {
                const data = await resp.json();
                if (data.translations?.[key]) {
                  addTranslations({ [key]: data.translations[key] });
                  recovered++;
                  stats.fromAI++;
                  stats.failed--;
                }
              }
            } catch { /* تجاهل */ }
          }
          if (recovered > 0) log(`✅ تعافى ${recovered} نص`, 'success', "3");
        }

        log(
          `✅ ترجمة AI: ${stats.fromAI} نجح (${curProvider})${stats.failed > 0 ? ` | ⚠️ ${stats.failed} فشل نهائياً` : ''}`,
          stats.failed > 0 ? 'warning' : 'success', "3",
        );
      }

      setProgress(null);

      // ══════════════════════════════════════════════════════
      // المرحلة 4 — إصلاح الرموز التالفة
      // ══════════════════════════════════════════════════════
      setPhase("🔧 إصلاح الرموز"); setPhaseIndex(4);
      const damagedKeys = qualityStats.damagedTagKeys;

      if (damagedKeys.size > 0) {
        log(`إصلاح ${damagedKeys.size} رمز تالف...`, 'phase', "4");
        setProgress({ current: 0, total: damagedKeys.size });
        const toFix = state.entries.filter(e => damagedKeys.has(`${e.msbtFile}:${e.index}`));
        let fixed = 0;

        for (let b = 0; b < Math.ceil(toFix.length / AI_BATCH); b++) {
          if (signal.aborted) throw new DOMException('abort', 'AbortError');
          const batch = toFix.slice(b * AI_BATCH, (b + 1) * AI_BATCH);
          const entries = batch.map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original }));
          try {
            const resp = await fetch(getEdgeFunctionUrl("translate-entries"), {
              method: 'POST', headers: getSupabaseHeaders(), signal,
              body: buildFetchBody(entries, aiProvider, aiModelOverride),
            });
            if (resp.ok) {
              const data = await resp.json();
              if (data.translations) {
                addTranslations(data.translations);
                fixed += Object.keys(data.translations).length;
              }
            }
          } catch (err) { if ((err as Error).name === 'AbortError') throw err; }
          setProgress({ current: Math.min((b + 1) * AI_BATCH, toFix.length), total: toFix.length });
        }

        stats.tagsFixed = fixed;
        log(`✅ أُصلح ${fixed} رمز تالف`, 'success', "4");
      } else {
        log("✅ لا توجد رموز تالفة", 'success', "4");
      }

      setProgress(null);

      // ══════════════════════════════════════════════════════
      // المرحلة 5 — فحص الجودة وإصلاح الضعيف
      // ══════════════════════════════════════════════════════
      setPhase("🔍 فحص الجودة"); setPhaseIndex(5);
      log("فحص جودة جميع الترجمات المكتملة...", 'phase', "5");

      const snap: Record<string, string> = isPreview
        ? { ...state.translations, ...pendingAcc }
        : (() => { const s: Record<string, string> = {}; setState(prev => { if (prev) Object.assign(s, prev.translations); return prev; }); return s; })();

      const toReview = (filteredEntries.length > 0 ? filteredEntries : state.entries)
        .filter(e => {
          const k = `${e.msbtFile}:${e.index}`;
          return snap[k]?.trim() && !isTechnicalText(e.original);
        })
        .map(e => ({
          key: `${e.msbtFile}:${e.index}`,
          original: e.original,
          translation: snap[`${e.msbtFile}:${e.index}`],
          maxBytes: e.maxBytes || 0,
        }));

      if (toReview.length > 0) {
        const RBATCH = 30;
        setProgress({ current: 0, total: toReview.length });
        const allWeak: { key: string; suggestion: string }[] = [];
        let reviewed = 0;

        for (let b = 0; b < Math.ceil(toReview.length / RBATCH); b++) {
          if (signal.aborted) throw new DOMException('abort', 'AbortError');
          const batch = toReview.slice(b * RBATCH, (b + 1) * RBATCH);
          try {
            const resp = await fetch(getEdgeFunctionUrl("review-translations"), {
              method: 'POST', headers: getSupabaseHeaders(), signal,
              body: JSON.stringify({ entries: batch, glossary: activeGlossary, action: 'detect-weak', aiModel }),
            });
            if (resp.ok) {
              const data = await resp.json();
              if (data.weakEntries) allWeak.push(...data.weakEntries.map((w: any) => ({ key: w.key, suggestion: w.suggestion })));
            }
          } catch (err) { if ((err as Error).name === 'AbortError') throw err; }
          reviewed += batch.length;
          setProgress({ current: reviewed, total: toReview.length });
        }

        stats.weakFound = allWeak.length;

        if (allWeak.length > 0) {
          const fixes: Record<string, string> = {};
          for (const w of allWeak) { if (w.suggestion?.trim()) fixes[w.key] = w.suggestion; }
          if (Object.keys(fixes).length > 0) {
            addTranslations(fixes);
            stats.weakFixed = Object.keys(fixes).length;
            log(`✅ أُصلح ${stats.weakFixed} ترجمة ضعيفة تلقائياً`, 'success', "5");
          }
        } else {
          log("✅ جميع الترجمات بجودة ممتازة", 'success', "5");
        }
      } else {
        log("لا توجد ترجمات كافية للفحص", 'info', "5");
      }

      setProgress(null);

      // ══════════════════════════════════════════════════════
      // التقرير النهائي
      // ══════════════════════════════════════════════════════
      stats.duration = Math.round((Date.now() - startTime) / 1000);
      setReport(stats);
      setPhase("✅ مكتمل"); setPhaseIndex(6);

      const total = stats.fromMemory + stats.fromGlossary + stats.fromAI;
      log(`🎉 اكتمل الوكيل! ${total} نص تُرجم خلال ${stats.duration}ث`, 'success', "✅ النتيجة");
      if (isPreview && Object.keys(pendingAcc).length > 0) {
        setPendingTranslations({ ...pendingAcc });
        toast({ title: "👁️ معاينة جاهزة", description: `راجع ${Object.keys(pendingAcc).length} ترجمة قبل التطبيق` });
      } else {
        toast({
          title: "✅ الوكيل التلقائي اكتمل",
          description: `${stats.fromAI} بالذكاء الاصطناعي + ${stats.fromMemory + stats.fromGlossary} مجاناً${stats.failed > 0 ? ` | ${stats.failed} فشل` : ''}`,
        });
      }

    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setPhase("⏹️ موقوف"); setPhaseIndex(0);
        log("⏹️ أوقفت الوكيل يدوياً", 'warning');
        if (isPreview && Object.keys(pendingAcc).length > 0) {
          setPendingTranslations({ ...pendingAcc });
          toast({ title: "👁️ معاينة جاهزة", description: `تم جمع ${Object.keys(pendingAcc).length} ترجمة — راجعها قبل التطبيق` });
        }
      } else {
        const msg = err instanceof Error ? err.message : 'خطأ غير معروف';
        setPhase("❌ خطأ"); setPhaseIndex(0);
        log(`❌ خطأ: ${msg}`, 'error');
        toast({ title: "❌ خطأ في الوكيل", description: msg, variant: "destructive" });
      }
      stats.duration = Math.round((Date.now() - startTime) / 1000);
      setReport(stats);
    } finally {
      setRunning(false);
      setProgress(null);
      abortRef.current = null;
    }
  }, [state, setState, running, mode, previewMode, activeGlossary, parseGlossaryMap, translationProvider,
      userGeminiKey, userGroqKey, userOpenRouterKey, myMemoryEmail, rebalanceNewlines,
      npcMaxLines, aiModel, addAiRequest, addMyMemoryChars, qualityStats, filteredEntries, buildFetchBody]);

  const applyPending = useCallback((selectedKeys: Set<string>) => {
    if (!pendingTranslations) return;
    const toApply: Record<string, string> = {};
    for (const key of selectedKeys) {
      if (pendingTranslations[key] !== undefined) toApply[key] = pendingTranslations[key];
    }
    if (Object.keys(toApply).length > 0) {
      setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...toApply } } : null);
    }
    setPendingTranslations(null);
  }, [pendingTranslations, setState]);

  const discardPending = useCallback(() => { setPendingTranslations(null); }, []);

  return {
    running, phase, phaseIndex, progress, logs, report, mode, setMode, run, stop, freeProviderLabel,
    previewMode, setPreviewMode,
    pendingTranslations, pendingOriginals, pendingOldTranslations, applyPending, discardPending,
  };
}
