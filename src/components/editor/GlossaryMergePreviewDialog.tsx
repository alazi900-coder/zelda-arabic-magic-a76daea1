import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, X, ArrowRight, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface GlossaryMergeDiff {
  key: string;
  newValue: string;
  oldValue?: string;
  type: 'new' | 'changed' | 'same';
}

interface GlossaryMergePreviewDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (accepted: GlossaryMergeDiff[]) => void;
  glossaryName: string;
  diffs: GlossaryMergeDiff[];
}

type FilterTab = 'all' | 'new' | 'changed';

const GlossaryMergePreviewDialog: React.FC<GlossaryMergePreviewDialogProps> = ({
  open, onClose, onConfirm, glossaryName, diffs,
}) => {
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<FilterTab>('all');

  const counts = useMemo(() => ({
    new: diffs.filter(d => d.type === 'new').length,
    changed: diffs.filter(d => d.type === 'changed').length,
    same: diffs.filter(d => d.type === 'same').length,
  }), [diffs]);

  const filtered = useMemo(() => {
    if (tab === 'all') return diffs.filter(d => d.type !== 'same');
    return diffs.filter(d => d.type === tab);
  }, [diffs, tab]);

  const toggleReject = (key: string) => {
    setRejected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleConfirm = () => {
    const accepted = diffs.filter(d => !rejected.has(d.key));
    onConfirm(accepted);
  };

  const activeCount = diffs.filter(d => d.type !== 'same' && !rejected.has(d.key)).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            📖 معاينة دمج القاموس: {glossaryName}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            راجع التغييرات قبل الدمج. يمكنك رفض مصطلحات فردية.
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary" className="gap-1">🆕 جديد: {counts.new}</Badge>
          <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-600">
            <AlertTriangle className="w-3 h-3" /> مُعدّل: {counts.changed}
          </Badge>
          <Badge variant="outline" className="gap-1 text-muted-foreground">✓ متطابق: {counts.same}</Badge>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border pb-1">
          {([
            ['all', `الكل (${counts.new + counts.changed})`],
            ['new', `جديد (${counts.new})`],
            ['changed', `مُعدّل (${counts.changed})`],
          ] as [FilterTab, string][]).map(([t, label]) => (
            <Button
              key={t}
              variant={tab === t ? "default" : "ghost"}
              size="sm"
              className="text-xs h-7"
              onClick={() => setTab(t)}
            >
              {label}
            </Button>
          ))}
        </div>

        {/* Diff list */}
        <ScrollArea className="flex-1 min-h-0 max-h-[50vh]">
          <div className="space-y-1.5 p-1">
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">لا توجد تغييرات في هذه الفئة</p>
            )}
            {filtered.map((d) => {
              const isRejected = rejected.has(d.key);
              return (
                <div
                  key={d.key}
                  className={`p-2.5 rounded border text-xs transition-opacity ${
                    isRejected ? 'opacity-40 border-border bg-muted/30' : 
                    d.type === 'changed' ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-foreground font-medium">{d.key}</span>
                      {d.type === 'changed' && d.oldValue && (
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-destructive line-through" dir="rtl">{d.oldValue}</span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-emerald-600 font-medium" dir="rtl">{d.newValue}</span>
                        </div>
                      )}
                      {d.type === 'new' && (
                        <div className="mt-1">
                          <span className="text-emerald-600 font-medium" dir="rtl">{d.newValue}</span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant={isRejected ? "outline" : "ghost"}
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0"
                      onClick={() => toggleReject(d.key)}
                      title={isRejected ? "إعادة القبول" : "رفض"}
                    >
                      {isRejected ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <X className="w-3.5 h-3.5 text-destructive" />}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-row-reverse gap-2 pt-2 flex-wrap">
          <Button onClick={handleConfirm} className="font-display gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> دمج ({activeCount} مصطلح)
          </Button>
          <Button variant="outline" onClick={onClose} className="font-display">
            إلغاء
          </Button>
          <div className="flex gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              className="text-xs font-display gap-1"
              onClick={() => setRejected(new Set())}
              disabled={rejected.size === 0}
            >
              <CheckCircle2 className="w-3 h-3" /> قبول الكل
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="text-xs font-display gap-1"
              onClick={() => {
                const allKeys = new Set(diffs.filter(d => d.type !== 'same').map(d => d.key));
                setRejected(allKeys);
              }}
              disabled={rejected.size === diffs.filter(d => d.type !== 'same').length}
            >
              <X className="w-3 h-3" /> رفض الكل
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GlossaryMergePreviewDialog;
