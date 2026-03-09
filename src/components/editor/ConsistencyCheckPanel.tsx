import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Check, GitCompareArrows, ChevronDown, ChevronRight, Pencil, X, Copy } from "lucide-react";
import type { EditorState } from "./types";
import { detectInconsistencies } from "./TranslationProgressDashboard";

interface Props {
  state: EditorState;
  updateTranslation: (key: string, value: string) => void;
  onNavigateToEntry?: (key: string) => void;
}

export default function ConsistencyCheckPanel({ state, updateTranslation, onNavigateToEntry }: Props) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

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
    setEditingGroup(null);
  };

  const startEditing = (english: string, currentTranslation: string) => {
    setEditingGroup(english);
    setEditValue(currentTranslation);
  };

  const applyCustomEdit = (english: string) => {
    if (editValue.trim()) {
      handleUnify(english, editValue.trim());
    }
    setEditingGroup(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <GitCompareArrows className="w-5 h-5 text-destructive" />
          تناقضات الترجمة ({inconsistencies.length})
        </h3>
      </div>
      <p className="text-sm text-muted-foreground">
        نصوص إنجليزية متطابقة مُترجمة بصياغات مختلفة — اختر الترجمة الأفضل لتوحيدها أو عدّلها يدوياً
      </p>

      <div className="space-y-2 max-h-[450px] overflow-y-auto">
        {inconsistencies.slice(0, 50).map((group) => {
          const isExpanded = expandedGroup === group.english;
          const uniqueTranslations = [...new Set(group.translations.map(t => t.translation))];
          const isEditing = editingGroup === group.english;
          
          return (
            <Card key={group.english} className="p-3 border-border/50">
              <button
                className="w-full flex items-start gap-2 text-right"
                onClick={() => setExpandedGroup(isExpanded ? null : group.english)}
              >
                {isExpanded ? <ChevronDown className="w-4 h-4 shrink-0 mt-1" /> : <ChevronRight className="w-4 h-4 shrink-0 mt-1" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono text-foreground truncate" dir="ltr">{group.english}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(group.english);
                        import("@/hooks/use-toast").then(({ toast }) => toast({ title: "تم النسخ ✓", description: group.english }));
                      }}
                      title="نسخ النص الإنجليزي"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> {uniqueTranslations.length} ترجمات مختلفة
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({group.translations.length} موضع)
                    </span>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="mt-3 space-y-2 pr-6">
                  {uniqueTranslations.map((trans, i) => {
                    const count = group.translations.filter(t => t.translation === trans).length;
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm group bg-muted/20 rounded-md p-2">
                        <span className="flex-1 text-foreground font-body leading-relaxed" dir="rtl">{trans}</span>
                        <span className="text-xs text-muted-foreground shrink-0">×{count}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs opacity-70 group-hover:opacity-100 transition-opacity text-primary hover:bg-primary/10"
                          onClick={() => handleUnify(group.english, trans)}
                          title="توحيد الكل بهذه الترجمة"
                        >
                          توحيد
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs opacity-70 group-hover:opacity-100 transition-opacity text-muted-foreground hover:bg-muted/30"
                          onClick={() => startEditing(group.english, trans)}
                          title="تعديل هذه الترجمة ثم توحيد"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    );
                  })}

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
                          if (e.key === 'Enter') applyCustomEdit(group.english);
                          if (e.key === 'Escape') setEditingGroup(null);
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-8 px-3 text-xs"
                        onClick={() => applyCustomEdit(group.english)}
                      >
                        توحيد
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => setEditingGroup(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}

                  {/* Write custom translation button */}
                  {!isEditing && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs mt-1 border-dashed"
                      onClick={() => startEditing(group.english, uniqueTranslations[0] || '')}
                    >
                      <Pencil className="w-3.5 h-3.5 ml-1" />
                      كتابة ترجمة مخصصة وتوحيد الكل
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
