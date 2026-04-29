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

export interface AutoPilotDiagnostic {
  id: number;
  timestamp: number;        // Date.now()
  phase: string;            // e.g. "AI", "إصلاح الرموز"
  batchIndex: number;       // 1-based; 0 if N/A
  totalBatches: number;     // 0 if N/A
  attempt: number;          // retry attempt count for this batch
  provider: string;
  model?: string;
  httpStatus?: number;      // if known
  kind: 'rate_limit' | 'transient' | 'billing' | 'partial' | 'permanent' | 'abort' | 'fatal';
  message: string;
  bodySnippet?: string;     // first ~400 chars of upstream body
  willRetry: boolean;
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
  userCerebrasKey: string;
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
  customPromptInstructions: string;
}

const AI_BATCH = 10;
const BATCH_DELAY_MS = 2000;        // breathing room between AI batches
const RATE_LIMIT_WAIT_MS = 60_000;  // wait 60s on client-side 429 before retrying SAME batch
// 429 retries are INFINITE — the agent keeps going (even while user sleeps)
// until the request succeeds or the user clicks Stop.

function pickFreeProvider(
  userOpenRouterKey: string,
  userGroqKey: string,
  userCerebrasKey: string,
  myMemoryEmail: string,
): { provider: string; model?: string; label: string } {
  if (userCerebrasKey) return { provider: 'cerebras', model: 'qwen-3-235b-a22b-instruct-2507', label: 'Qwen 3 235B (Cerebras مجاني)' };
  if (userOpenRouterKey) return { provider: 'openrouter', model: 'qwen/qwen-2.5-72b-instruct:free', label: 'Qwen 2.5 72B (OpenRouter مجاني)' };
  if (userGroqKey) return { provider: 'groq', label: 'Groq Llama 3.3 (مجاني)' };
  return { provider: 'google', label: 'Google Translate (مجاني تماماً)' };
}

