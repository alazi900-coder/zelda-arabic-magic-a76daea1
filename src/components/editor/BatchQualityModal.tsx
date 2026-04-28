import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ClipboardCheck, RotateCcw } from "lucide-react";
import type { BatchQualityStats, CumulativeQuality, BatchQualityError } from "@/lib/batch-quality";

interface Props {
  lastBatch: BatchQualityStats | null;
  cumulative: CumulativeQuality;
  onReset: () => void;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

const StatRow: React.FC<{ label: string; ok: number; total: number; warnAt?: number }> = ({ label, ok, total, warnAt = 95 }) => {
  const p = pct(ok, total);
  const tone = p >= warnAt ? "text-emerald-500" : p >= 80 ? "text-amber-500" : "text-destructive";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={tone}>
          <span className="font-mono font-semibold">{ok}</span>
          <span className="text-muted-foreground"> / {total}</span>
          <span className="ms-2 font-semibold">({p}%)</span>
        </span>
      </div>
      <Progress value={p} className="h-1.5" />
    </div>
  );
};

const ErrorList: React.FC<{ errors: BatchQualityError[] }> = ({ errors }) => {
  if (!errors.length) {
    return <p className="text-sm text-muted-foreground py-4 text-center">لا توجد أخطاء مسجلة 🎉</p>;
  }
  return (
    <ScrollArea className="h-[280px] pe-2">
      <div className="space-y-2">
        {errors.map((e, i) => (
          <div key={i} className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px] font-mono">{e.key}</Badge>
              <span className="text-destructive">{e.reason}</span>
            </div>
            {e.sample && (
              <code className="block text-muted-foreground break-all" dir="auto">{e.sample}</code>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};

export const BatchQualityModal: React.FC<Props> = ({ lastBatch, cumulative, onReset }) => {
  const [open, setOpen] = useState(false);
  const hasData = cumulative.batches > 0 || lastBatch !== null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <ClipboardCheck className="w-4 h-4" />
          <span className="hidden sm:inline">جودة الدفعات</span>
          {cumulative.batches > 0 && (
            <Badge variant="secondary" className="ms-1 text-[10px] h-4 px-1.5">{cumulative.batches}</Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>تقرير جودة الترجمة</span>
            {hasData && (
              <Button variant="ghost" size="sm" onClick={onReset} className="gap-1 text-xs">
                <RotateCcw className="w-3.5 h-3.5" /> تصفير
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {!hasData ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            لم تُنفَّذ أي دفعة ترجمة بعد. شغّل ترجمة دفعية لرؤية الإحصاءات هنا.
          </p>
        ) : (
          <Tabs defaultValue="last">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="last" disabled={!lastBatch}>آخر دفعة</TabsTrigger>
              <TabsTrigger value="cumulative">تراكمي ({cumulative.batches})</TabsTrigger>
            </TabsList>

            <TabsContent value="last" className="space-y-3 mt-3">
              {lastBatch && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">JSON صالح:</span>
                    <Badge variant={lastBatch.validJson ? "default" : "destructive"}>
                      {lastBatch.validJson ? "نعم" : "لا"}
                    </Badge>
                  </div>
                  <StatRow label="حروف عربية موجودة" ok={lastBatch.withArabic} total={lastBatch.total} />
                  <StatRow label="placeholders سليمة" ok={lastBatch.placeholdersOk} total={lastBatch.total} />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">سطور (\n) أُزيلت تلقائياً:</span>
                    <span className="font-mono">{lastBatch.newlineStripped}</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-2 text-muted-foreground">عينات الأخطاء</p>
                    <ErrorList errors={lastBatch.errors} />
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="cumulative" className="space-y-3 mt-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md bg-muted/40 p-2">
                  <div className="text-muted-foreground text-xs">دفعات</div>
                  <div className="font-mono font-bold text-lg">{cumulative.batches}</div>
                </div>
                <div className="rounded-md bg-muted/40 p-2">
                  <div className="text-muted-foreground text-xs">إدخالات</div>
                  <div className="font-mono font-bold text-lg">{cumulative.total}</div>
                </div>
              </div>
              <StatRow label="حروف عربية موجودة" ok={cumulative.withArabic} total={cumulative.total} />
              <StatRow label="placeholders سليمة" ok={cumulative.placeholdersOk} total={cumulative.total} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">سطور (\n) أُزيلت تلقائياً:</span>
                <span className="font-mono">{cumulative.newlineStripped}</span>
              </div>
              <div>
                <p className="text-xs font-semibold mb-2 text-muted-foreground">آخر عينات الأخطاء</p>
                <ErrorList errors={cumulative.errors} />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BatchQualityModal;
