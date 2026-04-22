import { useState, useRef, useCallback } from "react";
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
}

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
  aiModel: string;
  addAiRequest: (n?: number) => void;
  addMyMemoryChars: (n: number) => void;
  qualityStats: { damagedTagKeys: Set<string> };
  filteredEntries: ExtractedEntry[];
}

const AI_BATCH = 5;

export function useAutoPilot({
  state, setState, activeGlossary, parseGlossaryMap,
  translationProvider, userGeminiKey, userDeepSeekKey, userGroqKey, userOpenRouterKey,
  myMemoryEmail, rebalanceNewlines, npcMaxLines, aiModel,
  addAiRequest, addMyMemoryChars, qualityStats, filteredEntries,
}: UseAutoPilotProps) {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [logs, setLogs] = useState<AutoPilotLog[]>([]);
  const [report, setReport] = useState<AutoPilotReport | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const logIdRef = useRef(0);

  const log = useCallback((message: string, type: AutoPilotLog['type'] = 'info', phaseLabel?: string) => {
    setLogs(prev => [...prev, { id: ++logIdRef.current, phase: phaseLabel || phase, message, type }]);
  }, [phase]);

  const providerKey = useCallback(() => {
    if (translationProvider === 'deepseek') return userDeepSeekKey || undefined;
    if (translationProvider === 'groq') return userGroqKey || undefined;
    if (translationProvider === 'openrouter') return userOpenRouterKey || undefined;
    return undefined;
  }, [translationProvider, userDeepSeekKey, userGroqKey, userOpenRouterKey]);

  const fetchTranslate = useCallback(async (
    entries: { key: string; original: string }[],
    signal: AbortSignal,
  ) => {
    const response = await fetch(getEdgeFunctionUrl("translate-entries"), {
      method: 'POST',
      headers: getSupabaseHeaders(),
      signal,
      body: JSON.stringify({
        entries,
        glossary: activeGlossary,
        userApiKey: translationProvider === 'gemini' ? (userGeminiKey || undefined) : undefined,
        providerApiKey: providerKey(),
        provider: translationProvider,
        myMemoryEmail: myMemoryEmail || undefined,
        rebalanceNewlines: rebalanceNewlines || undefined,
        npcMaxLines,
        aiModel,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => null);
      throw new Error(err?.error || `خطأ ${response.status}`);
    }
    return response.json();
  }, [activeGlossary, translationProvider, userGeminiKey, providerKey, myMemoryEmail, rebalanceNewlines, npcMaxLines, aiModel]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const run = useCallback(async () => {
    if (!state || running) return;
    const startTime = Date.now();
    setRunning(true);
    setLogs([]);
    setReport(null);
    setProgress(null);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const stats: AutoPilotReport = {
      totalEntries: 0, alreadyTranslated: 0, fromMemory: 0,
      fromGlossary: 0, fromAI: 0, failed: 0,
      tagsFixed: 0, weakFound: 0, weakFixed: 0, duration: 0,
    };

    const addLog = (message: string, type: AutoPilotLog['type'] = 'info', ph?: string) => {
      setLogs(prev => [...prev, { id: ++logIdRef.current, phase: ph || '', message, type }]);
    };

    try {
      // ══════════════════════════════════════════════════
      // المرحلة 1 — تحليل الوضع الحالي
      // ══════════════════════════════════════════════════
      setPhase("📊 تحليل");
      addLog("بدء الوكيل التلقائي — تحليل حالة الترجمة...", 'phase', "المرحلة 1");

      const arabicRe = /[؀-ۿ]/;
      const allEntries = filteredEntries.length > 0 ? filteredEntries : state.entries;
      const untranslated: ExtractedEntry[] = [];
      let alreadyDone = 0;

      for (const e of allEntries) {
        const key = `${e.msbtFile}:${e.index}`;
        if (!e.original.trim() || arabicRe.test(e.original) || isTechnicalText(e.original)) continue;
        if (state.translations[key]?.trim()) { alreadyDone++; continue; }
        untranslated.push(e);
      }

      stats.totalEntries = allEntries.length;
      stats.alreadyTranslated = alreadyDone;
      addLog(`إجمالي المدخلات: ${stats.totalEntries} | مترجم مسبقاً: ${alreadyDone} | يحتاج ترجمة: ${untranslated.length}`, 'info', "المرحلة 1");

      if (untranslated.length === 0 && qualityStats.damagedTagKeys.size === 0) {
        addLog("✅ كل شيء مترجم وسليم — لا حاجة للتشغيل!", 'success', "المرحلة 1");
        setPhase("✅ مكتمل");
        stats.duration = Math.round((Date.now() - startTime) / 1000);
        setReport(stats);
        setRunning(false);
        return;
      }

      // ══════════════════════════════════════════════════
      // المرحلة 2 — ترجمة مجانية (الذاكرة + القاموس)
      // ══════════════════════════════════════════════════
      setPhase("💾 ذاكرة وقاموس");
      addLog("بحث في ذاكرة الترجمة والقاموس...", 'phase', "المرحلة 2");

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
      const freeTranslations: Record<string, string> = {};
      const needsAI: ExtractedEntry[] = [];

      for (const e of untranslated) {
        if (signal.aborted) throw new DOMException('abort', 'AbortError');
        const key = `${e.msbtFile}:${e.index}`;
        const norm = e.original.trim().toLowerCase();
        const tmHit = tmMap.get(norm);
        if (tmHit) { freeTranslations[key] = tmHit; stats.fromMemory++; continue; }
        const glossaryHit = glossaryMap.get(norm);
        if (glossaryHit) { freeTranslations[key] = glossaryHit; stats.fromGlossary++; continue; }
        needsAI.push(e);
      }

      if (Object.keys(freeTranslations).length > 0) {
        setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...freeTranslations } } : null);
        addLog(`✅ ترجمة مجانية: ${stats.fromMemory} من الذاكرة + ${stats.fromGlossary} من القاموس`, 'success', "المرحلة 2");
      } else {
        addLog("لم يُعثر على مطابقات مجانية — كل شيء يحتاج ذكاء اصطناعي", 'info', "المرحلة 2");
      }

      // ══════════════════════════════════════════════════
      // المرحلة 3 — الترجمة بالذكاء الاصطناعي
      // ══════════════════════════════════════════════════
      if (needsAI.length > 0) {
        setPhase("🤖 ترجمة ذكاء اصطناعي");
        addLog(`إرسال ${needsAI.length} نص للذكاء الاصطناعي (${Math.ceil(needsAI.length / AI_BATCH)} دفعة)...`, 'phase', "المرحلة 3");
        setProgress({ current: 0, total: needsAI.length });

        const failedKeys = new Set<string>();
        let done = 0;

        for (let b = 0; b < Math.ceil(needsAI.length / AI_BATCH); b++) {
          if (signal.aborted) throw new DOMException('abort', 'AbortError');
          const batch = needsAI.slice(b * AI_BATCH, (b + 1) * AI_BATCH);
          const entries = batch.map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original }));

          try {
            const data = await fetchTranslate(entries, signal);
            addAiRequest(1);
            if (data.charsUsed) addMyMemoryChars(data.charsUsed);
            if (data.translations) {
              setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...data.translations } } : null);
              const got = Object.keys(data.translations).length;
              stats.fromAI += got;
              // Track entries that got no translation back
              for (const e of batch) {
                const k = `${e.msbtFile}:${e.index}`;
                if (!data.translations[k]) failedKeys.add(k);
              }
            }
          } catch (err) {
            if ((err as Error).name === 'AbortError') throw err;
            // Log batch failure but continue
            addLog(`⚠️ فشلت دفعة ${b + 1}: ${(err as Error).message}`, 'warning', "المرحلة 3");
            stats.failed += batch.length;
            for (const e of batch) failedKeys.add(`${e.msbtFile}:${e.index}`);
          }

          done += batch.length;
          setProgress({ current: done, total: needsAI.length });
        }

        stats.failed = failedKeys.size;
        addLog(
          `✅ ترجمة الذكاء الاصطناعي: ${stats.fromAI} نص${stats.failed > 0 ? ` | ⚠️ ${stats.failed} فشل` : ''}`,
          stats.failed > 0 ? 'warning' : 'success',
          "المرحلة 3"
        );
      }

      setProgress(null);

      // ══════════════════════════════════════════════════
      // المرحلة 4 — إصلاح الرموز التالفة
      // ══════════════════════════════════════════════════
      setPhase("🔧 إصلاح الرموز");

      // Re-read current state snapshot for damaged tags
      const damagedNow = qualityStats.damagedTagKeys;
      if (damagedNow.size > 0) {
        addLog(`إصلاح ${damagedNow.size} رمز تالف...`, 'phase', "المرحلة 4");
        setProgress({ current: 0, total: damagedNow.size });

        const toFix = state.entries.filter(e => damagedNow.has(`${e.msbtFile}:${e.index}`));
        let fixedCount = 0;

        for (let b = 0; b < Math.ceil(toFix.length / AI_BATCH); b++) {
          if (signal.aborted) throw new DOMException('abort', 'AbortError');
          const batch = toFix.slice(b * AI_BATCH, (b + 1) * AI_BATCH);
          const entries = batch.map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original }));
          try {
            const data = await fetchTranslate(entries, signal);
            addAiRequest(1);
            if (data.translations) {
              setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...data.translations } } : null);
              fixedCount += Object.keys(data.translations).length;
            }
          } catch (err) {
            if ((err as Error).name === 'AbortError') throw err;
          }
          setProgress({ current: Math.min((b + 1) * AI_BATCH, toFix.length), total: toFix.length });
        }

        stats.tagsFixed = fixedCount;
        addLog(`✅ تم إصلاح ${fixedCount} رمز تالف`, 'success', "المرحلة 4");
      } else {
        addLog("✅ لا توجد رموز تالفة", 'success', "المرحلة 4");
      }

      setProgress(null);

      // ══════════════════════════════════════════════════
      // المرحلة 5 — فحص جودة وإصلاح الترجمات الضعيفة
      // ══════════════════════════════════════════════════
      setPhase("🔍 فحص الجودة");
      addLog("فحص جودة الترجمات المكتملة...", 'phase', "المرحلة 5");

      // Get current state after all updates
      const currentTranslations = (() => {
        let t: Record<string, string> = {};
        setState(prev => { if (prev) t = prev.translations; return prev; });
        return t;
      })();

      const reviewEntries = (filteredEntries.length > 0 ? filteredEntries : state.entries)
        .filter(e => {
          const key = `${e.msbtFile}:${e.index}`;
          return currentTranslations[key]?.trim() && !isTechnicalText(e.original);
        })
        .map(e => ({
          key: `${e.msbtFile}:${e.index}`,
          original: e.original,
          translation: currentTranslations[`${e.msbtFile}:${e.index}`],
          maxBytes: e.maxBytes || 0,
        }));

      if (reviewEntries.length > 0) {
        setProgress({ current: 0, total: reviewEntries.length });
        const REVIEW_BATCH = 30;
        const allWeak: { key: string; suggestion: string }[] = [];
        let reviewed = 0;

        for (let b = 0; b < Math.ceil(reviewEntries.length / REVIEW_BATCH); b++) {
          if (signal.aborted) throw new DOMException('abort', 'AbortError');
          const batch = reviewEntries.slice(b * REVIEW_BATCH, (b + 1) * REVIEW_BATCH);
          try {
            const resp = await fetch(getEdgeFunctionUrl("review-translations"), {
              method: 'POST',
              headers: getSupabaseHeaders(),
              signal,
              body: JSON.stringify({ entries: batch, glossary: activeGlossary, action: 'detect-weak', aiModel }),
            });
            if (resp.ok) {
              const data = await resp.json();
              if (data.weakEntries) {
                allWeak.push(...data.weakEntries.map((w: any) => ({ key: w.key, suggestion: w.suggestion })));
              }
            }
          } catch (err) {
            if ((err as Error).name === 'AbortError') throw err;
          }
          reviewed += batch.length;
          setProgress({ current: reviewed, total: reviewEntries.length });
        }

        stats.weakFound = allWeak.length;
        addLog(`فُحص ${reviewEntries.length} ترجمة — عُثر على ${allWeak.length} ضعيفة`, 'info', "المرحلة 5");

        // Auto-apply fixes for weak translations that have suggestions
        if (allWeak.length > 0) {
          const fixes: Record<string, string> = {};
          for (const w of allWeak) {
            if (w.suggestion?.trim()) fixes[w.key] = w.suggestion;
          }
          if (Object.keys(fixes).length > 0) {
            setState(prev => prev ? { ...prev, translations: { ...prev.translations, ...fixes } } : null);
            stats.weakFixed = Object.keys(fixes).length;
            addLog(`✅ تم إصلاح ${stats.weakFixed} ترجمة ضعيفة تلقائياً`, 'success', "المرحلة 5");
          }
        } else {
          addLog("✅ جميع الترجمات بجودة مقبولة", 'success', "المرحلة 5");
        }
      } else {
        addLog("لا توجد ترجمات كافية للفحص بعد", 'info', "المرحلة 5");
      }

      setProgress(null);

      // ══════════════════════════════════════════════════
      // التقرير النهائي
      // ══════════════════════════════════════════════════
      stats.duration = Math.round((Date.now() - startTime) / 1000);
      setReport(stats);
      setPhase("✅ مكتمل");
      addLog(
        `🎉 انتهى الوكيل! ترجم ${stats.fromMemory + stats.fromGlossary + stats.fromAI} نص خلال ${stats.duration}ث`,
        'success', "التقرير النهائي"
      );
      toast({ title: "✅ الوكيل التلقائي انتهى", description: `${stats.fromAI} من الذكاء الاصطناعي + ${stats.fromMemory + stats.fromGlossary} مجاناً` });

    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setPhase("⏹️ موقوف");
        addLog("⏹️ تم إيقاف الوكيل يدوياً", 'warning');
      } else {
        const msg = err instanceof Error ? err.message : 'خطأ غير معروف';
        setPhase("❌ خطأ");
        addLog(`❌ خطأ: ${msg}`, 'error');
        toast({ title: "❌ خطأ في الوكيل", description: msg, variant: "destructive" });
      }
      stats.duration = Math.round((Date.now() - startTime) / 1000);
      setReport(stats);
    } finally {
      setRunning(false);
      setProgress(null);
      abortRef.current = null;
    }
  }, [state, setState, running, activeGlossary, parseGlossaryMap, translationProvider,
    userGeminiKey, providerKey, myMemoryEmail, rebalanceNewlines, npcMaxLines, aiModel,
    addAiRequest, addMyMemoryChars, qualityStats, filteredEntries, fetchTranslate]);

  return { running, phase, progress, logs, report, run, stop };
}