export function useAutoPilot({
  state, setState, activeGlossary, parseGlossaryMap,
  translationProvider, userGeminiKey, userDeepSeekKey, userGroqKey, userCerebrasKey, userOpenRouterKey,
  myMemoryEmail, rebalanceNewlines, npcMaxLines, npcMode, aiModel,
  addAiRequest, addMyMemoryChars, qualityStats, filteredEntries,
  customPromptInstructions,
}: UseAutoPilotProps) {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [logs, setLogs] = useState<AutoPilotLog[]>([]);
  const [diagnostics, setDiagnostics] = useState<AutoPilotDiagnostic[]>([]);
  const [report, setReport] = useState<AutoPilotReport | null>(null);
  const [mode, setMode] = useState<AutoPilotMode>('smart');
  const [previewMode, setPreviewMode] = useState(false);
  const [pendingTranslations, setPendingTranslations] = useState<Record<string, string> | null>(null);
  const [pendingOriginals, setPendingOriginals] = useState<Record<string, string>>({});
  const [pendingOldTranslations, setPendingOldTranslations] = useState<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);
  const logIdRef = useRef(0);
  const diagIdRef = useRef(0);

  const clearDiagnostics = useCallback(() => setDiagnostics([]), []);

  const freeProviderLabel = useMemo(
    () => pickFreeProvider(userOpenRouterKey, userGroqKey, userCerebrasKey, myMemoryEmail).label,
    [userOpenRouterKey, userGroqKey, userCerebrasKey, myMemoryEmail],
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
      : prov === 'cerebras' ? userCerebrasKey
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
      extraInstructions: customPromptInstructions || undefined,
    });
  }, [activeGlossary, translationProvider, userGeminiKey, userDeepSeekKey, userGroqKey, userCerebrasKey,
      userOpenRouterKey, myMemoryEmail, rebalanceNewlines, npcMaxLines, npcMode, aiModel, customPromptInstructions]);

  const run = useCallback(async (runMode: AutoPilotMode = mode) => {
    if (!state || running) return;
    const startTime = Date.now();
    setRunning(true);
    setLogs([]);
    setDiagnostics([]);  // clear at start of new run
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

    const freeChoice = pickFreeProvider(userOpenRouterKey, userGroqKey, userCerebrasKey, myMemoryEmail);
    const aiProvider = runMode === 'free' ? freeChoice.provider : translationProvider;
    const aiModelOverride = runMode === 'free' ? freeChoice.model : undefined;

    // سلسلة Fallback: عند انتهاء الحصة يتحول تلقائياً للمزود التالي
    const fallbackChain: Array<{ provider: string; model?: string; label: string }> = runMode === 'free'
      ? [
          ...(aiProvider !== 'cerebras' && userCerebrasKey ? [{ provider: 'cerebras', model: 'qwen-3-235b-a22b-instruct-2507', label: 'Qwen 3 235B (Cerebras)' }] : []),
          ...(aiProvider !== 'groq' && userGroqKey ? [{ provider: 'groq', label: 'Groq Llama 3.3' }] : []),
          { provider: 'google', label: 'Google Translate' },
        ]
      : [
          // الوضع الذكي: إذا انتهت الحصة تحول للمجاني تلقائياً
          ...(userCerebrasKey ? [{ provider: 'cerebras', model: 'qwen-3-235b-a22b-instruct-2507', label: 'Qwen 3 235B (Cerebras)' }] : []),
          ...(userOpenRouterKey ? [{ provider: 'openrouter', model: 'qwen/qwen-2.5-72b-instruct:free', label: 'Qwen (OpenRouter مجاني)' }] : []),
          ...(userGroqKey ? [{ provider: 'groq', label: 'Groq Llama 3.3' }] : []),
          { provider: 'google', label: 'Google Translate' },
        ];

    const log = (msg: string, type: AutoPilotLog['type'] = 'info', ph = '') =>
      setLogs(prev => [...prev, { id: ++logIdRef.current, phase: ph, message: msg, type }]);

    const waitOrAbort = async (ms: number, stepMs = 2000) => {
      const waitStart = Date.now();
      while (Date.now() - waitStart < ms) {
        if (signal.aborted) throw new DOMException('abort', 'AbortError');
        await new Promise(r => setTimeout(r, Math.min(stepMs, ms - (Date.now() - waitStart))));
      }
    };

    // Temporary limits/errors must never end the run; only real billing/auth errors may stop/switch.
    const isRateLimit429 = (msg: string) => /429|rate.?limit|RATE_LIMIT_RETRYABLE|تجاوز(ت)? حد|too many requests/i.test(msg);
    const isBillingExhausted = (msg: string) => /no credits|insufficient|💳|billing|رصيد .*غير كاف|أضف رصيد/i.test(msg);
    const isWaitableQuota = (msg: string) => /quota exceeded|daily quota|exhausted|انتهت الحصة|الحصة المجانية|free tier/i.test(msg) && !isBillingExhausted(msg);
    const isRetryableTransient = (msg: string) =>
      isRateLimit429(msg) || isWaitableQuota(msg) ||
      /PARTIAL_TRANSLATION_RETRYABLE|missing translations|incomplete|HTTP_(408|425|500|502|503|504)|خطأ (408|425|500|502|503|504)|upstream|timeout|timed out|failed to fetch|load failed|networkerror|functionshttperror|functionsrelayerror|edge function/i.test(msg);

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
        setPhase("✅ مكتمل"); setPhaseIndex(5);
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
        const aiTranslatedKeys = new Set<string>();

        let batchIdx = 0;
        let rateLimitAttempts = 0; // tracked per-batch, reset on success
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
              const rawErr = await response.text().catch(() => '');
              let parsedErr: { error?: string; message?: string } | null = null;
              try { parsedErr = rawErr ? JSON.parse(rawErr) : null; } catch { parsedErr = null; }
              const detail = parsedErr?.error || parsedErr?.message || rawErr || response.statusText;
              throw new Error(`HTTP_${response.status}: ${detail || 'request failed'}`);
            }
            const data = await response.json();
            if (data?.error) throw new Error(String(data.error || data.message || 'edge function error'));
            addAiRequest(1);
            if (data.charsUsed) addMyMemoryChars(data.charsUsed);
            if (data.translations) {
              addTranslations(data.translations);
              for (const key of Object.keys(data.translations)) {
                if (!aiTranslatedKeys.has(key)) {
                  aiTranslatedKeys.add(key);
                  stats.fromAI++;
                }
              }
            }

            const missing = batch.filter(e => !data.translations?.[`${e.msbtFile}:${e.index}`]);
            if (missing.length > 0) {
              throw new Error(`PARTIAL_TRANSLATION_RETRYABLE: missing translations ${missing.length}/${batch.length}`);
            }

            done += batch.length;
            batchIdx++;
            rateLimitAttempts = 0; // reset on success

            // Breathing room between batches to ease pressure on the AI gateway
            if (batchIdx < totalBatches) {
              await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
            }
          } catch (err) {
            if ((err as Error).name === 'AbortError') throw err;
            const errMsg = (err as Error).message;

            // ⚡ TRUE BILLING EXHAUSTED → switch provider (one-shot); waitable quotas keep retrying.
            if (isBillingExhausted(errMsg) && remaining.length > 0) {
              const next = remaining.shift()!;
              log(`💳 انتهت حصة ${curProvider} نهائياً — تحويل لـ ${next.label}`, 'warning', "3");
              toast({ title: "⚡ تحويل المحرك", description: `${curProvider} → ${next.label}` });
              curProvider = next.provider;
              curModel = next.model;
              rateLimitAttempts = 0;
              continue; // retry same batch with new provider
            }

            // ⏳ TEMPORARY 429 → wait & retry same batch FOREVER (until success or user stops)
            if (isRetryableTransient(errMsg)) {
              rateLimitAttempts++;
              const waitSec = Math.round(RATE_LIMIT_WAIT_MS / 1000);
              if (rateLimitAttempts === 1 || rateLimitAttempts % 5 === 0) {
                log(`⏳ تعذّر الاتصال مؤقتاً/تجاوز حد الطلبات (محاولة ${rateLimitAttempts}) — انتظار ${waitSec}ث ثم متابعة دفعة ${batchIdx + 1}/${totalBatches}...`, 'warning', "3");
              }
              await waitOrAbort(RATE_LIMIT_WAIT_MS);
              continue; // retry same batch — do NOT advance batchIdx
            }

            // Other permanent failure — log and skip
            log(`⚠️ دفعة ${batchIdx + 1} فشلت: ${errMsg}`, 'warning', "3");
            failedEntries.push(...batch);
            done += batch.length;
            batchIdx++;
            rateLimitAttempts = 0;
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

        const fixTotalBatches = Math.ceil(toFix.length / AI_BATCH);
        for (let b = 0; b < fixTotalBatches;) {
          if (signal.aborted) throw new DOMException('abort', 'AbortError');
          const batch = toFix.slice(b * AI_BATCH, (b + 1) * AI_BATCH);
          const entries = batch.map(e => ({ key: `${e.msbtFile}:${e.index}`, original: e.original }));
          try {
            const resp = await fetch(getEdgeFunctionUrl("translate-entries"), {
              method: 'POST', headers: getSupabaseHeaders(), signal,
              body: buildFetchBody(entries, aiProvider, aiModelOverride),
            });
            if (!resp.ok) {
              const rawErr = await resp.text().catch(() => '');
              let parsedErr: { error?: string; message?: string } | null = null;
              try { parsedErr = rawErr ? JSON.parse(rawErr) : null; } catch { parsedErr = null; }
              const detail = parsedErr?.error || parsedErr?.message || rawErr || resp.statusText;
              throw new Error(`HTTP_${resp.status}: ${detail || 'request failed'}`);
            }
            const data = await resp.json();
            if (data.translations) {
              addTranslations(data.translations);
              fixed += Object.keys(data.translations).length;
            }
            b++;
            setProgress({ current: Math.min(b * AI_BATCH, toFix.length), total: toFix.length });
          } catch (err) {
            if ((err as Error).name === 'AbortError') throw err;
            const errMsg = (err as Error).message;
            if (isRetryableTransient(errMsg)) {
              log(`⏳ إصلاح الرموز توقف مؤقتاً — انتظار ${Math.round(RATE_LIMIT_WAIT_MS / 1000)}ث ثم إعادة نفس الدفعة ${b + 1}/${fixTotalBatches}...`, 'warning', "4");
              await waitOrAbort(RATE_LIMIT_WAIT_MS);
              continue;
            }
            log(`⚠️ تعذر إصلاح دفعة رموز ${b + 1}: ${errMsg}`, 'warning', "4");
            b++;
            setProgress({ current: Math.min(b * AI_BATCH, toFix.length), total: toFix.length });
          }
        }

        stats.tagsFixed = fixed;
        log(`✅ أُصلح ${fixed} رمز تالف`, 'success', "4");
      } else {
        log("✅ لا توجد رموز تالفة", 'success', "4");
      }

      setProgress(null);

      // ══════════════════════════════════════════════════════
      // التقرير النهائي (تم حذف مرحلة فحص الجودة لتوفير الرصيد والوقت)
      // ══════════════════════════════════════════════════════
      stats.duration = Math.round((Date.now() - startTime) / 1000);
      setReport(stats);
      setPhase("✅ مكتمل"); setPhaseIndex(5);

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
      userGeminiKey, userGroqKey, userCerebrasKey, userOpenRouterKey, myMemoryEmail, rebalanceNewlines,
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
