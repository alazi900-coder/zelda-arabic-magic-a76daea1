import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, GitCompareArrows, ChevronDown, ChevronRight } from "lucide-react";
import type { EditorState } from "./types";
import { detectInconsistencies } from "./TranslationProgressDashboard";

interface Props {
  state: EditorState;
  updateTranslation: (key: string, value: string) => void;
  onNavigateToEntry?: (key: string) => void;
}

export default function ConsistencyCheckPanel({ state, updateTranslation, onNavigateToEntry }: Props) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const inconsistencies = useMemo(() => detectInconsistencies(state), [state.entries, state.translations]);

  if (inconsistencies.length === 0) {
    return (
      <Card className="p-4 border-border/50 text-center">
        <Check className="w-8 h-8 mx-auto text-primary mb-2" />
        <p className="text-sm font-semibold text-primary">✅ لا توجد تناقضات</p>
        <p className="text-xs text-muted-foreground mt-1">جميع النصوص المتطابقة مترجمة بنفس الصياغة</p>
      </Card>
    );
  }

  const handleUnify = (english: string, chosenTranslation: string) => {
    const group = inconsistencies.find(g => g.english === english);
    if (!group) return;
    for (const entry of group.translations) {
      if (entry.translation !== chosenTranslation) {
        updateTranslation(entry.key, chosenTranslation);
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <GitCompareArrows className="w-4 h-4 text-destructive" />
          تناقضات الترجمة ({inconsistencies.length})
        </h3>
      </div>
      <p className="text-[11px] text-muted-foreground">
        نصوص إنجليزية متطابقة مُترجمة بصياغات مختلفة — اختر الترجمة الأفضل لتوحيدها
      </p>

      <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
        {inconsistencies.slice(0, 50).map((group) => {
          const isExpanded = expandedGroup === group.english;
          const uniqueTranslations = [...new Set(group.translations.map(t => t.translation))];
          
          return (
            <Card key={group.english} className="p-2 border-border/50">
              <button
                className="w-full flex items-start gap-2 text-right"
                onClick={() => setExpandedGroup(isExpanded ? null : group.english)}
              >
                {isExpanded ? <ChevronDown className="w-4 h-4 shrink-0 mt-0.5" /> : <ChevronRight className="w-4 h-4 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-foreground truncate" dir="ltr">{group.english}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-destructive flex items-center gap-0.5">
                      <AlertTriangle className="w-3 h-3" /> {uniqueTranslations.length} ترجمات مختلفة
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      ({group.translations.length} موضع)
                    </span>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="mt-2 space-y-1.5 pr-6">
                  {uniqueTranslations.map((trans, i) => {
                    const count = group.translations.filter(t => t.translation === trans).length;
                    return (
                      <div key={i} className="flex items-center gap-2 text-[11px] group">
                        <span className="flex-1 text-foreground font-body" dir="rtl">{trans}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">×{count}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:bg-primary/10"
                          onClick={() => handleUnify(group.english, trans)}
                        >
                          توحيد
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
