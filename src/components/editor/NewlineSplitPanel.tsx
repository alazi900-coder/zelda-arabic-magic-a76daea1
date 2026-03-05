import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, RefreshCw, X, XCircle } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { visualLength } from "@/lib/balance-lines";

export interface NewlineSplitResult {
  key: string;
  originalLines: number;
  translationLines: number;
  before: string;
  after: string;
  original: string;
  status: 'pending' | 'accepted' | 'rejected';
}

interface NewlineSplitPanelProps {
  results: NewlineSplitResult[];
  onAccept: (key: string) => void;
  onReject: (key: string) => void;
  onAcceptAll: () => void;
  onClose: () => void;
  charLimit: number;
  onCharLimitChange: (limit: number) => void;
  onRescan: () => void;
  title?: string;
}

const NewlineSplitPanel: React.FC<NewlineSplitPanelProps> = ({
  results, onAccept, onReject, onAcceptAll, onClose,
  charLimit, onCharLimitChange, onRescan, title,
}) => {
  const pending = results.filter(r => r.status === 'pending');
  const accepted = results.filter(r => r.status === 'accepted').length;
  const rejected = results.filter(r => r.status === 'rejected').length;

  if (results.length === 0) return null;

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-sm">
            {title || '📐 تقسيم النصوص المضغوطة'} — {results.length} نتيجة
            {accepted > 0 && <span className="text-secondary mr-2"> ✅ {accepted}</span>}
            {rejected > 0 && <span className="text-destructive mr-2"> ❌ {rejected}</span>}
          </h3>
          <div className="flex gap-2">
            {pending.length > 0 && (
              <Button variant="default" size="sm" onClick={onAcceptAll} className="text-xs font-display">
                <CheckCircle2 className="w-3 h-3" /> موافقة على الكل ({pending.length}) ✨
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Char limit slider */}
        <div className="flex items-center gap-3 mb-4 p-2 rounded-md bg-muted/30 border border-border/30">
          <span className="text-xs font-display text-muted-foreground shrink-0">الحد الأقصى:</span>
          <Slider
            value={[charLimit]}
            onValueChange={([v]) => onCharLimitChange(v)}
            min={20}
            max={80}
            step={1}
            className="flex-1"
          />
          <span className="text-sm font-mono font-bold text-primary w-8 text-center">{charLimit}</span>
          <Button variant="outline" size="sm" onClick={onRescan} className="h-7 px-2 text-xs font-display">
            <RefreshCw className="w-3 h-3" /> إعادة فحص
          </Button>
        </div>

        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {results.map((item) => {
            if (item.status !== 'pending') return null;
            return (
              <div
                key={item.key}
                className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground font-mono truncate" dir="ltr">
                    {item.key.split(':').slice(1, 3).join(':')}
                  </p>
                  <span className="text-[10px]">
                    👁 <span className={visualLength(item.before) > charLimit ? 'text-destructive font-bold' : 'text-secondary'}>{visualLength(item.before)}</span>
                    <span className="text-muted-foreground"> حرف بصري • {item.before.length} حرف خام → {item.originalLines} أسطر</span>
                  </span>
                </div>

                {/* Original text */}
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-muted-foreground shrink-0 mt-1">أصلي:</span>
                  <p className="text-xs font-mono text-muted-foreground bg-muted/30 rounded px-2 py-1 flex-1 whitespace-pre-wrap" dir="ltr">
                    {item.original}
                  </p>
                </div>

                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-destructive shrink-0 mt-1">قبل:</span>
                  <p className="text-sm font-body text-foreground bg-destructive/5 rounded px-2 py-1 flex-1 whitespace-pre-wrap" dir="rtl">
                    {item.before}
                  </p>
                </div>

                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-secondary shrink-0 mt-1">بعد:</span>
                  <p className="text-sm font-body text-foreground bg-secondary/5 rounded px-2 py-1 flex-1 whitespace-pre-wrap" dir="rtl">
                    {item.after}
                  </p>
                </div>

                <div className="flex items-center gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReject(item.key)}
                    className="h-7 px-2 text-xs font-display border-destructive/30 text-destructive hover:text-destructive"
                  >
                    <XCircle className="w-3 h-3" /> رفض
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAccept(item.key)}
                    className="h-7 px-2 text-xs font-display border-secondary/30 text-secondary hover:text-secondary"
                  >
                    <CheckCircle2 className="w-3 h-3" /> قبول
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {pending.length === 0 && (
          <p className="text-center text-sm text-muted-foreground font-body py-4">
            ✅ تمت مراجعة جميع النتائج — {accepted} مقبولة، {rejected} مرفوضة
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default NewlineSplitPanel;
