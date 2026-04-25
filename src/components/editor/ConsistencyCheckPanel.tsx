import { useState, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Check, GitCompareArrows, ChevronDown, ChevronRight, Pencil, X, Wand2, RotateCcw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { EditorState } from "./types";
import { detectInconsistencies } from "./TranslationProgressDashboard";

interface Props {
  state: EditorState;
  updateTranslation: (key: string, value: string) => void;
}

export default function ConsistencyCheckPanel({ state, updateTranslation }: Props) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  // Multi-step undo stack — each entry is a snapshot of one unify operation
  const [undoStack, setUndoStack] = useState<Array<{ label: string; snapshot: Record<string, string> }>>([]);

  const inconsistencies = useMemo(() => detectInconsistencies(state), [state.entries, state.translations]);

  /** Auto-unify ALL groups by picking the most common translation in each. */
  const handleAutoUnifyAll = useCallback(() => {
    const snapshot: Record<string, string> = {};
    let totalChanged = 0;
    for (const group of inconsistencies) {
      const counts = new Map<string, number>();
      for (const t of group.translations) {
        counts.set(t.translation, (counts.get(t.translation) || 0) + 1);
      }
      let best = ""; let max = 0;
      for (const [tr, c] of counts) {
        if (c > max) { max = c; best = tr; }
      }
      if (!best) continue;
      for (const entry of group.translations) {
        if (entry.translation !== best) {
          snapshot[entry.key] = entry.translation;
          updateTranslation(entry.key, best);
          totalChanged++;
        }
      }
    }
    setUndoSnapshot(Object.keys(snapshot).length > 0 ? snapshot : null);
    toast({
      title: `✅ تم توحيد ${inconsistencies.length} مجموعة`,
      description: `تم تعديل ${totalChanged} ترجمة لتطابق الأكثر تكراراً`,
    });
  }, [inconsistencies, updateTranslation]);

  const handleUndo = useCallback(() => {
    if (!undoSnapshot) return;
    for (const [key, val] of Object.entries(undoSnapshot)) {
      updateTranslation(key, val);
    }
    setUndoSnapshot(null);
    toast({ title: "↩️ تم التراجع عن آخر توحيد" });
  }, [undoSnapshot, updateTranslation]);

  if (inconsistencies.length === 0) {
    return (
      <Card className="p-3 border-border/50 text-center">
        <p className="text-sm text-primary flex items-center justify-center gap-1.5">
          <Check className="w-4 h-4" /> لا توجد تناقضات في الترجمة
        </p>
      </Card>
    );
  }

  const handleUnify = (english: string, chosen: string) => {
    const group = inconsistencies.find(g => g.english === english);
    if (!group) return;
    const snapshot: Record<string, string> = {};
    for (const entry of group.translations) {
      if (entry.translation !== chosen) {
        snapshot[entry.key] = entry.translation;
        updateTranslation(entry.key, chosen);
      }
    }
    if (Object.keys(snapshot).length > 0) setUndoSnapshot(snapshot);
    setEditingGroup(null);
  };

  const applyCustomEdit = (english: string) => {
    if (editValue.trim()) handleUnify(english, editValue.trim());
    setEditingGroup(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <GitCompareArrows className="w-4 h-4 text-destructive shrink-0" />
        <span className="text-sm font-semibold">تناقضات الترجمة</span>
        <span className="text-xs bg-destructive/15 text-destructive px-1.5 py-0.5 rounded-full font-mono">{inconsistencies.length}</span>
        <div className="ms-auto flex gap-1">
          {undoSnapshot && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] border-amber-500 text-amber-700 dark:text-amber-400"
              onClick={handleUndo}
              title="تراجع عن آخر توحيد"
            >
              <RotateCcw className="w-3 h-3 ml-1" /> تراجع
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-[11px]"
            onClick={handleAutoUnifyAll}
            title="يختار الترجمة الأكثر تكراراً في كل مجموعة ويطبقها على الباقي"
          >
            <Wand2 className="w-3 h-3 ml-1" /> توحيد تلقائي للكل
          </Button>
        </div>
      </div>

      <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
        {inconsistencies.slice(0, 50).map((group) => {
          const isExpanded = expandedGroup === group.english;
          const uniqueTranslations = [...new Set(group.translations.map(t => t.translation))];
          const isEditing = editingGroup === group.english;

          return (
            <Card key={group.english} className="border-border/40 overflow-hidden">
              <button
                className="w-full flex items-center gap-2 p-2 text-right hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedGroup(isExpanded ? null : group.english)}
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                <span className="flex-1 text-xs font-mono truncate text-foreground" dir="ltr">{group.english}</span>
                <span className="text-[10px] text-destructive shrink-0 flex items-center gap-0.5">
                  <AlertTriangle className="w-3 h-3" />{uniqueTranslations.length}
                </span>
              </button>

              {isExpanded && (
                <div className="px-3 pb-2 space-y-1.5 border-t border-border/30">
                  {uniqueTranslations.map((trans, i) => {
                    const count = group.translations.filter(t => t.translation === trans).length;
                    return (
                      <div key={i} className="flex items-center gap-1.5 text-xs bg-muted/20 rounded px-2 py-1.5 group">
                        <span className="flex-1 font-body" dir="rtl">{trans}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">×{count}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px] text-primary opacity-70 group-hover:opacity-100"
                          onClick={() => handleUnify(group.english, trans)}
                        >
                          توحيد
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-60 group-hover:opacity-100"
                          onClick={() => { setEditingGroup(group.english); setEditValue(trans); }}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                  })}

                  {isEditing ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 h-7 text-xs font-body"
                        dir="rtl"
                        placeholder="الترجمة المعدّلة..."
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') applyCustomEdit(group.english);
                          if (e.key === 'Escape') setEditingGroup(null);
                        }}
                      />
                      <Button size="sm" className="h-7 px-2 text-xs" onClick={() => applyCustomEdit(group.english)}>توحيد</Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingGroup(null)}><X className="w-3 h-3" /></Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-6 text-[11px] border-dashed mt-0.5"
                      onClick={() => { setEditingGroup(group.english); setEditValue(uniqueTranslations[0] || ''); }}
                    >
                      <Pencil className="w-3 h-3 ml-1" /> كتابة ترجمة مخصصة
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
