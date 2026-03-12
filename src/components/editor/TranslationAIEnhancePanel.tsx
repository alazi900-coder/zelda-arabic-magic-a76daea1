import React, { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Loader2, Check, X, AlertTriangle, BookOpen, Wand2, CheckCircle2, Square, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { ExtractedEntry } from "./types";

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
  type: "style" | "grammar" | "accuracy" | "consistency";
}

interface GrammarIssue {
  key: string;
  original: string;
  translation: string;
  issue: string;
  suggestion: string;
}

const BATCH_SIZE = 20;

const TranslationAIEnhancePanel: React.FC<TranslationAIEnhancePanelProps> = ({
  entries,
  translations,
  onApplySuggestion,
  glossary,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<EnhanceSuggestion[]>([]);
  const [grammarIssues, setGrammarIssues] = useState<GrammarIssue[]>([]);
  const [activeTab, setActiveTab] = useState<"enhance" | "grammar">("enhance");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const abortRef = useRef(false);
  const processedKeysRef = useRef<Set<string>>(new Set());

  const resetProcessedKeys = useCallback(() => {
    processedKeysRef.current = new Set();
  }, []);

  const analyzeTranslations = async (mode: "enhance" | "grammar") => {
    // Filter only translated entries that haven't been processed yet
    const translatedEntries = entries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      return translations[key]?.trim() && !processedKeysRef.current.has(key);
    });

    if (translatedEntries.length === 0) {
      toast({ title: "لا توجد نصوص جديدة للفحص — جميع النصوص تم فحصها", description: "اضغط 🔄 لإعادة الفحص من البداية" });
      return;
    }

    setIsAnalyzing(true);
    setActiveTab(mode);
    abortRef.current = false;
    // Don't clear previous results — accumulate
    // setSuggestions([]); setGrammarIssues([]);

    const totalBatches = Math.ceil(translatedEntries.length / BATCH_SIZE);
    setProgress({ current: 0, total: translatedEntries.length });

    let allSuggestions: EnhanceSuggestion[] = [];
    let allIssues: GrammarIssue[] = [];

    for (let i = 0; i < translatedEntries.length; i += BATCH_SIZE) {
      if (abortRef.current) break;

      const batch = translatedEntries.slice(i, i + BATCH_SIZE);
      const textsToAnalyze = batch.map(e => ({
        key: `${e.msbtFile}:${e.index}`,
        original: e.original,
        translation: translations[`${e.msbtFile}:${e.index}`],
      }));

      try {
        const { data, error } = await supabase.functions.invoke('enhance-translations', {
          body: {
            entries: textsToAnalyze,
            mode,
            glossary: glossary?.slice(0, 5000),
          },
        });

        if (error) throw error;

        // Mark all batch keys as processed regardless of results
        for (const t of textsToAnalyze) processedKeysRef.current.add(t.key);

        if (mode === "enhance" && data.suggestions) {
          allSuggestions = [...allSuggestions, ...data.suggestions];
          setSuggestions(prev => [...prev, ...data.suggestions]);
        } else if (mode === "grammar" && data.issues) {
          allIssues = [...allIssues, ...data.issues];
          setGrammarIssues(prev => [...prev, ...data.issues]);
        }
      } catch (err) {
        console.error('Batch error:', err);
        if (String(err).includes('429')) {
          toast({ title: "تم تجاوز حد الطلبات، جاري الانتظار...", variant: "destructive" });
          await new Promise(r => setTimeout(r, 5000));
          i -= BATCH_SIZE; // retry
          continue;
        }
      }

      setProgress({ current: Math.min(i + BATCH_SIZE, translatedEntries.length), total: translatedEntries.length });
    }

    setIsAnalyzing(false);
    setProgress(null);

    const count = mode === "enhance" ? allSuggestions.length : allIssues.length;
    if (count === 0 && !abortRef.current) {
      toast({ title: mode === "enhance" ? "✅ الترجمات جيدة" : "✅ لا توجد أخطاء نحوية" });
    } else {
      toast({ title: `تم العثور على ${count} ${mode === "enhance" ? "اقتراح" : "خطأ"}` });
    }
  };

  const stopAnalysis = () => {
    abortRef.current = true;
  };

  const applySuggestion = (item: EnhanceSuggestion | GrammarIssue) => {
    const newText = 'suggested' in item ? item.suggested : item.suggestion;
    onApplySuggestion(item.key, newText);
    if ('suggested' in item) {
      setSuggestions(prev => prev.filter(s => s.key !== item.key));
    } else {
      setGrammarIssues(prev => prev.filter(g => g.key !== item.key));
    }
  };

  const applyAll = () => {
    if (activeTab === "enhance") {
      for (const s of suggestions) onApplySuggestion(s.key, s.suggested);
      toast({ title: `✅ تم تطبيق ${suggestions.length} اقتراح` });
      setSuggestions([]);
    } else {
      for (const g of grammarIssues) onApplySuggestion(g.key, g.suggestion);
      toast({ title: `✅ تم إصلاح ${grammarIssues.length} خطأ` });
      setGrammarIssues([]);
    }
  };

  const dismissSuggestion = (key: string) => {
    setSuggestions(prev => prev.filter(s => s.key !== key));
    setGrammarIssues(prev => prev.filter(g => g.key !== key));
  };

  const typeLabels: Record<string, { label: string; color: string }> = {
    style: { label: "أسلوب", color: "bg-purple-500/10 text-purple-500" },
    grammar: { label: "قواعد", color: "bg-red-500/10 text-red-500" },
    accuracy: { label: "دقة", color: "bg-blue-500/10 text-blue-500" },
    consistency: { label: "اتساق", color: "bg-amber-500/10 text-amber-500" },
  };

  const currentResults = activeTab === "enhance" ? suggestions : grammarIssues;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          تحسين الترجمة بالذكاء الاصطناعي
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeTab === "enhance" ? "default" : "outline"}
            size="sm"
            onClick={() => analyzeTranslations("enhance")}
            disabled={isAnalyzing}
            className="gap-1.5"
          >
            {isAnalyzing && activeTab === "enhance" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            تحسين الصياغة (الكل)
          </Button>
          <Button
            variant={activeTab === "grammar" ? "default" : "outline"}
            size="sm"
            onClick={() => analyzeTranslations("grammar")}
            disabled={isAnalyzing}
            className="gap-1.5"
          >
            {isAnalyzing && activeTab === "grammar" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <BookOpen className="w-4 h-4" />
            )}
            فحص القواعد (الكل)
          </Button>
          {isAnalyzing && (
            <Button variant="destructive" size="sm" onClick={stopAnalysis} className="gap-1.5">
              <Square className="w-3 h-3" />
              إيقاف
            </Button>
          )}
          {!isAnalyzing && processedKeysRef.current.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { resetProcessedKeys(); setSuggestions([]); setGrammarIssues([]); }} className="gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" />
              إعادة فحص الكل
            </Button>
          )}
        </div>

        {/* Progress bar */}
        {progress && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>جاري الفحص...</span>
              <span>{progress.current} / {progress.total}</span>
            </div>
            <Progress value={(progress.current / progress.total) * 100} className="h-2" />
          </div>
        )}

        {/* Apply All button */}
        {currentResults.length > 0 && !isAnalyzing && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {currentResults.length} {activeTab === "enhance" ? "اقتراح" : "خطأ"}
            </span>
            <Button size="sm" variant="default" onClick={applyAll} className="gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              إصلاح الكل
            </Button>
          </div>
        )}

        {/* Results */}
        {activeTab === "enhance" && suggestions.length > 0 && (
          <ScrollArea className="h-[300px]">
            <div className="space-y-3">
              {suggestions.map((s, i) => (
                <div key={`${s.key}-${i}`} className="p-3 rounded-lg border bg-card space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={typeLabels[s.type]?.color || ""}>
                          {typeLabels[s.type]?.label || s.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {s.original.slice(0, 40)}...
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{s.reason}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-500" onClick={() => applySuggestion(s)}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => dismissSuggestion(s.key)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 rounded bg-muted/50">
                      <p className="text-[10px] text-muted-foreground mb-1">الحالي:</p>
                      <p className="text-xs" dir="rtl">{s.current}</p>
                    </div>
                    <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
                      <p className="text-[10px] text-green-600 mb-1">المقترح:</p>
                      <p className="text-xs" dir="rtl">{s.suggested}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {activeTab === "grammar" && grammarIssues.length > 0 && (
          <ScrollArea className="h-[300px]">
            <div className="space-y-3">
              {grammarIssues.map((g, i) => (
                <div key={`${g.key}-${i}`} className="p-3 rounded-lg border border-red-500/20 bg-red-500/5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                        <span className="text-xs font-bold text-red-500">{g.issue}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{g.original.slice(0, 50)}...</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-500" onClick={() => applySuggestion(g)}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => dismissSuggestion(g.key)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 rounded bg-red-500/10">
                      <p className="text-[10px] text-red-500 mb-1">به خطأ:</p>
                      <p className="text-xs" dir="rtl">{g.translation}</p>
                    </div>
                    <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
                      <p className="text-[10px] text-green-600 mb-1">التصحيح:</p>
                      <p className="text-xs" dir="rtl">{g.suggestion}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Empty states */}
        {!isAnalyzing && suggestions.length === 0 && grammarIssues.length === 0 && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>اضغط على أحد الأزرار لفحص جميع الترجمات في الملف</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TranslationAIEnhancePanel;
