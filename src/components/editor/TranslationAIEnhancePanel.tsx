import React, { useState, useRef, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sparkles, Loader2, Check, X, AlertTriangle, BookOpen, Wand2, Square,
  RotateCcw, Type, Search, Zap, Eye, Copy, ArrowRight, Filter, Download,
  Pencil, Undo2, ChevronDown, ChevronUp, FileText, Trash2, Upload,
  FolderOpen, Shield,
} from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  loadReviewMemory, markReviewed, exportReviewMemory,
  importReviewMemory, clearReviewMemory, isReviewedSync, type ReviewMemory,
} from "@/lib/enhance-memory";
import { backTranslateBatch, wordsJaccard, orderOverlap, isOrderComparable } from "@/lib/back-translate";
import type { ExtractedEntry } from "./types";
import { EnhanceRulesDialog } from "./EnhanceRulesDialog";
import {
  loadEnabledRules, loadCustomRules, loadBuiltinOverrides,
  type EnhanceRuleId, type EnhanceRule, type BuiltinOverride,
} from "@/lib/enhance-rules";

interface TranslationAIEnhancePanelProps {
  entries: ExtractedEntry[];
  translations: Record<string, string>;
  onApplySuggestion: (key: string, newText: string) => void;
  glossary?: string;
}

interface EnhanceSuggestion {
  key: string;
  original: string;
  current: string;
  suggested: string;
  /** Alternative suggestions from the AI (up to 2). */
  alternatives?: string[];
  /** Short reason (one line). */
  reason: string;
  /** Optional detailed explanation of WHY this is a problem. */
  detail?: string;
  /** Explanation of the fix and why it solves the problem (combined mode). */
  fixExplanation?: string;
  type: "style" | "grammar" | "accuracy" | "consistency" | "missing_char" | "terminology" | "punctuation";
}

interface GrammarIssue {
  key: string;
  original: string;
  translation: string;
  issue: string;
  suggestion: string;
  severity?: "high" | "medium" | "low";
  /** Optional detailed explanation of WHY this is a problem. */
  detail?: string;
  /** Explanation of the fix and why it solves the problem. */
  fixExplanation?: string;
  /** Issue category: wrong = خاطئة، reorder = ترتيب غير صحيح، weak = ركيكة */
  category?: "wrong" | "reorder" | "weak";
}

type GrammarCategory = "wrong" | "reorder" | "weak";

type Scope = "all" | "short" | "long" | "with_tags" | "no_arabic";

const BATCH_SIZE = 50;
const PARALLEL_REQUESTS = 3;

interface ModelOption { value: string; label: string; group: "google" | "openai" | "deepseek" | "local" | "free"; }

const MODEL_OPTIONS: ModelOption[] = [
  { value: "google-translate-check", label: "Google Translate — فحص دقة (مجاني)", group: "free" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview (سريع — مُوصى)", group: "google" },
  { value: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview (دقة عالية)", group: "google" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (متوازن)", group: "google" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (الأخف والأرخص)", group: "google" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (دقة عالية، أبطأ)", group: "google" },
  { value: "gpt-5", label: "GPT-5 (دقة قصوى)", group: "openai" },
  { value: "gpt-5-mini", label: "GPT-5 mini (متوازن — أرخص)", group: "openai" },
  { value: "gpt-5-nano", label: "GPT-5 nano (الأسرع — الأرخص)", group: "openai" },
  { value: "deepseek-v4-flash", label: "🐋 DeepSeek V4 Flash (284B/13B — اقتصادي)", group: "deepseek" },
  { value: "deepseek-v4-pro", label: "🐋 DeepSeek V4 Pro (1.6T/49B — الأقوى)", group: "deepseek" },
];

const GOOGLE_CHECK_CONCURRENCY = 3;
// Rule 1 thresholds: words present but order broken.
const GOOGLE_PRESENCE_THRESHOLD = 0.7;
const GOOGLE_ORDER_THRESHOLD = 0.4;

// Tag patterns reused from local-enhance-scanner so Google check can detect
// translations that dropped technical markers from the original English.
const GOOGLE_TAG_RE = /\[[A-Z][^\]]*\]/g;
const GOOGLE_PUA_RE = /[\uE000-\uF8FF\uFFF9-\uFFFC]/g;

// --- Diff helpers: word-level + sentence-level ---
function splitTokens(s: string, mode: "word" | "sentence"): string[] {
  if (mode === "sentence") {
    // Split on . ! ? ؟ ، ؛ : newlines while keeping the delimiter attached
    return s.split(/(?<=[.!?؟،؛:\n])\s+/).filter(t => t.length > 0);
  }
  return s.split(/(\s+)/);
}

