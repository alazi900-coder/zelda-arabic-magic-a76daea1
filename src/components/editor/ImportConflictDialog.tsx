import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
// native scroll used for better mobile touch support
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, XCircle, ArrowRight } from "lucide-react";

export interface ImportConflict {
  key: string;
  label: string; // short display label
  oldValue: string;
  newValue: string;
}

interface ImportConflictDialogProps {
  open: boolean;
  conflicts: ImportConflict[];
  onConfirm: (acceptedKeys: Set<string>) => void;
  onCancel: () => void;
}

const ImportConflictDialog = ({
  open,
  conflicts,
  onConfirm,
  onCancel,
}: ImportConflictDialogProps) => {
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set(conflicts.map(c => c.key)));

  // Reset when conflicts change
  React.useEffect(() => {
    setAccepted(new Set(conflicts.map(c => c.key)));
  }, [conflicts]);

  const allAccepted = accepted.size === conflicts.length;
  const noneAccepted = accepted.size === 0;

  const toggleKey = (key: string) => {
    setAccepted(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (allAccepted) {
      setAccepted(new Set());
    } else {
      setAccepted(new Set(conflicts.map(c => c.key)));
    }
  };

  const invertSelection = () => {
    setAccepted(prev => {
      const next = new Set<string>();
      for (const c of conflicts) {
        if (!prev.has(c.key)) next.add(c.key);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <ArrowRight className="w-5 h-5 text-primary" />
            ⚠️ يوجد {conflicts.length} نص مترجم مسبقاً سيتم استبداله
          </DialogTitle>
          <DialogDescription>
            اختر النصوص التي تريد استبدالها بالترجمة المستوردة، أو ألغِ لإبقاء الترجمة الحالية.
          </DialogDescription>
        </DialogHeader>

        {/* Select All / None */}
        <div className="flex items-center gap-3 px-1 py-2 border-b border-border">
          <Checkbox
            checked={allAccepted}
            onCheckedChange={toggleAll}
            id="select-all"
          />
          <label htmlFor="select-all" className="text-sm font-bold cursor-pointer">
            {allAccepted ? "إلغاء تحديد الكل" : "تحديد الكل"} ({accepted.size}/{conflicts.length})
          </label>
          <Button variant="ghost" size="sm" onClick={invertSelection} className="text-xs mr-auto">
            🔄 عكس التحديد
          </Button>
        </div>

        {/* Conflict list */}
        <div className="flex-1 min-h-0 max-h-[55vh] overflow-y-auto overflow-x-hidden -webkit-overflow-scrolling-touch">
          <div className="space-y-2 p-1">
            {conflicts.map((c) => {
              const isAccepted = accepted.has(c.key);
              return (
                <div
                  key={c.key}
                  className={`rounded-lg border p-3 transition-colors cursor-pointer ${
                    isAccepted
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-muted/30 opacity-60"
                  }`}
                  onClick={() => toggleKey(c.key)}
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={isAccepted}
                      onCheckedChange={() => toggleKey(c.key)}
                      className="mt-1 shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <p className="text-[10px] text-muted-foreground font-mono truncate">{c.label}</p>
                      <div className="flex gap-2">
                        <div className="flex-1 min-w-0 bg-destructive/10 rounded p-2 border border-destructive/20">
                          <p className="text-[10px] text-destructive font-bold mb-0.5">🔴 الحالية</p>
                          <p className="text-xs leading-relaxed break-words overflow-hidden" dir="auto">{c.oldValue}</p>
                        </div>
                        <div className="flex-1 min-w-0 bg-green-500/10 rounded p-2 border border-green-500/20">
                          <p className="text-[10px] text-green-600 font-bold mb-0.5">🟢 المستوردة</p>
                          <p className="text-xs leading-relaxed break-words overflow-hidden" dir="auto">{c.newValue}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 justify-end pt-2 border-t border-border">
          <Button variant="outline" onClick={onCancel}>
            <XCircle className="w-4 h-4 ml-1" />
            إلغاء
          </Button>
          <Button
            onClick={() => onConfirm(accepted)}
            disabled={noneAccepted}
            className="gap-1"
          >
            <CheckCircle2 className="w-4 h-4 ml-1" />
            استبدال {accepted.size} ترجمة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportConflictDialog;
