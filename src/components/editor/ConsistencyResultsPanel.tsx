import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, X, ChevronDown, ChevronUp, Pencil } from "lucide-react";

interface ConsistencyGroup {
  term: string;
  variants: { key: string; translation: string; file: string }[];
}

interface ConsistencyResultsPanelProps {
  results: { groups: ConsistencyGroup[]; aiSuggestions: { best: string; reason: string }[] };
  onApplyFix: (groupIndex: number, bestTranslation: string) => void;
  onApplyAll: () => void;
  onClose: () => void;
}

const ConsistencyResultsPanel: React.FC<ConsistencyResultsPanelProps> = ({ results, onApplyFix, onApplyAll, onClose }) => {
  const [expandedGroup, setExpandedGroup] = React.useState<number | null>(0);
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [editValue, setEditValue] = React.useState("");

  if (results.groups.length === 0) return null;

  const startEditing = (index: number, currentTranslation: string) => {
    setEditingIndex(index);
    setEditValue(currentTranslation);
  };

  const applyCustomEdit = (index: number) => {
    if (editValue.trim()) {
      onApplyFix(index, editValue.trim());
    }
    setEditingIndex(null);
  };

  return (
    <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-base">🔍 فحص اتساق المصطلحات — {results.groups.length} تناقض</h3>
          <div className="flex gap-2">
            {results.aiSuggestions.length > 0 && (
              <Button variant="default" size="sm" onClick={onApplyAll} className="text-sm font-display">
                <CheckCircle2 className="w-4 h-4" /> توحيد الكل تلقائياً ✨
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
        </div>

        <div className="space-y-2 max-h-[450px] overflow-y-auto">
          {results.groups.map((group, i) => {
            const suggestion = results.aiSuggestions[i];
            const isExpanded = expandedGroup === i;
            const uniqueTranslations = [...new Set(group.variants.map(v => v.translation.trim()))];
            const isEditing = editingIndex === i;

            return (
              <div key={i} className="rounded-lg border border-border/50 bg-card/50 overflow-hidden">
                <button
                  onClick={() => setExpandedGroup(isExpanded ? null : i)}
                  className="w-full flex items-center justify-between p-3 text-right hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    <span className="text-sm text-muted-foreground">{uniqueTranslations.length} ترجمات مختلفة • {group.variants.length} موضع</span>
                  </div>
                  <span className="font-mono text-base font-bold" dir="ltr">"{group.term}"</span>
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2">
                    <div className="space-y-1.5">
                      {uniqueTranslations.map((t, j) => {
                        const count = group.variants.filter(v => v.translation.trim() === t).length;
                        const isBest = suggestion?.best === t;
                        return (
                          <div key={j} className={`flex items-center justify-between text-sm p-2.5 rounded ${isBest ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-muted/30'}`}>
                            <div className="flex items-center gap-2">
                              {isBest && <span className="text-emerald-500 text-xs">✅ مقترح</span>}
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => onApplyFix(i, t)}
                                className="h-7 px-2.5 text-xs font-display"
                              >
                                توحيد بهذه
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => startEditing(i, t)}
                                className="h-7 px-2 text-xs"
                                title="تعديل ثم توحيد"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                            <div className="text-right">
                              <span className="font-body text-sm leading-relaxed">{t}</span>
                              <span className="text-muted-foreground text-xs mr-2">({count}×)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Custom edit field */}
                    {isEditing && (
                      <div className="flex items-center gap-2 mt-2 bg-primary/5 rounded-md p-2 border border-primary/20">
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 text-sm h-8 font-body"
                          dir="rtl"
                          placeholder="اكتب الترجمة المعدّلة..."
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') applyCustomEdit(i);
                            if (e.key === 'Escape') setEditingIndex(null);
                          }}
                        />
                        <Button size="sm" className="h-8 px-3 text-xs" onClick={() => applyCustomEdit(i)}>
                          توحيد
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setEditingIndex(null)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    )}

                    {/* Write custom button */}
                    {!isEditing && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs mt-1 border-dashed"
                        onClick={() => startEditing(i, uniqueTranslations[0] || '')}
                      >
                        <Pencil className="w-3.5 h-3.5 ml-1" />
                        كتابة ترجمة مخصصة وتوحيد الكل
                      </Button>
                    )}

                    {suggestion?.reason && (
                      <p className="text-xs text-muted-foreground bg-muted/20 rounded p-2">
                        💡 {suggestion.reason}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default ConsistencyResultsPanel;
