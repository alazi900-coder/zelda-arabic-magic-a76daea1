import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Sparkles, ChevronDown, ChevronUp, Check, User, MessageSquare, Swords, Heart, Settings, HelpCircle, AlertTriangle, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EnhanceResult {
  key: string;
  original: string;
  currentTranslation: string;
  context: {
    character?: string;
    sceneType: 'combat' | 'emotional' | 'system' | 'dialogue' | 'tutorial' | 'unknown';
    tone: 'formal' | 'casual' | 'dramatic' | 'neutral';
  };
  issues: Array<{
    type: 'literal' | 'awkward' | 'inconsistent' | 'context_mismatch' | 'style';
    message: string;
    severity: 'high' | 'medium' | 'low';
  }>;
  suggestions: Array<{
    text: string;
    reason: string;
    style: 'literary' | 'natural' | 'concise' | 'dramatic';
  }>;
  preferredSuggestion?: string;
}

interface TranslationEnhancePanelProps {
  results: EnhanceResult[];
  onApplySuggestion: (key: string, newTranslation: string) => void;
  onApplyAll: () => void;
  onClose: () => void;
  analyzing?: boolean;
}

const sceneTypeIcons: Record<string, React.ReactNode> = {
  combat: <Swords className="w-3.5 h-3.5" />,
  emotional: <Heart className="w-3.5 h-3.5" />,
  system: <Settings className="w-3.5 h-3.5" />,
  dialogue: <MessageSquare className="w-3.5 h-3.5" />,
  tutorial: <HelpCircle className="w-3.5 h-3.5" />,
  unknown: <MessageSquare className="w-3.5 h-3.5" />,
};

const sceneTypeLabels: Record<string, string> = {
  combat: 'قتال',
  emotional: 'عاطفي',
  system: 'نظام',
  dialogue: 'حوار',
  tutorial: 'تعليمي',
  unknown: 'عام',
};

const styleLabels: Record<string, string> = {
  literary: 'أدبي',
  natural: 'طبيعي',
  concise: 'مختصر',
  dramatic: 'درامي',
};

const severityColors: Record<string, string> = {
  high: 'border-destructive/40 bg-destructive/10 text-destructive',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  low: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
};

