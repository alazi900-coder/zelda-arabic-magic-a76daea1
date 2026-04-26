import React, { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Loader2, Check, X, AlertTriangle, BookOpen, Wand2, Square, RotateCcw, Type, Search, Zap, Eye, Copy, ArrowRight } from "lucide-react";
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
  type: "style" | "grammar" | "accuracy" | "consistency" | "missing_char" | "terminology" | "punctuation";
}

interface GrammarIssue {
  key: string;
  original: string;
  translation: string;
  issue: string;
  suggestion: string;
  severity?: "high" | "medium" | "low";
}

const BATCH_SIZE = 50;
const PARALLEL_REQUESTS = 3;

const TranslationAIEnhancePanel: React.FC<TranslationAIEnhancePanelProps> = ({
  entries,
  translations,
  onApplySuggestion,
  glossary,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<EnhanceSuggestion[]>([]);
  const [grammarIssues, setGrammarIssues] = useState<GrammarIssue[]>([]);
  const [activeTab, setActiveTab] = useState<string>("enhance");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [processedCount, setProcessedCount] = useState(0);
  const abortRef = useRef(false);
  const processedKeysRef = useRef<Set<string>>(new Set());

  const resetProcessedKeys = useCallback(() => {
    processedKeysRef.current = new Set();
    setProcessedCount(0);
  }, []);

  const analyzeTranslations = async (mode: "enhance" | "grammar") => {
    const translatedEntries = entries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      return translations[key]?.trim() && !processedKeysRef.current.has(key);
    });

    if (translatedEntries.length === 0) {
      toast({ title: "لا توجد نصوص جديدة للفحص", description: "اضغط 🔄 لإعادة الفحص من البداية" });
      return;
    }

    setIsAnalyzing(true);
    setActiveTab(mode);
    abortRef.current = false;
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

    for (let i = 0; i < batches.length; i += PARALLEL_REQUESTS) {
      if (abortRef.current) break;

      const chunk = batches.slice(i, i + PARALLEL_REQUESTS);
      const promises = chunk.map(async ({ textsToAnalyze }) => {
        try {
          const { data, error } = await supabase.functions.invoke('enhance-translations', {
            body: {
              entries: textsToAnalyze,
              mode,
              glossary: glossary?.slice(0, 5000),
            },
          });
          if (error) {
            console.error('Edge function error:', error);
            throw error;
          }
          if (data?.error) {
            console.error('AI error response:', data.error);
            toast({ title: data.error, variant: "destructive" });
            return { data: null, count: textsToAnalyze.length };
          }
          for (const t of textsToAnalyze) processedKeysRef.current.add(t.key);
          setProcessedCount(processedKeysRef.current.size);
          return { data, count: textsToAnalyze.length };
        } catch (err) {
          console.error('Batch error:', err);
          if (String(err).includes('429')) {
            toast({ title: "تم تجاوز حد الطلبات، جاري الانتظار...", variant: "destructive" });
            await new Promise(r => setTimeout(r, 5000));
            try {
              const { data } = await supabase.functions.invoke('enhance-translations', {
                body: { entries: textsToAnalyze, mode, glossary: glossary?.slice(0, 5000) },
              });
              for (const t of textsToAnalyze) processedKeysRef.current.add(t.key);
              setProcessedCount(processedKeysRef.current.size);
              return { data, count: textsToAnalyze.length };
            } catch { return { data: null, count: textsToAnalyze.length }; }
          }
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
        } else {
          console.warn('No suggestions/issues in response:', data);
        }
      }

      setProgress({ current: Math.min(processed, translatedEntries.length), total: translatedEntries.length });
    }

    setIsAnalyzing(false);
    setProgress(null);

    const count = mode === "enhance" ? allSuggestions.length : allIssues.length;
    if (count === 0 && !abortRef.current) {
      toast({ title: mode === "enhance" ? "✅ الترجمات جيدة" : "✅ لا توجد أخطاء" });
    } else {
      toast({ title: `تم العثور على ${count} ${mode === "enhance" ? "اقتراح" : "خطأ"}` });
    }
  };

  const stopAnalysis = () => { abortRef.current = true; };

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
      const filtered = filterType ? suggestions.filter(s => s.type === filterType) : suggestions;
      for (const s of filtered) onApplySuggestion(s.key, s.suggested);
      toast({ title: `✅ تم تطبيق ${filtered.length} اقتراح` });
      if (filterType) {
        setSuggestions(prev => prev.filter(s => s.type !== filterType));
      } else {
        setSuggestions([]);
      }
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "تم النسخ" });
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

  const filteredSuggestions = filterType ? suggestions.filter(s => s.type === filterType) : suggestions;

  // Type counts for filter badges
  const typeCounts: Record<string, number> = {};
  for (const s of suggestions) {
    typeCounts[s.type] = (typeCounts[s.type] || 0) + 1;
  }

  const totalTranslated = entries.filter(e => translations[`${e.msbtFile}:${e.index}`]?.trim()).length;
  const remaining = totalTranslated - processedCount;

  const severityConfig: Record<string, { color: string; label: string }> = {
    high: { color: "text-red-500", label: "خطير" },
    medium: { color: "text-amber-500", label: "متوسط" },
    low: { color: "text-blue-500", label: "بسيط" },
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          تحسين الترجمة بالذكاء الاصطناعي
        </CardTitle>
        {/* Stats bar */}
        <div className="flex items-center gap-4 mt-2">
          <div className="flex gap-3 text-[11px] text-muted-foreground flex-1">
            <span>إجمالي: <strong className="text-foreground">{totalTranslated}</strong></span>
            <span>تم فحصه: <strong className="text-foreground">{processedCount}</strong></span>
            <span>متبقي: <strong className={remaining > 0 ? "text-primary" : "text-green-500"}>{remaining}</strong></span>
          </div>
          {suggestions.length + grammarIssues.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {suggestions.length + grammarIssues.length} نتيجة
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => analyzeTranslations("enhance")}
            disabled={isAnalyzing}
            className="gap-1.5 h-10"
          >
            {isAnalyzing && activeTab === "enhance" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            <div className="text-right">
              <p className="text-xs font-bold">تحسين الصياغة</p>
              <p className="text-[10px] text-muted-foreground">أسلوب + مصطلحات + دقة</p>
            </div>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => analyzeTranslations("grammar")}
            disabled={isAnalyzing}
            className="gap-1.5 h-10"
          >
            {isAnalyzing && activeTab === "grammar" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <BookOpen className="w-4 h-4" />
            )}
            <div className="text-right">
              <p className="text-xs font-bold">فحص القواعد</p>
              <p className="text-[10px] text-muted-foreground">إملاء + نحو + ترقيم</p>
            </div>
          </Button>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2">
          {isAnalyzing && (
            <Button variant="destructive" size="sm" onClick={stopAnalysis} className="gap-1.5">
              <Square className="w-3 h-3" /> إيقاف
            </Button>
          )}
          {!isAnalyzing && processedCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { resetProcessedKeys(); setSuggestions([]); setGrammarIssues([]); setFilterType(null); }} className="gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> إعادة فحص
            </Button>
          )}
          {(suggestions.length > 0 || grammarIssues.length > 0) && !isAnalyzing && (
            <Button size="sm" variant="default" onClick={applyAll} className="gap-1.5 mr-auto">
              <Zap className="w-4 h-4" />
              إصلاح الكل ({filterType ? filteredSuggestions.length : activeTab === "enhance" ? suggestions.length : grammarIssues.length})
            </Button>
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

        {/* Type filter badges (enhance mode) */}
        {suggestions.length > 0 && activeTab === "enhance" && (
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant={filterType === null ? "default" : "outline"}
              className="cursor-pointer text-[10px]"
              onClick={() => setFilterType(null)}
            >
              الكل ({suggestions.length})
            </Badge>
            {Object.entries(typeCounts).map(([type, count]) => {
              const config = typeConfig[type];
              return (
                <Badge
                  key={type}
                  variant={filterType === type ? "default" : "outline"}
                  className={`cursor-pointer text-[10px] gap-1 ${filterType !== type ? config?.color || '' : ''}`}
                  onClick={() => setFilterType(filterType === type ? null : type)}
                >
                  {config?.icon}
                  {config?.label || type} ({count})
                </Badge>
              );
            })}
          </div>
        )}

        {/* Tabs for results */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full h-9">
            <TabsTrigger value="enhance" className="flex-1 text-xs gap-1">
              <Wand2 className="w-3 h-3" /> تحسينات
              {suggestions.length > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1">{suggestions.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="grammar" className="flex-1 text-xs gap-1">
              <BookOpen className="w-3 h-3" /> أخطاء
              {grammarIssues.length > 0 && <Badge variant="destructive" className="text-[10px] h-4 px-1">{grammarIssues.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="enhance">
            {filteredSuggestions.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3 pr-1">
                  {filteredSuggestions.map((s, i) => {
                    const config = typeConfig[s.type];
                    return (
                      <div key={`${s.key}-${i}`} className="rounded-xl border bg-card p-4 space-y-3 transition-all hover:shadow-sm">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className={`text-[10px] gap-1 ${config?.color || ''}`}>
                                {config?.icon}
                                {config?.label || s.type}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{s.reason}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-500 hover:bg-green-500/10" onClick={() => applySuggestion(s)}>
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:bg-destructive/10" onClick={() => dismissSuggestion(s.key)}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Original text */}
                        <div className="bg-muted/30 rounded-lg p-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] text-muted-foreground">النص الأصلي:</p>
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(s.original)}>
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed" dir="ltr">{s.original}</p>
                        </div>

                        {/* Current vs Suggested */}
                        <div className="grid grid-cols-1 gap-2">
                          <div className="p-2.5 rounded-lg bg-red-500/5 border border-red-500/10">
                            <p className="text-[10px] text-red-500 mb-1 font-bold">الحالي:</p>
                            <p className="text-sm leading-relaxed" dir="rtl">{s.current}</p>
                          </div>
                          <div className="flex items-center justify-center">
                            <ArrowRight className="w-4 h-4 text-muted-foreground rotate-90" />
                          </div>
                          <div className="p-2.5 rounded-lg bg-green-500/5 border border-green-500/20">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-[10px] text-green-600 font-bold">المقترح:</p>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(s.suggested)}>
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                            <p className="text-sm leading-relaxed" dir="rtl">{s.suggested}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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

          <TabsContent value="grammar">
            {grammarIssues.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3 pr-1">
                  {grammarIssues.map((g, i) => (
                    <div key={`${g.key}-${i}`} className="rounded-xl border border-red-500/20 bg-card p-4 space-y-3 transition-all hover:shadow-sm">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                            <span className="text-sm font-bold text-red-500">{g.issue}</span>
                            {g.severity && (
                              <Badge variant="outline" className={`text-[10px] ${severityConfig[g.severity]?.color}`}>
                                {severityConfig[g.severity]?.label}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-500 hover:bg-green-500/10" onClick={() => applySuggestion(g)}>
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:bg-destructive/10" onClick={() => dismissSuggestion(g.key)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Original */}
                      <div className="bg-muted/30 rounded-lg p-2.5">
                        <p className="text-[10px] text-muted-foreground mb-1">النص الأصلي:</p>
                        <p className="text-xs text-muted-foreground leading-relaxed" dir="ltr">{g.original}</p>
                      </div>

                      {/* Error vs Fix */}
                      <div className="grid grid-cols-1 gap-2">
                        <div className="p-2.5 rounded-lg bg-red-500/5 border border-red-500/10">
                          <p className="text-[10px] text-red-500 mb-1 font-bold">به خطأ:</p>
                          <p className="text-sm leading-relaxed" dir="rtl">{g.translation}</p>
                        </div>
                        <div className="flex items-center justify-center">
                          <ArrowRight className="w-4 h-4 text-muted-foreground rotate-90" />
                        </div>
                        <div className="p-2.5 rounded-lg bg-green-500/5 border border-green-500/20">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] text-green-600 font-bold">التصحيح:</p>
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(g.suggestion)}>
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                          <p className="text-sm leading-relaxed" dir="rtl">{g.suggestion}</p>
                        </div>
                      </div>
                    </div>
                  ))}
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
