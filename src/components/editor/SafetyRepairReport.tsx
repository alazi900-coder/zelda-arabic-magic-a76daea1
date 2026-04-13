import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShieldCheck, Wrench, RotateCcw } from "lucide-react";
import type { SafetyRepairEntry } from "@/hooks/useEditorBuild";

interface SafetyRepairReportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repairs: SafetyRepairEntry[];
  onNavigateToEntry?: (key: string) => void;
}

export default function SafetyRepairReport({ open, onOpenChange, repairs, onNavigateToEntry }: SafetyRepairReportProps) {
  const repaired = repairs.filter(r => r.action === 'repaired');
  const reverted = repairs.filter(r => r.action === 'reverted');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-secondary" />
            تقرير حماية البناء
          </DialogTitle>
          <DialogDescription className="font-body text-sm">
            تفاصيل الترجمات التي تم إصلاحها أو استعادتها تلقائياً
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="flex gap-2">
          {repaired.length > 0 && (
            <Badge className="bg-secondary/20 text-secondary border-secondary/30 gap-1">
              <Wrench className="w-3 h-3" />
              {repaired.length} تم إصلاحها
            </Badge>
          )}
          {reverted.length > 0 && (
            <Badge variant="destructive" className="gap-1">
              <RotateCcw className="w-3 h-3" />
              {reverted.length} تم استعادة الأصل
            </Badge>
          )}
        </div>

        <ScrollArea className="max-h-96" dir="rtl">
          <div className="space-y-1.5">
            {repairs.map((entry, i) => (
              <div
                key={`${entry.key}-${i}`}
                className={`p-2 rounded text-xs border ${
                  entry.action === 'repaired'
                    ? 'bg-secondary/5 border-secondary/20'
                    : 'bg-destructive/5 border-destructive/20'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[10px] text-muted-foreground truncate">{entry.label}</p>
                    <p className="text-foreground mt-0.5">
                      {entry.action === 'repaired' ? '🔧' : '↩️'} {entry.reason}
                    </p>
                    <div className="flex gap-2 mt-1">
                      {entry.missingControl > 0 && (
                        <span className="text-[10px] text-destructive">
                          رموز تحكم مفقودة: {entry.missingControl}
                        </span>
                      )}
                      {entry.missingPua > 0 && (
                        <span className="text-[10px] text-destructive">
                          رموز خاصة مفقودة: {entry.missingPua}
                        </span>
                      )}
                    </div>
                  </div>
                  {onNavigateToEntry && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 shrink-0"
                      onClick={() => {
                        onNavigateToEntry(entry.key);
                        onOpenChange(false);
                      }}
                      title="انتقل للنص"
                    >
                      🔍
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-body">
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
