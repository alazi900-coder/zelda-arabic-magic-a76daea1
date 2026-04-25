import { useState, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Check, GitCompareArrows, ChevronDown, ChevronRight, Pencil, X, Wand2, RotateCcw, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { EditorState } from "./types";
import { detectInconsistencies } from "./TranslationProgressDashboard";

interface Props {
  state: EditorState;
  updateTranslation: (key: string, value: string) => void;
}

interface UnifyOp {
  label: string;
  snapshot: Record<string, string>;          // key -> previous value
  applied: Record<string, string>;           // key -> new value (for the report)
  groupsAffected: number;
  timestamp: number;
}

export default function ConsistencyCheckPanel({ state, updateTranslation }: Props) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  // Multi-step undo stack — each entry is a snapshot of one unify operation
  const [undoStack, setUndoStack] = useState<UnifyOp[]>([]);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [confirmAutoAll, setConfirmAutoAll] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const inconsistencies = useMemo(() => detectInconsistencies(state), [state.entries, state.translations]);
  const lastOp = undoStack[undoStack.length - 1] || null;

  /** Auto-unify ALL groups by picking the most common translation in each. */
  const handleAutoUnifyAll = useCallback(() => {
    const snapshot: Record<string, string> = {};
    const applied: Record<string, string> = {};
    let totalChanged = 0;
    let groupsAffected = 0;
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
      let touchedThisGroup = false;
      for (const entry of group.translations) {
        if (entry.translation !== best) {
          snapshot[entry.key] = entry.translation;
          applied[entry.key] = best;
          updateTranslation(entry.key, best);
          totalChanged++;
          touchedThisGroup = true;
        }
      }
      if (touchedThisGroup) groupsAffected++;
    }
    setConfirmAutoAll(false);
    if (Object.keys(snapshot).length > 0) {
      setUndoStack(prev => [...prev, {
        label: `توحيد تلقائي (${totalChanged} ترجمة)`,
        snapshot, applied, groupsAffected, timestamp: Date.now(),
      }].slice(-20));
      // Auto-open report so user immediately sees the before/after summary
      setReportOpen(true);
    }
    toast({
      title: `✅ تم توحيد ${groupsAffected} مجموعة`,
      description: `تم تعديل ${totalChanged} ترجمة لتطابق الأكثر تكراراً`,
    });
  }, [inconsistencies, updateTranslation]);

  const performUndo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      for (const [key, val] of Object.entries(last.snapshot)) {
        updateTranslation(key, val);
      }
      toast({ title: `↩️ تم التراجع: ${last.label}` });
      return prev.slice(0, -1);
    });
    setConfirmUndo(false);
  }, [updateTranslation]);

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
    const applied: Record<string, string> = {};
    for (const entry of group.translations) {
      if (entry.translation !== chosen) {
        snapshot[entry.key] = entry.translation;
        applied[entry.key] = chosen;
        updateTranslation(entry.key, chosen);
      }
    }
    if (Object.keys(snapshot).length > 0) {
      setUndoStack(prev => [...prev, {
        label: `توحيد "${english.slice(0, 20)}${english.length > 20 ? "…" : ""}"`,
        snapshot, applied, groupsAffected: 1, timestamp: Date.now(),
      }].slice(-20));
    }
    setEditingGroup(null);
  };

  const applyCustomEdit = (english: string) => {
    if (editValue.trim()) handleUnify(english, editValue.trim());
    setEditingGroup(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <GitCompareArrows className="w-4 h-4 text-destructive shrink-0" />
        <span className="text-sm font-semibold">تناقضات الترجمة</span>
        <span className="text-xs bg-destructive/15 text-destructive px-1.5 py-0.5 rounded-full font-mono">{inconsistencies.length}</span>
        <div className="ms-auto flex gap-1 flex-wrap">
          {lastOp && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => setReportOpen(true)}
              title="عرض تقرير آخر توحيد"
            >
              <FileText className="w-3 h-3 ml-1" /> تقرير
            </Button>
          )}
          {undoStack.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] border-accent text-accent-foreground hover:bg-accent/20"
              onClick={() => setConfirmUndo(true)}
              title={`تراجع عن آخر توحيد (${undoStack.length} خطوة في السجل)`}
            >
              <RotateCcw className="w-3 h-3 ml-1" /> تراجع ({undoStack.length})
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-[11px]"
            onClick={() => setConfirmAutoAll(true)}
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

      {/* Confirm: undo last unify */}
      <AlertDialog open={confirmUndo} onOpenChange={setConfirmUndo}>
        <AlertDialogContent className="max-w-[92vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>التراجع عن آخر توحيد؟</AlertDialogTitle>
            <AlertDialogDescription>
              {lastOp ? (
                <>
                  سيتم إرجاع <span className="font-mono text-primary">{Object.keys(lastOp.snapshot).length}</span> ترجمة
                  إلى قيمها السابقة من العملية: <span className="font-semibold">{lastOp.label}</span>.
                  <br />
                  باقي الخطوات في السجل: <span className="font-mono">{undoStack.length - 1}</span>.
                </>
              ) : "لا يوجد توحيد سابق"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel className="mt-0">إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={performUndo}>نعم، تراجع</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm: auto-unify all */}
      <AlertDialog open={confirmAutoAll} onOpenChange={setConfirmAutoAll}>
        <AlertDialogContent className="max-w-[92vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>توحيد تلقائي لكل المجموعات؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم فحص <span className="font-mono text-primary">{inconsistencies.length}</span> مجموعة متناقضة،
              واختيار الترجمة الأكثر تكراراً في كل مجموعة وتطبيقها على الباقي.
              <br />
              يمكنك التراجع عن العملية بالكامل من زر التراجع، وسيُفتح تقرير قبل/بعد تلقائياً عند الانتهاء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel className="mt-0">إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleAutoUnifyAll}>نعم، وحّد الكل</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Report dialog: before/after summary of last unify */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4" /> تقرير آخر توحيد
            </DialogTitle>
            <DialogDescription>
              {lastOp ? (
                <span className="text-xs">
                  {lastOp.label} • {new Date(lastOp.timestamp).toLocaleTimeString("ar")}
                </span>
              ) : "لا يوجد"}
            </DialogDescription>
          </DialogHeader>

          {lastOp && (
            <>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-muted/30 rounded p-2">
                  <div className="text-[10px] text-muted-foreground">مجموعات</div>
                  <div className="text-lg font-mono text-primary">{lastOp.groupsAffected}</div>
                </div>
                <div className="bg-muted/30 rounded p-2">
                  <div className="text-[10px] text-muted-foreground">ترجمات معدّلة</div>
                  <div className="text-lg font-mono text-primary">{Object.keys(lastOp.snapshot).length}</div>
                </div>
              </div>

              <ScrollArea className="flex-1 max-h-[50vh] border border-border/30 rounded">
                <div className="p-2 space-y-2">
                  {Object.keys(lastOp.snapshot).slice(0, 100).map((key) => (
                    <div key={key} className="text-[11px] space-y-1 pb-2 border-b border-border/20 last:border-0">
                      <div className="text-[9px] font-mono text-muted-foreground truncate" dir="ltr">{key}</div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-[9px] text-destructive shrink-0 mt-0.5">قبل:</span>
                        <span className="font-body line-through opacity-60" dir="rtl">{lastOp.snapshot[key]}</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-[9px] text-primary shrink-0 mt-0.5">بعد:</span>
                        <span className="font-body" dir="rtl">{lastOp.applied[key]}</span>
                      </div>
                    </div>
                  ))}
                  {Object.keys(lastOp.snapshot).length > 100 && (
                    <div className="text-[10px] text-muted-foreground text-center py-2">
                      … و{Object.keys(lastOp.snapshot).length - 100} تعديل آخر
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
