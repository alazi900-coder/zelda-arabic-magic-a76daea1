import React, { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, X, AlertTriangle, BookOpen, Languages, TextCursorInput, Sparkles } from "lucide-react";

export interface SmartReviewFinding {
  key: string;
  original: string;
  current: string;
  type: 'literal' | 'grammar' | 'inconsistency' | 'naturalness';
  issue: string;
  fix: string;
}

interface SmartReviewPanelProps {
  findings: SmartReviewFinding[];
  onApply: (key: string, fix: string) => void;
  onApplyAll: () => void;
  onDismiss: (key: string) => void;
  onClose: () => void;
}

const TYPE_CONFIG: Record<string, { label: string; emoji: string; color: string; icon: React.ElementType }> = {
  literal: { label: 'ترجمة حرفية', emoji: '📝', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: Languages },
  grammar: { label: 'خطأ نحوي', emoji: '🔤', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: TextCursorInput },
  inconsistency: { label: 'عدم اتساق', emoji: '🔀', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: BookOpen },
  naturalness: { label: 'ركاكة', emoji: '✨', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Sparkles },
  // Grammar check types
  gender: { label: 'تذكير/تأنيث', emoji: '♀️', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30', icon: TextCursorInput },
  conjugation: { label: 'تصريف أفعال', emoji: '🔄', color: 'bg-violet-500/20 text-violet-400 border-violet-500/30', icon: TextCursorInput },
  case: { label: 'خطأ إعرابي', emoji: '📐', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30', icon: TextCursorInput },
  spelling: { label: 'خطأ إملائي', emoji: '✏️', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: TextCursorInput },
  hamza: { label: 'همزات', emoji: '🅰️', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: TextCursorInput },
  negation: { label: 'أداة نفي', emoji: '🚫', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30', icon: TextCursorInput },
  preposition: { label: 'حرف جر', emoji: '🔗', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', icon: TextCursorInput },
  // Context review types
  'context-mismatch': { label: 'سياق غير مناسب', emoji: '🎯', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: BookOpen },
  'tone-mismatch': { label: 'نبرة غير مناسبة', emoji: '🎭', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: Sparkles },
  ambiguity: { label: 'غموض', emoji: '❓', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: AlertTriangle },
  continuity: { label: 'عدم اتساق سياقي', emoji: '🔗', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30', icon: BookOpen },
  improvement: { label: 'تحسين سياقي', emoji: '💡', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: Sparkles },
};

const SmartReviewPanel: React.FC<SmartReviewPanelProps> = ({
  findings, onApply, onApplyAll, onDismiss, onClose,
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const activeFindings = useMemo(() => {
    let items = findings.filter(f => !dismissed.has(f.key));
    if (filterType !== 'all') items = items.filter(f => f.type === filterType);
    return items;
  }, [findings, filterType, dismissed]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of findings) {
      if (dismissed.has(f.key)) continue;
      counts[f.type] = (counts[f.type] || 0) + 1;
    }
    return counts;
  }, [findings, dismissed]);

  const totalActive = findings.filter(f => !dismissed.has(f.key)).length;

  const handleDismiss = (key: string) => {
    setDismissed(prev => new Set(prev).add(key));
    onDismiss(key);
  };

  return (
    <Card className="mb-4 border-primary/30 bg-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold flex items-center gap-2 text-base">
            <AlertTriangle className="w-5 h-5 text-primary" />
            🔬 المراجعة الذكية العميقة
            <Badge variant="outline" className="text-xs">{totalActive} مشكلة</Badge>
          </h3>
          <div className="flex gap-2">
            {totalActive > 0 && (
              <Button size="sm" variant="default" onClick={onApplyAll} className="text-xs font-body">
                <CheckCircle2 className="w-3 h-3 ml-1" /> تطبيق الكل ({totalActive})
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onClose} className="text-xs">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Type filters */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <Button
            size="sm" variant={filterType === 'all' ? 'default' : 'outline'}
            onClick={() => setFilterType('all')}
            className="text-xs font-body"
          >
            الكل ({totalActive})
          </Button>
          {Object.entries(TYPE_CONFIG).map(([type, cfg]) => (
            typeCounts[type] ? (
              <Button
                key={type} size="sm"
                variant={filterType === type ? 'default' : 'outline'}
                onClick={() => setFilterType(type)}
                className="text-xs font-body gap-1"
              >
                {cfg.emoji} {cfg.label} ({typeCounts[type]})
              </Button>
            ) : null
          ))}
        </div>

        {/* Findings list */}
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {activeFindings.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
              {totalActive === 0 ? 'لم يتم العثور على مشاكل! الترجمات ممتازة 🎉' : 'لا توجد نتائج في هذا القسم'}
            </div>
          )}
          {activeFindings.map((f, idx) => {
            const cfg = TYPE_CONFIG[f.type] || TYPE_CONFIG.naturalness;
            return (
              <div key={`${f.key}-${idx}`} className="p-3 rounded-lg border border-border bg-background/50 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-[10px] border ${cfg.color}`}>
                      {cfg.emoji} {cfg.label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">{f.key}</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleDismiss(f.key)} className="shrink-0 h-6 w-6 p-0">
                    <X className="w-3 h-3" />
                  </Button>
                </div>

                {/* Issue description */}
                <p className="text-xs text-muted-foreground font-body" dir="rtl">
                  ⚠️ {f.issue}
                </p>

                {/* Original */}
                <div className="text-xs p-2 rounded bg-muted/30 font-mono" dir="ltr" style={{ unicodeBidi: 'isolate' }}>
                  {f.original}
                </div>

                {/* Current vs Fix */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="p-2 rounded bg-red-500/5 border border-red-500/20">
                    <span className="text-[10px] text-red-400 block mb-1">الحالية:</span>
                    <span className="text-xs font-body" dir="rtl" style={{ unicodeBidi: 'plaintext' }}>{f.current}</span>
                  </div>
                  <div className="p-2 rounded bg-green-500/5 border border-green-500/20">
                    <span className="text-[10px] text-green-400 block mb-1">المقترحة:</span>
                    <span className="text-xs font-body" dir="rtl" style={{ unicodeBidi: 'plaintext' }}>{f.fix}</span>
                  </div>
                </div>

                {/* Apply button */}
                {f.fix && (
                  <Button size="sm" variant="outline" onClick={() => onApply(f.key, f.fix)} className="text-xs font-body w-full border-green-500/30 text-green-400 hover:bg-green-500/10">
                    <CheckCircle2 className="w-3 h-3 ml-1" /> تطبيق الإصلاح
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default SmartReviewPanel;
