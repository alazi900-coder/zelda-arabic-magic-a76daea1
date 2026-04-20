import React, { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { ExtractedEntry } from "./types";
import {
  Sparkles, Loader2, CheckCircle2, AlertTriangle, BookOpen, Wand2,
  RotateCcw, Type, ChevronDown, ChevronUp, Check, X, Eye,
} from "lucide-react";

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
  reason: string;
  type: string;
}

interface GrammarIssue {
  key: string;
  original: string;
  translation: string;
  issue: string;
  suggestion: string;
  severity: "high" | "medium" | "low";
}

const BATCH_SIZE = 25;

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  style:       { label: "أسلوب",     color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  grammar:     { label: "قواعد",     color: "bg-red-500/15 text-red-400 border-red-500/30" },
  accuracy:    { label: "دقة",       color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  consistency: { label: "اتساق",     color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  missing_char:{ label: "حرف ناقص", color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  terminology: { label: "مصطلح",    color: "bg-teal-500/15 text-teal-400 border-teal-500/30" },
  punctuation: { label: "ترقيم",    color: "bg-pink-500/15 text-pink-400 border-pink-500/30" },
};

const SEV_CONFIG = {
  high:   { label: "خطير", color: "text-red-400" },
  medium: { label: "متوسط", color: "text-amber-400" },
  low:    { label: "بسيط",  color: "text-blue-400" },
};

/** Single result card — works for both suggestions and grammar issues */
function ResultCard({
  item,
  onApply,
  onDismiss,
}: {
  item: EnhanceSuggestion | GrammarIssue;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isSugg = "suggested" in item;
  const newText = isSugg ? item.suggested : item.suggestion;
  const label = isSugg
    ? (TYPE_CONFIG[item.type]?.label ?? item.type)
    : SEV_CONFIG[(item as GrammarIssue).severity]?.label ?? "متوسط";
  const color = isSugg
    ? (TYPE_CONFIG[item.type]?.color ?? "bg-muted text-muted-foreground border-border")
    : (SEV_CONFIG[(item as GrammarIssue).severity]?.color ?? "text-amber-400");

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none active:bg-muted/50"
        onClick={() => setExpanded(v => !v)}
      >
        <Badge variant="outline" className={`text-[10px] shrink-0 px-1.5 py-0.5 ${isSugg ? color : ""}`}>
          {isSugg ? label : <span className={color}>{label}</span>}
        </Badge>
        <p className="flex-1 text-xs text-foreground truncate font-body" dir="rtl">
          {newText}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onApply(); }}
            className="w-7 h-7 rounded-full bg-green-500/15 hover:bg-green-500/25 flex items-center justify-center transition-colors"
          >
            <Check className="w-3.5 h-3.5 text-green-400" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDismiss(); }}
            className="w-7 h-7 rounded-full bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center transition-colors"
          >
            <X className="w-3.5 h-3.5 text-destructive" />
          </button>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
          <div className="rounded-lg bg-muted/40 px-2.5 py-2">
            <p className="text-[10px] text-muted-foreground mb-0.5">الأصل الإنجليزي</p>
            <p className="text-xs font-body text-foreground" dir="ltr">{item.original}</p>
          </div>
          <div className="rounded-lg bg-muted/40 px-2.5 py-2">
            <p className="text-[10px] text-muted-foreground mb-0.5">الترجمة الحالية</p>
            <p className="text-xs font-body text-foreground" dir="rtl">
              {isSugg ? item.current : item.translation}
            </p>
          </div>
          <div className="rounded-lg bg-green-500/8 border border-green-500/20 px-2.5 py-2">
            <p className="text-[10px] text-green-400 mb-0.5">المقترح</p>
            <p className="text-xs font-body text-foreground" dir="rtl">{newText}</p>
          </div>
          {(isSugg ? item.reason : (item as GrammarIssue).issue) && (
            <p className="text-[10px] text-muted-foreground font-body px-1" dir="rtl">
              💡 {isSugg ? item.reason : (item as GrammarIssue).issue}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const TranslationAIEnhancePanel: React.FC<TranslationAIEnhancePanelProps> = ({
  entries, translations, onApplySuggestion, glossary,
}) => {
  const [isAnalyzing, setIsAnalyzing]   = useState(false);
  const [mode, setMode]                 = useState<"enhance" | "grammar">("enhance");
  const [suggestions, setSuggestions]   = useState<EnhanceSuggestion[]>([]);
  const [grammarIssues, setGrammarIssues] = useState<GrammarIssue[]>([]);
  const [progress, setProgress]         = useState<{ current: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const abortRef = useRef(false);
  const processedRef = useRef<Set<string>>(new Set());
  const [processedCount, setProcessedCount] = useState(0);

  const translatedEntries = entries.filter(e => {
    const key = `${e.msbtFile}:${e.index}`;
    return !!translations[key]?.trim();
  });
  const totalTranslated = translatedEntries.length;
  const remaining = totalTranslated - processedCount;

  const reset = useCallback(() => {
    processedRef.current = new Set();
    setProcessedCount(0);
    setSuggestions([]);
    setGrammarIssues([]);
    setErrorMsg(null);
  }, []);

  const analyze = async (selectedMode: "enhance" | "grammar") => {
    const toProcess = translatedEntries.filter(e =>
      !processedRef.current.has(`${e.msbtFile}:${e.index}`)
    );
    if (toProcess.length === 0) {
      toast({ title: "لا توجد نصوص جديدة للفحص", description: "اضغط 🔄 لإعادة الفحص من البداية" });
      return;
    }

    setIsAnalyzing(true);
    setMode(selectedMode);
    setErrorMsg(null);
    abortRef.current = false;
    setProgress({ current: 0, total: toProcess.length });

    let done = 0;

    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      if (abortRef.current) break;
      const batch = toProcess.slice(i, i + BATCH_SIZE);
      const batchEntries = batch.map(e => ({
        key: `${e.msbtFile}:${e.index}`,
        original: e.original,
        translation: translations[`${e.msbtFile}:${e.index}`],
      }));

      try {
        const { data, error } = await supabase.functions.invoke('enhance-translations', {
          body: { entries: batchEntries, mode: selectedMode, glossary: glossary?.slice(0, 4000) },
        });

        // Mark as processed regardless of result to avoid infinite retries
        for (const e of batchEntries) processedRef.current.add(e.key);

        if (error) {
          // Supabase wraps non-2xx as error — extract message
          const msg = (error as any)?.message || String(error);
          if (msg.includes('402') || msg.includes('رصيد')) {
            setErrorMsg('⚠️ انتهى رصيد الذكاء الاصطناعي — استخدم مفتاح Gemini الشخصي من الإعدادات');
            break;
          }
          if (msg.includes('429')) {
            toast({ title: "تم تجاوز حد الطلبات — انتظر دقيقة ثم أعد المحاولة", variant: "destructive" });
            await new Promise(r => setTimeout(r, 8000));
          } else {
            console.error('Enhance error:', error);
          }
        } else if (data?.error) {
          if (data.error.includes('رصيد') || data.error.includes('402')) {
            setErrorMsg(`⚠️ ${data.error} — استخدم مفتاح Gemini الشخصي من الإعدادات`);
            break;
          }
          toast({ title: data.error, variant: "destructive" });
        } else if (data?.parseError) {
          console.warn('AI returned unparseable JSON for batch', i);
        } else if (selectedMode === "enhance" && Array.isArray(data?.suggestions)) {
          setSuggestions(prev => [...prev, ...data.suggestions]);
        } else if (selectedMode === "grammar" && Array.isArray(data?.issues)) {
          setGrammarIssues(prev => [...prev, ...data.issues]);
        }
      } catch (err: any) {
        console.error('Batch failed:', err);
        for (const e of batchEntries) processedRef.current.add(e.key);
      }

      done += batch.length;
      setProcessedCount(processedRef.current.size);
      setProgress({ current: done, total: toProcess.length });
    }

    setIsAnalyzing(false);
    setProgress(null);
    setProcessedCount(processedRef.current.size);

    if (!abortRef.current && !errorMsg) {
      const count = selectedMode === "enhance" ? suggestions.length : grammarIssues.length;
      if (count === 0) {
        toast({ title: selectedMode === "enhance" ? "✅ لم يُعثر على تحسينات مقترحة" : "✅ لا توجد أخطاء" });
      }
    }
  };

  const applyAll = () => {
    if (mode === "enhance") {
      for (const s of suggestions) onApplySuggestion(s.key, s.suggested);
      toast({ title: `✅ تم تطبيق ${suggestions.length} اقتراح` });
      setSuggestions([]);
    } else {
      for (const g of grammarIssues) onApplySuggestion(g.key, g.suggestion);
      toast({ title: `✅ تم إصلاح ${grammarIssues.length} خطأ` });
      setGrammarIssues([]);
    }
  };

  const results: (EnhanceSuggestion | GrammarIssue)[] =
    mode === "enhance" ? suggestions : grammarIssues;
  const hasResults = results.length > 0;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold font-display">تحسين الترجمة بالذكاء الاصطناعي</span>
        </div>
        <div className="flex items-center gap-2">
          {hasResults && (
            <Badge className="text-[11px] bg-primary text-primary-foreground">
              {results.length} نتيجة
            </Badge>
          )}
          <button
            onClick={reset}
            className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
            title="إعادة تعيين"
          >
            <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* ── Stats bar ── */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/30 rounded-xl px-3 py-2">
          <span>إجمالي <strong className="text-foreground">{totalTranslated}</strong></span>
          <span className="text-border">|</span>
          <span>فُحص <strong className="text-foreground">{processedCount}</strong></span>
          <span className="text-border">|</span>
          <span>متبقي <strong className={remaining > 0 ? "text-primary" : "text-green-400"}>{remaining}</strong></span>
          {hasResults && (
            <>
              <span className="text-border">|</span>
              <span>نتائج <strong className="text-amber-400">{results.length}</strong></span>
            </>
          )}
        </div>

        {/* ── Progress bar ── */}
        {progress && (
          <div className="space-y-1">
            <Progress value={(progress.current / progress.total) * 100} className="h-1.5" />
            <p className="text-[10px] text-muted-foreground text-center">
              {progress.current} / {progress.total} نص
            </p>
          </div>
        )}

        {/* ── Error state ── */}
        {errorMsg && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2.5 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive font-body" dir="rtl">{errorMsg}</p>
          </div>
        )}

        {/* ── Action buttons ── */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => analyze("enhance")}
            disabled={isAnalyzing || totalTranslated === 0}
            className={`flex items-center gap-2 px-3 py-3 rounded-xl border transition-all active:scale-95 disabled:opacity-50 ${
              mode === "enhance" && isAnalyzing
                ? "bg-primary/10 border-primary/40"
                : "bg-background border-border hover:border-primary/40 hover:bg-primary/5"
            }`}
          >
            {isAnalyzing && mode === "enhance"
              ? <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              : <Wand2 className="w-4 h-4 text-primary shrink-0" />
            }
            <div className="text-right min-w-0">
              <p className="text-xs font-bold text-foreground leading-tight">تحسين الصياغة</p>
              <p className="text-[10px] text-muted-foreground leading-tight">أسلوب + دقة + مصطلحات</p>
            </div>
          </button>

          <button
            onClick={() => analyze("grammar")}
            disabled={isAnalyzing || totalTranslated === 0}
            className={`flex items-center gap-2 px-3 py-3 rounded-xl border transition-all active:scale-95 disabled:opacity-50 ${
              mode === "grammar" && isAnalyzing
                ? "bg-primary/10 border-primary/40"
                : "bg-background border-border hover:border-primary/40 hover:bg-primary/5"
            }`}
          >
            {isAnalyzing && mode === "grammar"
              ? <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              : <BookOpen className="w-4 h-4 text-primary shrink-0" />
            }
            <div className="text-right min-w-0">
              <p className="text-xs font-bold text-foreground leading-tight">فحص القواعد</p>
              <p className="text-[10px] text-muted-foreground leading-tight">إملاء + نحو + ترقيم</p>
            </div>
          </button>
        </div>

        {/* ── Stop button ── */}
        {isAnalyzing && (
          <button
            onClick={() => { abortRef.current = true; }}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-destructive/30 text-destructive text-xs hover:bg-destructive/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> إيقاف الفحص
          </button>
        )}

        {/* ── Results ── */}
        {hasResults && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                {mode === "enhance" ? <Wand2 className="w-3.5 h-3.5 text-primary" /> : <Type className="w-3.5 h-3.5 text-primary" />}
                {mode === "enhance" ? "اقتراحات التحسين" : "الأخطاء المكتشفة"}
                <Badge variant="secondary" className="text-[10px]">{results.length}</Badge>
              </p>
              <button
                onClick={applyAll}
                className="flex items-center gap-1 text-[10px] text-green-400 hover:text-green-300 font-bold px-2 py-1 rounded-lg bg-green-500/10 hover:bg-green-500/15 transition-colors"
              >
                <CheckCircle2 className="w-3 h-3" /> تطبيق الكل
              </button>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-0.5" style={{ WebkitOverflowScrolling: 'touch' }}>
              {results.map((item, idx) => (
                <ResultCard
                  key={`${item.key}-${idx}`}
                  item={item}
                  onApply={() => {
                    const newText = "suggested" in item ? item.suggested : item.suggestion;
                    onApplySuggestion(item.key, newText);
                    setSuggestions(prev => prev.filter((_, i) => i !== idx));
                    setGrammarIssues(prev => prev.filter((_, i) => i !== idx));
                  }}
                  onDismiss={() => {
                    setSuggestions(prev => prev.filter((_, i) => i !== idx));
                    setGrammarIssues(prev => prev.filter((_, i) => i !== idx));
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Empty state (after analysis done, no results) ── */}
        {!isAnalyzing && !hasResults && processedCount > 0 && !errorMsg && (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
            <p className="text-sm font-bold text-foreground">
              {mode === "enhance" ? "الترجمات جيدة الصياغة" : "لا توجد أخطاء قواعدية"}
            </p>
            <p className="text-xs text-muted-foreground">
              تم فحص {processedCount} ترجمة
            </p>
          </div>
        )}

        {/* ── Initial empty state ── */}
        {!isAnalyzing && !hasResults && processedCount === 0 && !errorMsg && (
          <div className="flex flex-col items-center gap-2 py-3 text-center">
            <Eye className="w-6 h-6 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">
              اضغط "تحسين الصياغة" أو "فحص القواعد" لبدء الفحص
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TranslationAIEnhancePanel;