const TranslationEnhancePanel: React.FC<TranslationEnhancePanelProps> = ({
  results, onApplySuggestion, onApplyAll, onClose, analyzing,
}) => {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    new Set(results.slice(0, 2).map(r => r.key))
  );
  const [filterIssueType, setFilterIssueType] = useState<string>('all');

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const stats = useMemo(() => {
    let literal = 0, awkward = 0, style = 0, contextMismatch = 0;
    for (const r of results) {
      for (const issue of r.issues) {
        if (issue.type === 'literal') literal++;
        else if (issue.type === 'awkward') awkward++;
        else if (issue.type === 'style') style++;
        else if (issue.type === 'context_mismatch') contextMismatch++;
      }
    }
    return { literal, awkward, style, contextMismatch, total: results.length };
  }, [results]);

  const filtered = useMemo(() => {
    if (filterIssueType === 'all') return results;
    return results.filter(r => r.issues.some(i => i.type === filterIssueType));
  }, [results, filterIssueType]);

  const resultsWithSuggestions = results.filter(r => r.suggestions.length > 0 || r.preferredSuggestion);

  if (results.length === 0 && !analyzing) return null;

  return (
    <Card className="mb-4 border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="font-display font-bold text-sm">
              تحسين الترجمات بالسياق {analyzing && <span className="text-muted-foreground animate-pulse">— جاري التحليل...</span>}
            </h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-2 mb-3">
          <Badge variant="secondary">{stats.total} نص</Badge>
          {stats.literal > 0 && (
            <Badge 
              variant="outline" 
              className={cn("cursor-pointer transition-colors", filterIssueType === 'literal' ? 'bg-amber-500/20' : '')}
              onClick={() => setFilterIssueType(filterIssueType === 'literal' ? 'all' : 'literal')}
            >
              📝 ترجمة حرفية: {stats.literal}
            </Badge>
          )}
          {stats.awkward > 0 && (
            <Badge 
              variant="outline"
              className={cn("cursor-pointer transition-colors", filterIssueType === 'awkward' ? 'bg-orange-500/20' : '')}
              onClick={() => setFilterIssueType(filterIssueType === 'awkward' ? 'all' : 'awkward')}
            >
              🔧 صياغة ركيكة: {stats.awkward}
            </Badge>
          )}
          {stats.contextMismatch > 0 && (
            <Badge 
              variant="outline"
              className={cn("cursor-pointer transition-colors", filterIssueType === 'context_mismatch' ? 'bg-purple-500/20' : '')}
              onClick={() => setFilterIssueType(filterIssueType === 'context_mismatch' ? 'all' : 'context_mismatch')}
            >
              🎭 عدم تطابق سياقي: {stats.contextMismatch}
            </Badge>
          )}
        </div>

        {/* Quick apply all */}
        {resultsWithSuggestions.length > 0 && (
          <div className="flex gap-2 mb-3">
            <Button
              variant="default"
              size="sm"
              onClick={onApplyAll}
              className="text-xs h-7 gap-1"
            >
              <Check className="w-3 h-3" /> تطبيق أفضل الاقتراحات ({resultsWithSuggestions.length})
            </Button>
          </div>
        )}

        {/* Results list */}
        <ScrollArea className="max-h-[55vh]">
          <div className="space-y-2">
            {filtered.map((result) => {
              const isExpanded = expandedKeys.has(result.key);
              const hasIssues = result.issues.length > 0;
              const hasSuggestions = result.suggestions.length > 0;

              return (
                <div
                  key={result.key}
                  className={cn(
                    "rounded-lg border overflow-hidden transition-colors",
                    hasIssues ? "border-amber-500/30 bg-amber-500/5" : "border-border/50 bg-card/50"
                  )}
                >
                  {/* Collapsed header */}
                  <button
                    onClick={() => toggleExpand(result.key)}
                    className="w-full flex items-center justify-between p-2.5 text-right hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      
                      {/* Context badges */}
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-0.5">
                          {sceneTypeIcons[result.context.sceneType]}
                          {sceneTypeLabels[result.context.sceneType]}
                        </Badge>
                        {result.context.character && (
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-0.5 border-blue-500/40 text-blue-400">
                            <User className="w-2.5 h-2.5" />
                            {result.context.character}
                          </Badge>
                        )}
                      </div>

                      {hasIssues && (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-amber-500/40 text-amber-400">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {result.issues.length}
                        </Badge>
                      )}
                      {hasSuggestions && (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-emerald-500/40 text-emerald-400">
                          <Lightbulb className="w-2.5 h-2.5" />
                          {result.suggestions.length}
                        </Badge>
                      )}
                    </div>

                    <span className="text-xs text-muted-foreground truncate max-w-[40%] font-mono" dir="ltr">
                      {result.key.split(':').pop()}
                    </span>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-3">
                      {/* Original & current */}
                      <div className="space-y-1.5">
                        <div className="text-xs bg-muted/20 rounded p-2" dir="ltr">
                          <span className="text-[10px] text-muted-foreground block mb-0.5">🇬🇧 الأصلي:</span>
                          {result.original}
                        </div>
                        <div className="text-xs bg-card/50 border border-border/30 rounded p-2" dir="rtl">
                          <span className="text-[10px] text-muted-foreground block mb-0.5">الترجمة الحالية:</span>
                          {result.currentTranslation}
                        </div>
                      </div>

                      {/* Issues */}
                      {result.issues.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted-foreground">المشاكل المكتشفة:</span>
                          {result.issues.map((issue, i) => (
                            <div
                              key={i}
                              className={cn("text-xs rounded px-2 py-1 border", severityColors[issue.severity])}
                            >
                              <span className="font-medium">
                                {issue.type === 'literal' && '📝 ترجمة حرفية'}
                                {issue.type === 'awkward' && '🔧 صياغة ركيكة'}
                                {issue.type === 'context_mismatch' && '🎭 عدم تطابق سياقي'}
                                {issue.type === 'style' && '✨ تحسين أسلوبي'}
                                {issue.type === 'inconsistent' && '⚠️ عدم اتساق'}
                              </span>
                              : {issue.message}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Suggestions */}
                      {result.suggestions.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] text-muted-foreground">الاقتراحات البديلة:</span>
                          {result.suggestions.map((sug, i) => (
                            <div
                              key={i}
                              className={cn(
                                "text-xs rounded p-2 border transition-colors",
                                result.preferredSuggestion === sug.text
                                  ? "border-emerald-500/40 bg-emerald-500/10"
                                  : "border-border/30 bg-card/30 hover:bg-card/50"
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                                      {styleLabels[sug.style] || sug.style}
                                    </Badge>
                                    {result.preferredSuggestion === sug.text && (
                                      <Badge className="text-[9px] h-4 px-1 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                                        ⭐ مُوصى به
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="font-body" dir="rtl">{sug.text}</div>
                                  <div className="text-[10px] text-muted-foreground mt-1">{sug.reason}</div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onApplySuggestion(result.key, sug.text)}
                                  className="h-7 px-2 text-xs gap-1 text-emerald-400 hover:bg-emerald-500/20 shrink-0"
                                >
                                  <Check className="w-3 h-3" /> تطبيق
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Preferred suggestion quick apply */}
                      {result.preferredSuggestion && !result.suggestions.find(s => s.text === result.preferredSuggestion) && (
                        <div className="text-xs rounded p-2 border border-emerald-500/40 bg-emerald-500/10">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <Badge className="text-[9px] h-4 px-1 bg-emerald-500/20 text-emerald-400 border-emerald-500/30 mb-1">
                                ⭐ الاقتراح الأفضل
                              </Badge>
                              <div className="font-body" dir="rtl">{result.preferredSuggestion}</div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onApplySuggestion(result.key, result.preferredSuggestion!)}
                              className="h-7 px-2 text-xs gap-1 text-emerald-400 hover:bg-emerald-500/20 shrink-0"
                            >
                              <Check className="w-3 h-3" /> تطبيق
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default TranslationEnhancePanel;