function diffTokens(a: string, b: string, mode: "word" | "sentence"): { type: "same" | "del" | "add"; text: string }[] {
  const aw = splitTokens(a, mode);
  const bw = splitTokens(b, mode);
  const m = aw.length, n = bw.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = aw[i] === bw[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: { type: "same" | "del" | "add"; text: string }[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (aw[i] === bw[j]) { out.push({ type: "same", text: aw[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", text: aw[i] }); i++; }
    else { out.push({ type: "add", text: bw[j] }); j++; }
  }
  while (i < m) { out.push({ type: "del", text: aw[i++] }); }
  while (j < n) { out.push({ type: "add", text: bw[j++] }); }
  return out;
}

const DiffView: React.FC<{ before: string; after: string; mode?: "word" | "sentence" }> = ({ before, after, mode = "word" }) => {
  const parts = useMemo(() => diffTokens(before, after, mode), [before, after, mode]);
  const sep = mode === "sentence" ? " " : "";
  return (
    <div
      className="text-sm leading-relaxed font-body whitespace-pre-wrap [overflow-wrap:anywhere] [word-break:break-word] max-w-full"
      dir="rtl"
    >
      {parts.map((p, i) =>
        p.type === "same" ? (
          <span key={i}>{p.text}{sep}</span>
        ) : p.type === "del" ? (
          <span key={i} className="bg-red-500/20 line-through text-red-600 rounded px-0.5 mx-px inline">
            {p.text}{sep}
          </span>
        ) : (
          <span key={i} className="bg-green-500/20 text-green-700 rounded px-0.5 mx-px inline">
            {p.text}{sep}
          </span>
        )
      )}
    </div>
  );
};

const TranslationAIEnhancePanel: React.FC<TranslationAIEnhancePanelProps> = ({
  entries,
  translations,
  onApplySuggestion,
  glossary,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<EnhanceSuggestion[]>([]);
  const [grammarIssues, setGrammarIssues] = useState<GrammarIssue[]>([]);
  const [activeTab, setActiveTab] = useState<string>("enhance");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<GrammarCategory | null>(null);
  const [processedCount, setProcessedCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [model, setModel] = useState<string>("gemini-3-flash-preview");
  const [showDiff, setShowDiff] = useState(true);
  const [diffMode, setDiffMode] = useState<"word" | "sentence">("word");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showRulesDialog, setShowRulesDialog] = useState(false);
  const [enabledRules, setEnabledRules] = useState<Set<EnhanceRuleId>>(() => loadEnabledRules());
  const [customRules, setCustomRules] = useState<EnhanceRule[]>(() => loadCustomRules());
  // تعديلات المستخدم على prompts القواعد المبنيّة. تُرسل إلى الـedge function
  // حتى يُطبّقها على نسخته المثبّتة من RULES قبل إرسالها للـAI.
  const [builtinOverrides, setBuiltinOverrides] = useState<Record<string, BuiltinOverride>>(() => loadBuiltinOverrides());
  const [appliedHistory, setAppliedHistory] = useState<{ key: string; previous: string; applied: string; ts: number }[]>([]);
  const [deepSeekThinking, setDeepSeekThinking] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('xc1_deepseek_thinking');
      return v === null ? true : v === 'true';
    } catch {
      return true;
    }
  });

  React.useEffect(() => {
    try { localStorage.setItem('xc1_deepseek_thinking', String(deepSeekThinking)); } catch { /* quota or disabled */ }
  }, [deepSeekThinking]);

  const [reviewMem, setReviewMem] = useState<ReviewMemory>({ approved: {}, dismissed: {} });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const abortRef = useRef(false);
  /** Aborts in-flight Supabase function calls when the user clicks Stop. */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Maps key → translation text at the time of last scan. */
  const processedKeysRef = useRef<Map<string, string>>(new Map());

  // Load persistent review memory once
  React.useEffect(() => {
    loadReviewMemory().then(setReviewMem);
  }, []);

  const resetProcessedKeys = useCallback(() => {
    processedKeysRef.current = new Map();
    setProcessedCount(0);
  }, []);

  // ----- Scope filter for which entries are sent to AI -----
  const scopeFilter = useCallback((e: ExtractedEntry, t: string): boolean => {
    if (!t?.trim()) return false;
    const key = `${e.msbtFile}:${e.index}`;
    // Skip already-reviewed entries (approved or dismissed) if translation unchanged
    if (isReviewedSync(reviewMem, key, t)) return false;
    switch (scope) {
      case "short": return t.length < 30;
      case "long": return t.length >= 100;
      case "with_tags": return /[\uE000-\uF8FF]|\[[A-Z][^\]]*\]/.test(e.original);
      case "no_arabic": return !/[\u0600-\u06FF]/.test(t);
      default: return true;
    }
  }, [scope, reviewMem]);

  const analyzeTranslations = async (mode: "enhance" | "grammar" | "combined") => {
    // Detect entries that changed since last scan and clear stale results
    const changedKeys = new Set<string>();
    for (const [key, oldText] of processedKeysRef.current) {
      const current = translations[key];
      if (current !== oldText) {
        changedKeys.add(key);
        processedKeysRef.current.delete(key);
      }
    }
    if (changedKeys.size > 0) {
      setSuggestions(prev => prev.filter(s => !changedKeys.has(s.key)));
      setGrammarIssues(prev => prev.filter(g => !changedKeys.has(g.key)));
    }

    const translatedEntries = entries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      const t = translations[key];
      return t?.trim() && !processedKeysRef.current.has(key) && scopeFilter(e, t);
    });

    if (translatedEntries.length === 0) {
      toast({
        title: "لا توجد نصوص جديدة للفحص",
        description: changedKeys.size > 0
          ? `تم إزالة ${changedKeys.size} نتيجة قديمة لنصوص تغيّرت. اضغط فحص مرة أخرى.`
          : "جرب تغيير النطاق أو اضغط 🔄 لإعادة الفحص",
      });
      return;
    }

    setIsAnalyzing(true);
    setLastError(null); // امسح خطأ التشغيل السابق عند بدء تشغيل جديد.
    // الفحص الشامل يملأ كلا التبويبين — ابدأ بتبويب القواعد لأنّ الأخطاء الجوهريّة أولويّة.
    setActiveTab(mode === "combined" ? "grammar" : mode);
    abortRef.current = false;
    // أنشئ AbortController جديد لهذه الجلسة حتّى يقتل stopAnalysis الطلبات الجارية فوراً.
    abortControllerRef.current = new AbortController();
    const abortSignal = abortControllerRef.current.signal;

    // ----- Google Translate accuracy check (free, no API key) -----
    if (model === "google-translate-check") {
      const inputs = translatedEntries.map(e => ({
        key: `${e.msbtFile}:${e.index}`,
        original: e.original,
        translation: translations[`${e.msbtFile}:${e.index}`],
      }));

      setProgress({ current: 0, total: inputs.length });
      setActiveTab("grammar");

      // Rule 2: local pre-check for missing technical tags. Runs before the
      // back-translation and does not need network access.
      const preCheckIssues: GrammarIssue[] = [];
      for (const entry of inputs) {
        const origTags = (entry.original.match(GOOGLE_TAG_RE) || []).length;
        const transTags = (entry.translation.match(GOOGLE_TAG_RE) || []).length;
        const origPua = (entry.original.match(GOOGLE_PUA_RE) || []).length;
        const transPua = (entry.translation.match(GOOGLE_PUA_RE) || []).length;
        const missingTags = Math.max(0, origTags - transTags);
        const missingPua = Math.max(0, origPua - transPua);
        if (missingTags === 0 && missingPua === 0) continue;
        const parts: string[] = [];
        if (missingTags > 0) parts.push(`${missingTags} وسم/وسوم [Tag]`);
        if (missingPua > 0) parts.push(`${missingPua} رمز PUA`);
        preCheckIssues.push({
          key: entry.key, original: entry.original, translation: entry.translation,
          issue: `وسوم تقنية مفقودة (${parts.join(' + ')})`,
          suggestion: entry.translation, severity: "high",
          detail:
            `الأصل الإنجليزي يحوي ${origTags} وسماً [Tag] و ${origPua} رمز PUA.\n` +
            `الترجمة العربية تحوي ${transTags} وسماً و ${transPua} رمز PUA.\n` +
            `فقد الوسوم يكسر التحكّم في الألوان أو المتغيّرات داخل النص. أضف الوسوم الناقصة قبل الاستمرار.`,
        });
      }
      if (preCheckIssues.length > 0) setGrammarIssues(prev => [...prev, ...preCheckIssues]);

      const arabicTexts = inputs.map(i => i.translation);
      let failedCount = 0;
      let okCount = 0;
      let totalIssues = preCheckIssues.length;

      await backTranslateBatch(
        arabicTexts,
        GOOGLE_CHECK_CONCURRENCY,
        (done, total) => {
          if (abortRef.current) return;
          setProgress({ current: done, total });
        },
        () => abortRef.current,
        (chunkResults, startIdx) => {
          if (abortRef.current) return;
          const newIssues: GrammarIssue[] = [];
          for (let j = 0; j < chunkResults.length; j++) {
            const entry = inputs[startIdx + j];
            const result = chunkResults[j];
            if (!result || result.error || !result.english) {
              failedCount++;
              continue;
            }
            okCount++;
            processedKeysRef.current.set(entry.key, entry.translation);

            // Rule 1: words present but order broken — the only post-back-translation rule.
            // Skip when either side has < 3 tokens; bigram overlap is meaningless there
            // and would falsely flag single-word translations (e.g. "Someday...").
            if (!isOrderComparable(entry.original, result.english)) continue;
            const presence = wordsJaccard(entry.original, result.english);
            const order = orderOverlap(entry.original, result.english);
            if (presence >= GOOGLE_PRESENCE_THRESHOLD && order < GOOGLE_ORDER_THRESHOLD) {
              totalIssues++;
              const presPct = Math.round(presence * 100);
              const ordPct = Math.round(order * 100);
              newIssues.push({
                key: entry.key, original: entry.original, translation: entry.translation,
                issue: `ترتيب غير صحيح — الكلمات موجودة لكن مرتّبة خاطئاً`,
                suggestion: entry.translation, severity: "medium",
                detail:
                  `الترجمة العكسية لـ Google: «${result.english}»\n` +
                  `الكلمات موجودة (${presPct}%) لكن ترتيبها مكسور (${ordPct}% فقط من تتابع الكلمات يطابق الأصل).\n` +
                  `المعنى مختلّ — راجع ترتيب الجملة.`,
              });
            }
          }
          if (newIssues.length > 0) {
            setGrammarIssues(prev => [...prev, ...newIssues]);
          }
          setProcessedCount(processedKeysRef.current.size);
        },
      );

      setIsAnalyzing(false);
      setProgress(null);

      if (abortRef.current) return;

      if (failedCount === inputs.length) {
        toast({
          title: "❌ فشل فحص Google",
          description: "تعذّر الاتصال بـ Google Translate (CORS أو شبكة). جرّب محرّكاً آخر.",
          variant: "destructive",
        });
      } else {
        toast({
          title: totalIssues > 0
            ? `🔍 Google: ${totalIssues} ترجمة بحاجة مراجعة`
            : `✅ لا وسوم مفقودة ولا أخطاء ترتيب`,
          description: failedCount > 0
            ? `تم فحص ${okCount} بنجاح • فشل ${failedCount} • ${totalIssues} مشكلة`
            : `تم فحص ${okCount} ترجمة • ${totalIssues} مشكلة`,
        });
      }
      return;
    }

    setProgress({ current: 0, total: translatedEntries.length });

    let allSuggestions: EnhanceSuggestion[] = [];
    let allIssues: GrammarIssue[] = [];
    let processed = 0;

    const batches: { textsToAnalyze: { key: string; original: string; translation: string }[] }[] = [];
    for (let i = 0; i < translatedEntries.length; i += BATCH_SIZE) {
      const batch = translatedEntries.slice(i, i + BATCH_SIZE);
      batches.push({
        textsToAnalyze: batch.map(e => ({
          key: `${e.msbtFile}:${e.index}`,
          original: e.original,
          translation: translations[`${e.msbtFile}:${e.index}`],
        })),
      });
    }

    // مفتاح DeepSeek مخزَّن في إعدادات المحرّر؛ نمرّره للدالّة عند اختيار نموذج DeepSeek.
    const deepseekKey = (() => {
      try { return localStorage.getItem('userDeepSeekKey') || ''; } catch { return ''; }
    })();
    const providerApiKey = model.startsWith('deepseek') ? (deepseekKey || undefined) : undefined;

    for (let i = 0; i < batches.length; i += PARALLEL_REQUESTS) {
      if (abortRef.current) break;

      const chunk = batches.slice(i, i + PARALLEL_REQUESTS);
      const promises = chunk.map(async ({ textsToAnalyze }) => {
        try {
          const { data, error } = await supabase.functions.invoke('enhance-translations', {
            body: {
              entries: textsToAnalyze,
              mode,
              glossary, // إرسال القاموس كاملاً — الـ edge function يفرز ويقطع بذكاء
              aiModel: model,
              providerApiKey,
              thinkingMode: model.startsWith('deepseek') ? (deepSeekThinking ? 'enabled' : 'disabled') : undefined,
              enabledRules: Array.from(enabledRules),
              customRules: customRules.map(r => ({ id: r.id, kind: r.kind, prompt: r.prompt })),
              builtinOverrides,
            },
            signal: abortSignal,
          });
          if (error) throw error;
          if (data?.error) {
            // أظهر الخطأ في الأداة وفي toast لضمان رؤيته (الـ toast قد يُفوت).
            setLastError(data.error);
            toast({ title: data.error, variant: "destructive" });
            return { data: null, count: textsToAnalyze.length };
          }
          for (const t of textsToAnalyze) processedKeysRef.current.set(t.key, t.translation);
          setProcessedCount(processedKeysRef.current.size);
          return { data, count: textsToAnalyze.length };
        } catch (err) {
          const errStr = String(err);
          // إذا المستخدم ضغط إيقاف تجاهل الخطأ بصمت (لا تعرض توست ولا تعيد المحاولة).
          if (abortSignal.aborted || (err instanceof Error && err.name === 'AbortError') || errStr.includes('AbortError') || errStr.includes('aborted')) {
            return { data: null, count: textsToAnalyze.length };
          }
          if (errStr.includes('429')) {
            toast({ title: "تم تجاوز حد الطلبات، جاري الانتظار...", variant: "destructive" });
            await new Promise(r => setTimeout(r, 5000));
            if (abortSignal.aborted) return { data: null, count: textsToAnalyze.length };
            try {
              const { data, error: retryError } = await supabase.functions.invoke('enhance-translations', {
                body: { entries: textsToAnalyze, mode, glossary, aiModel: model, providerApiKey, thinkingMode: model.startsWith('deepseek') ? (deepSeekThinking ? 'enabled' : 'disabled') : undefined, enabledRules: Array.from(enabledRules), customRules: customRules.map(r => ({ id: r.id, kind: r.kind, prompt: r.prompt })), builtinOverrides },
                signal: abortSignal,
              });
              if (retryError) throw retryError;
              if (data?.error) {
                setLastError(data.error);
                toast({ title: data.error, variant: "destructive" });
                return { data: null, count: textsToAnalyze.length };
              }
              for (const t of textsToAnalyze) processedKeysRef.current.set(t.key, t.translation);
              setProcessedCount(processedKeysRef.current.size);
              return { data, count: textsToAnalyze.length };
            } catch (retryErr) {
              const msg = `فشل بعد إعادة المحاولة: ${String(retryErr).slice(0, 200)}`;
              setLastError(msg);
              return { data: null, count: textsToAnalyze.length };
            }
          }
          // FunctionsHttpError يحوي Response كاملاً في .context — حاول استخراج
          // رسالة الخطأ الحقيقيّة من جسم الردّ بدلاً من العبارة العامّة.
          let detail = errStr;
          try {
            const ctx = (err as { context?: unknown })?.context;
            if (ctx && typeof (ctx as Response).json === 'function') {
              const body = await (ctx as Response).clone().json();
              if (body?.error) detail = String(body.error);
            }
          } catch { /* ignore body-read failures */ }
          const msg = `فشل الاتصال بـ enhance-translations: ${detail.slice(0, 400)}`;
          setLastError(msg);
          toast({ title: msg, variant: "destructive" });
          return { data: null, count: textsToAnalyze.length };
        }
      });

      const results = await Promise.all(promises);

      for (const { data, count } of results) {
        processed += count;
        if (!data) continue;
        if (mode === "enhance" && data.suggestions) {
          allSuggestions = [...allSuggestions, ...data.suggestions];
          setSuggestions(prev => [...prev, ...data.suggestions]);
        } else if (mode === "grammar" && data.issues) {
          allIssues = [...allIssues, ...data.issues];
          setGrammarIssues(prev => [...prev, ...data.issues]);
        } else if (mode === "combined" && Array.isArray(data.results)) {
          // تقسيم نتائج الفحص الشامل بين التبويبين حسب الفئة:
          // style → لوحة تحسين الصياغة • wrong/reorder/weak → لوحة فحص القواعد.
          const newSuggestions: EnhanceSuggestion[] = [];
          const newIssues: GrammarIssue[] = [];
          for (const r of data.results) {
            if (r.category === "style") {
              newSuggestions.push({
                key: r.key,
                original: r.original,
                current: r.current,
                suggested: r.suggested,
                alternatives: r.alternatives || [],
                reason: r.issue || r.reason || "تحسين صياغة",
                detail: r.detail || "",
                fixExplanation: r.fixExplanation || "",
                type: r.type || "style",
              });
            } else {
              newIssues.push({
                key: r.key,
                original: r.original,
                translation: r.translation,
                issue: r.issue || "إصلاح قواعديّ + صياغة",
                suggestion: r.suggested,
                severity: r.severity,
                detail: r.detail || "",
                fixExplanation: r.fixExplanation || "",
                category: r.category,
              });
            }
          }
          if (newSuggestions.length > 0) {
            allSuggestions = [...allSuggestions, ...newSuggestions];
            setSuggestions(prev => [...prev, ...newSuggestions]);
          }
          if (newIssues.length > 0) {
            allIssues = [...allIssues, ...newIssues];
            setGrammarIssues(prev => [...prev, ...newIssues]);
          }
        }
      }

      setProgress({ current: Math.min(processed, translatedEntries.length), total: translatedEntries.length });
    }

    setIsAnalyzing(false);
    setProgress(null);

    const enhanceCount = allSuggestions.length;
    const grammarCount = allIssues.length;
    const total = mode === "enhance" ? enhanceCount : mode === "grammar" ? grammarCount : enhanceCount + grammarCount;
    if (total === 0 && !abortRef.current) {
      const emptyTitle = mode === "enhance" ? "✅ الترجمات جيدة" : mode === "grammar" ? "✅ لا توجد أخطاء" : "✅ الترجمات سليمة قواعديّاً وأسلوبيّاً";
      toast({ title: emptyTitle });
    } else if (mode === "combined") {
      toast({ title: `تم العثور على ${grammarCount} خطأ + ${enhanceCount} اقتراح` });
    } else {
      toast({ title: `تم العثور على ${total} ${mode === "enhance" ? "اقتراح" : "خطأ"}` });
    }
  };

  const stopAnalysis = () => {
    abortRef.current = true;
    // اقطع الطلبات الجارية فوراً حتّى لا ينتظر المستخدم اكتمال الدفعة الحاليّة.
    abortControllerRef.current?.abort();
    setIsAnalyzing(false);
    setProgress(null);
  };

  const applyOne = (key: string, newText: string) => {
    const previous = translations[key] || "";
    onApplySuggestion(key, newText);
    setAppliedHistory(prev => [{ key, previous, applied: newText, ts: Date.now() }, ...prev].slice(0, 50));
    markReviewed(key, newText, "approved").then(() => loadReviewMemory().then(setReviewMem));
  };

  const applySuggestion = (item: EnhanceSuggestion | GrammarIssue) => {
    const newText = 'suggested' in item ? item.suggested : item.suggestion;
    applyOne(item.key, newText);
    if ('suggested' in item) {
      setSuggestions(prev => prev.filter(s => s.key !== item.key));
    } else {
      setGrammarIssues(prev => prev.filter(g => g.key !== item.key));
    }
  };

  const undoLast = () => {
    const last = appliedHistory[0];
    if (!last) return;
    onApplySuggestion(last.key, last.previous);
    setAppliedHistory(prev => prev.slice(1));
    toast({ title: "↩️ تم التراجع" });
  };

  const startEdit = (key: string, current: string) => {
    setEditingKey(key);
    setEditingText(current);
  };

  const saveEdit = (item: EnhanceSuggestion | GrammarIssue) => {
    applyOne(item.key, editingText);
    setEditingKey(null);
    setEditingText("");
    if ('suggested' in item) {
      setSuggestions(prev => prev.filter(s => s.key !== item.key));
    } else {
      setGrammarIssues(prev => prev.filter(g => g.key !== item.key));
    }
  };

  const applyAll = () => {
    if (activeTab === "enhance") {
      const list = filteredSuggestions;
      for (const s of list) applyOne(s.key, s.suggested);
      toast({ title: `✅ تم تطبيق ${list.length} اقتراح` });
      const keys = new Set(list.map(s => s.key));
      setSuggestions(prev => prev.filter(s => !keys.has(s.key)));
    } else {
      const list = filteredIssues;
      for (const g of list) applyOne(g.key, g.suggestion);
      toast({ title: `✅ تم إصلاح ${list.length} خطأ` });
      const keys = new Set(list.map(g => g.key));
      setGrammarIssues(prev => prev.filter(g => !keys.has(g.key)));
    }
  };

  const dismissSuggestion = (key: string) => {
    const cur = translations[key];
    if (cur) markReviewed(key, cur, "dismissed").then(() => loadReviewMemory().then(setReviewMem));
    setSuggestions(prev => prev.filter(s => s.key !== key));
    setGrammarIssues(prev => prev.filter(g => g.key !== key));
  };

  const handleExportMemory = async () => {
    const json = await exportReviewMemory();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enhance-memory-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "📥 تم تصدير سجل المراجعات" });
  };

  const handleImportMemory = async (file: File) => {
    try {
      const text = await file.text();
      const n = await importReviewMemory(text, "merge");
      const m = await loadReviewMemory();
      setReviewMem(m);
      toast({ title: `✅ تم استيراد ${n} مراجعة` });
    } catch (e) {
      toast({ title: "❌ فشل الاستيراد", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const handleClearMemory = async () => {
    await clearReviewMemory();
    setReviewMem({ approved: {}, dismissed: {} });
    toast({ title: "🗑️ تم مسح سجل المراجعات" });
  };

  const dismissAll = () => {
    if (activeTab === "enhance") {
      const keys = new Set(filteredSuggestions.map(s => s.key));
      setSuggestions(prev => prev.filter(s => !keys.has(s.key)));
    } else {
      const keys = new Set(filteredIssues.map(g => g.key));
      setGrammarIssues(prev => prev.filter(g => !keys.has(g.key)));
    }
    toast({ title: "تم تجاهل النتائج" });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "تم النسخ" });
  };

  const exportCSV = () => {
    const isEnhance = activeTab === "enhance";
    const header = isEnhance
      ? "key,original,current,suggested,reason,type"
      : "key,original,translation,suggestion,issue,severity";
    const rows = isEnhance
      ? filteredSuggestions.map(s => [s.key, s.original, s.current, s.suggested, s.reason, s.type])
      : filteredIssues.map(g => [g.key, g.original, g.translation, g.suggestion, g.issue, g.severity || ""]);
    const csv = "\uFEFF" + [header, ...rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-${activeTab}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "📥 تم التصدير" });
  };

  const typeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    style: { label: "أسلوب", icon: <Wand2 className="w-3 h-3" />, color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
    grammar: { label: "قواعد", icon: <Type className="w-3 h-3" />, color: "bg-red-500/10 text-red-600 border-red-500/20" },
    accuracy: { label: "دقة", icon: <Eye className="w-3 h-3" />, color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    consistency: { label: "اتساق", icon: <Search className="w-3 h-3" />, color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    missing_char: { label: "حرف ناقص", icon: <AlertTriangle className="w-3 h-3" />, color: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
    terminology: { label: "مصطلح", icon: <BookOpen className="w-3 h-3" />, color: "bg-teal-500/10 text-teal-600 border-teal-500/20" },
    punctuation: { label: "ترقيم", icon: <Type className="w-3 h-3" />, color: "bg-pink-500/10 text-pink-600 border-pink-500/20" },
  };

  // ---- Filters + sort by severity (high → medium → low) ----
  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const typeToSeverity: Record<string, number> = {
    missing_char: 0, accuracy: 0, grammar: 0,
    consistency: 1, terminology: 1, punctuation: 1,
    style: 2,
  };

  const filteredSuggestions = useMemo(() => {
    return suggestions
      .filter(s => {
        if (filterType && s.type !== filterType) return false;
        if (searchQuery && !(`${s.key} ${s.original} ${s.current} ${s.suggested} ${s.reason}`).toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => (typeToSeverity[a.type] ?? 2) - (typeToSeverity[b.type] ?? 2));
    // typeToSeverity is a stable record literal (re-created each render but
    // never changes shape); including it would invalidate the memo every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions, filterType, searchQuery]);

  const filteredIssues = useMemo(() => {
    const catOrder: Record<string, number> = { wrong: 0, reorder: 1, weak: 2 };
    return grammarIssues
      .filter(g => {
        if (severityFilter && g.severity !== severityFilter) return false;
        if (categoryFilter && (g.category ?? 'wrong') !== categoryFilter) return false;
        if (searchQuery && !(`${g.key} ${g.original} ${g.translation} ${g.suggestion} ${g.issue}`).toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        const ca = catOrder[a.category ?? 'wrong'] ?? 0;
        const cb = catOrder[b.category ?? 'wrong'] ?? 0;
        if (ca !== cb) return ca - cb;
        return (severityOrder[a.severity ?? 'low'] ?? 2) - (severityOrder[b.severity ?? 'low'] ?? 2);
      });
    // severityOrder is a stable record literal (re-created each render but
    // never changes shape); including it would invalidate the memo every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grammarIssues, severityFilter, categoryFilter, searchQuery]);

  // ---- Group results by MSBT file ----
  const extractFile = (key: string) => key.replace(/:\d+$/, '') || key;

  const groupedSuggestions = useMemo(() => {
    const map = new Map<string, EnhanceSuggestion[]>();
    for (const s of filteredSuggestions) {
      const file = extractFile(s.key);
      const arr = map.get(file);
      if (arr) arr.push(s); else map.set(file, [s]);
    }
    return map;
  }, [filteredSuggestions]);

  const groupedIssues = useMemo(() => {
    const map = new Map<string, GrammarIssue[]>();
    for (const g of filteredIssues) {
      const file = extractFile(g.key);
      const arr = map.get(file);
      if (arr) arr.push(g); else map.set(file, [g]);
    }
    return map;
  }, [filteredIssues]);

  const typeCounts: Record<string, number> = {};
  for (const s of suggestions) typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;

  const severityCounts: Record<string, number> = {};
  for (const g of grammarIssues) {
    const k = g.severity || "medium";
    severityCounts[k] = (severityCounts[k] || 0) + 1;
  }

  const categoryCounts: Record<GrammarCategory, number> = { wrong: 0, reorder: 0, weak: 0 };
  for (const g of grammarIssues) {
    const c = (g.category ?? 'wrong') as GrammarCategory;
    categoryCounts[c] = (categoryCounts[c] || 0) + 1;
  }

  const categoryConfig: Record<GrammarCategory, { label: string; color: string; icon: React.ReactNode; description: string }> = {
    wrong: { label: "خاطئة", color: "bg-red-500/10 text-red-600 border-red-500/30", icon: <X className="w-3 h-3" />, description: "ترجمة غير صحيحة فعلاً" },
    reorder: { label: "ترتيب", color: "bg-amber-500/10 text-amber-600 border-amber-500/30", icon: <ArrowRight className="w-3 h-3" />, description: "صحيحة لكن ترتيب الكلمات غير سليم" },
    weak: { label: "ركيكة", color: "bg-blue-500/10 text-blue-600 border-blue-500/30", icon: <Wand2 className="w-3 h-3" />, description: "مفهومة لكن تحتاج إعادة صياغة" },
  };

  const totalTranslated = entries.filter(e => translations[`${e.msbtFile}:${e.index}`]?.trim()).length;
  const inScopeTotal = entries.filter(e => {
    const t = translations[`${e.msbtFile}:${e.index}`];
    return t?.trim() && scopeFilter(e, t);
  }).length;
  const remaining = inScopeTotal - processedCount;

  const severityConfig: Record<string, { color: string; label: string; bg: string }> = {
    high: { color: "text-red-500", label: "خطير", bg: "bg-red-500/10 border-red-500/20" },
    medium: { color: "text-amber-500", label: "متوسط", bg: "bg-amber-500/10 border-amber-500/20" },
    low: { color: "text-blue-500", label: "بسيط", bg: "bg-blue-500/10 border-blue-500/20" },
  };

  const renderIssueCard = (g: GrammarIssue, i: number) => {
    const isEditing = editingKey === g.key;
    return (
      <div key={`${g.key}-${i}`} className="rounded-xl border border-red-500/20 bg-card p-3 sm:p-4 space-y-2.5 transition-all hover:shadow-sm overflow-hidden">
        {/* Mobile: badges row */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          {(() => {
            const cat = (g.category ?? 'wrong') as GrammarCategory;
            const cc = categoryConfig[cat];
            return (
              <Badge variant="outline" className={`text-[10px] gap-1 ${cc.color}`} title={cc.description}>
                {cc.icon}{cc.label}
              </Badge>
            );
          })()}
          {g.severity && (
            <Badge variant="outline" className={`text-[10px] ${severityConfig[g.severity]?.color}`}>
              {severityConfig[g.severity]?.label}
            </Badge>
          )}
        </div>
        {/* Action buttons row — full width on mobile, sticky on desktop */}
        <div className="grid grid-cols-3 gap-1.5 sm:flex sm:gap-1 sm:justify-end">
          <Button size="sm" variant="outline" className="h-9 sm:h-8 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10" onClick={() => startEdit(g.key, g.suggestion)} title="تعديل">
            <Pencil className="w-3.5 h-3.5" /> <span className="sm:hidden">تعديل</span>
          </Button>
          <Button size="sm" variant="outline" className="h-9 sm:h-8 text-xs gap-1 border-green-500/40 text-green-600 hover:bg-green-500/10" onClick={() => applySuggestion(g)} title="تطبيق">
            <Check className="w-4 h-4" /> <span className="sm:hidden">قبول</span>
          </Button>
          <Button size="sm" variant="outline" className="h-9 sm:h-8 text-xs gap-1 border-destructive/30 text-muted-foreground hover:bg-destructive/10" onClick={() => dismissSuggestion(g.key)} title="تجاهل">
            <X className="w-4 h-4" /> <span className="sm:hidden">رفض</span>
          </Button>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-bold text-red-500 leading-relaxed [overflow-wrap:anywhere] [word-break:break-word]">
            <span className="text-foreground/60 font-normal">المشكلة: </span>{g.issue}
          </p>
          {g.detail && g.detail !== g.issue && (
            <p className="text-xs text-muted-foreground leading-relaxed [overflow-wrap:anywhere] [word-break:break-word]">
              <span className="font-bold text-foreground/70">السبب: </span>{g.detail}
            </p>
          )}
          {g.fixExplanation && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed [overflow-wrap:anywhere] [word-break:break-word] bg-emerald-500/5 border border-emerald-500/15 rounded px-2 py-1">
              <span className="font-bold">الحل المُطبَّق: </span>{g.fixExplanation}
            </p>
          )}
        </div>
        <div dir="ltr" className="text-[10px] text-muted-foreground/70 font-mono truncate" title={g.key}>{g.key}</div>
        <div className="bg-muted/30 rounded-lg p-2.5 overflow-hidden">
          <p className="text-[10px] text-muted-foreground mb-1">النص الأصلي:</p>
          <p className="text-xs text-muted-foreground leading-relaxed [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap" dir="ltr">{g.original}</p>
        </div>
        {showDiff ? (
          <div className="p-2.5 rounded-lg bg-card border">
            <p className="text-[10px] text-muted-foreground mb-1 font-bold">الفرق:</p>
            <DiffView before={g.translation} after={g.suggestion} mode={diffMode} />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="p-2.5 rounded-lg bg-red-500/5 border border-red-500/10 overflow-hidden">
              <p className="text-[10px] text-red-500 mb-1 font-bold">به خطأ:</p>
              <p className="text-sm leading-relaxed [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap" dir="rtl">{g.translation}</p>
            </div>
            <div className="flex items-center justify-center"><ArrowRight className="w-4 h-4 text-muted-foreground rotate-90" /></div>
            <div className="p-2.5 rounded-lg bg-green-500/5 border border-green-500/20 overflow-hidden">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-green-600 font-bold">التصحيح:</p>
                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => copyToClipboard(g.suggestion)}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <p className="text-sm leading-relaxed [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap" dir="rtl">{g.suggestion}</p>
            </div>
          </div>
        )}
        {isEditing && (
          <div className="space-y-2 p-2.5 rounded-lg border border-primary/30 bg-primary/5">
            <p className="text-[10px] text-primary font-bold">تعديل قبل التطبيق:</p>
            <Textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} dir="rtl" className="text-sm min-h-[80px]" />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setEditingKey(null)} className="h-7 text-xs">إلغاء</Button>
              <Button size="sm" onClick={() => saveEdit(g)} className="h-7 text-xs gap-1">
                <Check className="w-3 h-3" /> حفظ وتطبيق
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSuggestionCard = (s: EnhanceSuggestion, i: number) => {
    const config = typeConfig[s.type];
    const isEditing = editingKey === s.key;
    return (
      <div key={`${s.key}-${i}`} className="rounded-xl border bg-card p-3 sm:p-4 space-y-2.5 transition-all hover:shadow-sm overflow-hidden">
        {/* Mobile: badge */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <Badge variant="outline" className={`text-[10px] gap-1 ${config?.color || ''}`}>
            {config?.icon}{config?.label || s.type}
          </Badge>
        </div>
        {/* Action buttons row — full width on mobile */}
        <div className="grid grid-cols-3 gap-1.5 sm:flex sm:gap-1 sm:justify-end">
          <Button size="sm" variant="outline" className="h-9 sm:h-8 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10" onClick={() => startEdit(s.key, s.suggested)} title="تعديل قبل التطبيق">
            <Pencil className="w-3.5 h-3.5" /> <span className="sm:hidden">تعديل</span>
          </Button>
          <Button size="sm" variant="outline" className="h-9 sm:h-8 text-xs gap-1 border-green-500/40 text-green-600 hover:bg-green-500/10" onClick={() => applySuggestion(s)} title="تطبيق">
            <Check className="w-4 h-4" /> <span className="sm:hidden">قبول</span>
          </Button>
          <Button size="sm" variant="outline" className="h-9 sm:h-8 text-xs gap-1 border-destructive/30 text-muted-foreground hover:bg-destructive/10" onClick={() => dismissSuggestion(s.key)} title="تجاهل">
            <X className="w-4 h-4" /> <span className="sm:hidden">رفض</span>
          </Button>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold leading-relaxed [overflow-wrap:anywhere] [word-break:break-word]">{s.reason}</p>
          {s.detail && s.detail !== s.reason && (
            <p className="text-xs text-muted-foreground leading-relaxed [overflow-wrap:anywhere] [word-break:break-word]">
              <span className="font-bold text-foreground/70">لماذا؟ </span>{s.detail}
            </p>
          )}
          {s.fixExplanation && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed [overflow-wrap:anywhere] [word-break:break-word] bg-emerald-500/5 border border-emerald-500/15 rounded px-2 py-1">
              <span className="font-bold">الحل المُطبَّق: </span>{s.fixExplanation}
            </p>
          )}
        </div>
        <div dir="ltr" className="text-[10px] text-muted-foreground/70 font-mono truncate" title={s.key}>{s.key}</div>
        <div className="bg-muted/30 rounded-lg p-2.5 overflow-hidden">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-muted-foreground">النص الأصلي:</p>
            <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => copyToClipboard(s.original)}>
              <Copy className="w-3 h-3" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap" dir="ltr">{s.original}</p>
        </div>
        {showDiff ? (
          <div className="p-2.5 rounded-lg bg-card border">
            <p className="text-[10px] text-muted-foreground mb-1 font-bold">الفرق:</p>
            <DiffView before={s.current} after={s.suggested} mode={diffMode} />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="p-2.5 rounded-lg bg-red-500/5 border border-red-500/10 overflow-hidden">
              <p className="text-[10px] text-red-500 mb-1 font-bold">الحالي:</p>
              <p className="text-sm leading-relaxed [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap" dir="rtl">{s.current}</p>
            </div>
            <div className="flex items-center justify-center"><ArrowRight className="w-4 h-4 text-muted-foreground rotate-90" /></div>
            <div className="p-2.5 rounded-lg bg-green-500/5 border border-green-500/20 overflow-hidden">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-green-600 font-bold">المقترح:</p>
                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => copyToClipboard(s.suggested)}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <p className="text-sm leading-relaxed [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap" dir="rtl">{s.suggested}</p>
            </div>
          </div>
        )}
        {s.alternatives && s.alternatives.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground font-bold">بدائل أخرى:</p>
            {s.alternatives.map((alt, ai) => (
              <div key={ai} className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10 overflow-hidden">
                <p className="text-sm leading-relaxed flex-1 [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap" dir="rtl">{alt}</p>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => copyToClipboard(alt)} title="نسخ">
                    <Copy className="w-3 h-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-green-500 hover:bg-green-500/10" onClick={() => applyOne(s.key, alt)} title="تطبيق هذا البديل">
                    <Check className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {isEditing && (
          <div className="space-y-2 p-2.5 rounded-lg border border-primary/30 bg-primary/5">
            <p className="text-[10px] text-primary font-bold">تعديل قبل التطبيق:</p>
            <Textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} dir="rtl" className="text-sm min-h-[80px]" />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setEditingKey(null)} className="h-7 text-xs">إلغاء</Button>
              <Button size="sm" onClick={() => saveEdit(s)} className="h-7 text-xs gap-1">
                <Check className="w-3 h-3" /> حفظ وتطبيق
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 justify-between">
          <span className="flex items-center gap-2 min-w-0 flex-1">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate">تحسين الترجمة بالذكاء الاصطناعي</span>
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => setShowRulesDialog(true)}
              title="قواعد الذكاء الاصطناعي"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>القواعد</span>
              <Badge variant="secondary" className="h-4 px-1 text-[9px]">{enabledRules.size}</Badge>
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSettings(s => !s)} title="إعدادات">
              {showSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </CardTitle>

        {/* Rules dialog */}
        <EnhanceRulesDialog
          open={showRulesDialog}
          onOpenChange={setShowRulesDialog}
          onSaved={(enabled, allRules) => {
            setEnabledRules(enabled);
            setCustomRules(allRules.filter(r => r.custom));
            // أعد تحميل overrides بعد الحفظ حتى يجري إرسالها للـAI في الطلبات التالية.
            setBuiltinOverrides(loadBuiltinOverrides());
          }}
        />



        {/* Stats bar */}
        <div className="flex items-center gap-4 mt-2 flex-wrap">
          <div className="flex gap-3 text-[11px] text-muted-foreground flex-1 flex-wrap">
            <span>إجمالي: <strong className="text-foreground">{totalTranslated}</strong></span>
            <span>في النطاق: <strong className="text-foreground">{inScopeTotal}</strong></span>
            <span>تم فحصه: <strong className="text-foreground">{processedCount}</strong></span>
            <span>متبقي: <strong className={remaining > 0 ? "text-primary" : "text-green-500"}>{remaining}</strong></span>
          </div>
          {suggestions.length + grammarIssues.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {suggestions.length + grammarIssues.length} نتيجة
            </Badge>
          )}
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="mt-3 p-3 rounded-lg border bg-muted/20 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">النموذج</label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel className="text-[10px]">مجاني</SelectLabel>
                      {MODEL_OPTIONS.filter(m => m.group === "free").map(m => <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>)}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="text-[10px]">Google Gemini</SelectLabel>
                      {MODEL_OPTIONS.filter(m => m.group === "google").map(m => <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>)}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="text-[10px]">OpenAI</SelectLabel>
                      {MODEL_OPTIONS.filter(m => m.group === "openai").map(m => <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>)}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="text-[10px]">DeepSeek</SelectLabel>
                      {MODEL_OPTIONS.filter(m => m.group === "deepseek").map(m => <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">نطاق الفحص</label>
                <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">كل الترجمات</SelectItem>
                    <SelectItem value="short" className="text-xs">قصيرة فقط (&lt; 30)</SelectItem>
                    <SelectItem value="long" className="text-xs">طويلة فقط (&ge; 100)</SelectItem>
                    <SelectItem value="with_tags" className="text-xs">تحتوي على وسوم</SelectItem>
                    <SelectItem value="no_arabic" className="text-xs">لا تحتوي عربية</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {model.startsWith('deepseek') && (
              <label className="flex items-center gap-2 text-xs cursor-pointer pt-1" dir="rtl">
                <input
                  type="checkbox"
                  checked={deepSeekThinking}
                  onChange={(e) => setDeepSeekThinking(e.target.checked)}
                  className="accent-primary"
                />
                <span>
                  🧠 وضع التفكير العميق
                  <span className="text-[10px] text-muted-foreground mr-2">
                    {deepSeekThinking ? '(أدقّ لكن أبطأ 4-8×)' : '(سريع وأرخص — جودة جيّدة لمعظم الحالات)'}
                  </span>
                </span>
              </label>
            )}
            <label className="flex items-center gap-2 text-xs cursor-pointer pt-1">
              <input type="checkbox" checked={showDiff} onChange={(e) => setShowDiff(e.target.checked)} className="accent-primary" />
              عرض الفروقات (Diff) ملوّنة
            </label>
            {showDiff && (
              <div className="flex items-center gap-1.5 pr-5">
                <span className="text-[10px] text-muted-foreground">طريقة المقارنة:</span>
                <Button size="sm" variant={diffMode === "word" ? "default" : "outline"} className="h-6 px-2 text-[10px]" onClick={() => setDiffMode("word")}>
                  بالكلمات
                </Button>
                <Button size="sm" variant={diffMode === "sentence" ? "default" : "outline"} className="h-6 px-2 text-[10px]" onClick={() => setDiffMode("sentence")}>
                  بالجمل
                </Button>
              </div>
            )}

            <div className="border-t pt-2 space-y-1.5">
              <p className="text-[10px] text-muted-foreground">
                سجل المراجعات: <strong>{Object.keys(reviewMem.approved).length}</strong> معتمدة، <strong>{Object.keys(reviewMem.dismissed).length}</strong> متجاهلة
                <span className="block">— يتم تخطيها تلقائياً في الفحوص القادمة طالما الترجمة لم تتغير</span>
              </p>
              <div className="flex gap-1.5 flex-wrap">
                <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={handleExportMemory}>
                  <Download className="w-3 h-3" /> تصدير السجل
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-3 h-3" /> استيراد
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1 text-destructive" onClick={handleClearMemory}>
                  <Trash2 className="w-3 h-3" /> مسح
                </Button>
                <input ref={fileInputRef} type="file" accept="application/json" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportMemory(f); e.target.value = ""; }} />
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Inline error banner — أظهر أسباب الفشل داخل الأداة (ليس فقط toast) */}
        {lastError && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-xs">
              <p className="font-bold mb-1">فشل الفحص</p>
              <p className="break-words" dir="auto">{lastError}</p>
            </div>
            <button onClick={() => setLastError(null)} className="text-destructive/70 hover:text-destructive" aria-label="أغلق">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowRulesDialog(true)} className="gap-1.5 h-10 border-primary/30 text-primary hover:bg-primary/10">
            <Shield className="w-4 h-4" />
            <div className="text-right">
              <p className="text-xs font-bold">قواعد التحسين</p>
              <p className="text-[10px] text-muted-foreground">{enabledRules.size} مفعّلة</p>
            </div>
          </Button>
          <Button variant="default" size="sm" onClick={() => analyzeTranslations("combined")} disabled={isAnalyzing} className="gap-1.5 h-10">
            {isAnalyzing && activeTab === "grammar" && suggestions.length > 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <div className="text-right">
              <p className="text-xs font-bold">فحص شامل (قواعد + صياغة)</p>
              <p className="text-[10px] opacity-80">طلب واحد — يوفّر النقاط</p>
            </div>
          </Button>
          <Button variant="outline" size="sm" onClick={() => analyzeTranslations("enhance")} disabled={isAnalyzing} className="gap-1.5 h-10">
            {isAnalyzing && activeTab === "enhance" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            <div className="text-right">
              <p className="text-xs font-bold">تحسين الصياغة</p>
              <p className="text-[10px] text-muted-foreground">أسلوب + مصطلحات + دقة</p>
            </div>
          </Button>
          <Button variant="outline" size="sm" onClick={() => analyzeTranslations("grammar")} disabled={isAnalyzing} className="gap-1.5 h-10">
            {isAnalyzing && activeTab === "grammar" ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
            <div className="text-right">
              <p className="text-xs font-bold">فحص القواعد</p>
              <p className="text-[10px] text-muted-foreground">إملاء + نحو + ترقيم</p>
            </div>
          </Button>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2 flex-wrap">
          {isAnalyzing && (
            <Button variant="destructive" size="sm" onClick={stopAnalysis} className="gap-1.5">
              <Square className="w-3 h-3" /> إيقاف
            </Button>
          )}
          {!isAnalyzing && processedCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { resetProcessedKeys(); setSuggestions([]); setGrammarIssues([]); setFilterType(null); setSeverityFilter(null); }} className="gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> إعادة فحص
            </Button>
          )}
          {appliedHistory.length > 0 && (
            <Button variant="ghost" size="sm" onClick={undoLast} className="gap-1.5" title="تراجع آخر إصلاح">
              <Undo2 className="w-3.5 h-3.5" /> تراجع ({appliedHistory.length})
            </Button>
          )}
          {(suggestions.length > 0 || grammarIssues.length > 0) && !isAnalyzing && (
            <>
              <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1.5" title="تصدير CSV">
                <Download className="w-3.5 h-3.5" /> CSV
              </Button>
              <Button size="sm" variant="ghost" onClick={dismissAll} className="gap-1.5 text-muted-foreground" title="تجاهل المعروض">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="default" onClick={applyAll} className="gap-1.5 mr-auto">
                <Zap className="w-4 h-4" />
                تطبيق الكل ({activeTab === "enhance" ? filteredSuggestions.length : filteredIssues.length})
              </Button>
            </>
          )}
        </div>

        {/* Progress bar */}
        {progress && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>جاري الفحص...</span>
              <span className="font-mono">{progress.current} / {progress.total}</span>
            </div>
            <Progress value={(progress.current / progress.total) * 100} className="h-2" />
          </div>
        )}

        {/* Search inside results */}
        {(suggestions.length > 0 || grammarIssues.length > 0) && (
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="ابحث داخل النتائج..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-xs pr-8"
            />
          </div>
        )}

        {/* Type filter (enhance) */}
        {suggestions.length > 0 && activeTab === "enhance" && (
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={filterType === null ? "default" : "outline"} className="cursor-pointer text-[10px]" onClick={() => setFilterType(null)}>
              الكل ({suggestions.length})
            </Badge>
            {Object.entries(typeCounts).map(([type, count]) => {
              const config = typeConfig[type];
              return (
                <Badge key={type} variant={filterType === type ? "default" : "outline"}
                  className={`cursor-pointer text-[10px] gap-1 ${filterType !== type ? config?.color || '' : ''}`}
                  onClick={() => setFilterType(filterType === type ? null : type)}>
                  {config?.icon}{config?.label || type} ({count})
                </Badge>
              );
            })}
          </div>
        )}

        {/* Category filter (grammar) — wrong / reorder / weak */}
        {grammarIssues.length > 0 && activeTab === "grammar" && (
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={categoryFilter === null ? "default" : "outline"} className="cursor-pointer text-[10px]" onClick={() => setCategoryFilter(null)}>
              كل الفئات ({grammarIssues.length})
            </Badge>
            {(['wrong', 'reorder', 'weak'] as GrammarCategory[]).map(cat => categoryCounts[cat] ? (
              <Badge key={cat} variant={categoryFilter === cat ? "default" : "outline"}
                className={`cursor-pointer text-[10px] gap-1 ${categoryFilter !== cat ? categoryConfig[cat].color : ''}`}
                title={categoryConfig[cat].description}
                onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}>
                {categoryConfig[cat].icon}{categoryConfig[cat].label} ({categoryCounts[cat]})
              </Badge>
            ) : null)}
          </div>
        )}

        {/* Severity filter (grammar) */}
        {grammarIssues.length > 0 && activeTab === "grammar" && (
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={severityFilter === null ? "default" : "outline"} className="cursor-pointer text-[10px]" onClick={() => setSeverityFilter(null)}>
              الكل ({grammarIssues.length})
            </Badge>
            {(["high", "medium", "low"] as const).map(sev => severityCounts[sev] ? (
              <Badge key={sev} variant={severityFilter === sev ? "default" : "outline"}
                className={`cursor-pointer text-[10px] gap-1 ${severityFilter !== sev ? severityConfig[sev].bg : ''}`}
                onClick={() => setSeverityFilter(severityFilter === sev ? null : sev)}>
                {severityConfig[sev].label} ({severityCounts[sev]})
              </Badge>
            ) : null)}
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full h-11 sm:h-9">
            <TabsTrigger value="enhance" className="flex-1 text-xs gap-1">
              <Wand2 className="w-3 h-3" /> تحسينات
              {suggestions.length > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1">{suggestions.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="grammar" className="flex-1 text-xs gap-1">
              <BookOpen className="w-3 h-3" /> أخطاء
              {grammarIssues.length > 0 && <Badge variant="destructive" className="text-[10px] h-4 px-1">{grammarIssues.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* === Enhance results === */}
          <TabsContent value="enhance">
            {filteredSuggestions.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3 pr-1">
                  {groupedSuggestions.size <= 1
                    ? filteredSuggestions.map((s, i) => renderSuggestionCard(s, i))
                    : Array.from(groupedSuggestions.entries()).map(([file, items]) => (
                      <Collapsible key={file} defaultOpen>
                        <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-right">
                          <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium truncate flex-1" dir="ltr">{file}</span>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">{items.length}</Badge>
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-3 mt-2">
                          {items.map((s, i) => renderSuggestionCard(s, i))}
                        </CollapsibleContent>
                      </Collapsible>
                    ))
                  }
                </div>
              </ScrollArea>
            ) : (
              !isAnalyzing && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Wand2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>{suggestions.length === 0 ? "اضغط 'تحسين الصياغة' لفحص الترجمات" : "لا توجد نتائج لهذا الفلتر"}</p>
                </div>
              )
            )}
          </TabsContent>

          {/* === Grammar results === */}
          <TabsContent value="grammar">
            {filteredIssues.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3 pr-1">
                  {groupedIssues.size <= 1
                    ? filteredIssues.map((g, i) => renderIssueCard(g, i))
                    : Array.from(groupedIssues.entries()).map(([file, items]) => (
                      <Collapsible key={file} defaultOpen>
                        <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-right">
                          <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium truncate flex-1" dir="ltr">{file}</span>
                          <Badge variant="destructive" className="text-[10px] h-4 px-1.5 shrink-0">{items.length}</Badge>
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-3 mt-2">
                          {items.map((g, i) => renderIssueCard(g, i))}
                        </CollapsibleContent>
                      </Collapsible>
                    ))
                  }
                </div>
              </ScrollArea>
            ) : (
              !isAnalyzing && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>اضغط 'فحص القواعد' للبحث عن أخطاء إملائية ونحوية</p>
                </div>
              )
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default TranslationAIEnhancePanel;
