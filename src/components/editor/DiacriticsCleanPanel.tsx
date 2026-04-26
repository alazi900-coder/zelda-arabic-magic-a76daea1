import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, X, XCircle, Type } from "lucide-react";

export interface DiacriticsCleanResult {
  key: string;
  before: string;
  after: string;
  count: number;
  status: 'pending' | 'accepted' | 'rejected';
  /** breakdown of what diacritics were found */
  details?: { shadda: number; sukun: number; tanween: number; harakat: number; other: number };
}

interface DiacriticsCleanPanelProps {
  results: DiacriticsCleanResult[];
  onAccept: (key: string) => void;
  onReject: (key: string) => void;
  onAcceptAll: () => void;
  onClose: () => void;
}

/** Classify diacritics in text */
export function analyzeDiacritics(text: string): { shadda: number; sukun: number; tanween: number; harakat: number; other: number } {
  let shadda = 0, sukun = 0, tanween = 0, harakat = 0, other = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code === 0x0651) shadda++;
    else if (code === 0x0652) sukun++;
    else if (code >= 0x064B && code <= 0x064D) tanween++; // فتحتان ضمتان كسرتان
    else if (code >= 0x064E && code <= 0x0650) harakat++; // فتحة ضمة كسرة
    else if ((code >= 0x0610 && code <= 0x061A) || (code >= 0x0653 && code <= 0x065F) ||
             code === 0x0670 || (code >= 0x06D6 && code <= 0x06DC) ||
             (code >= 0x06DF && code <= 0x06E4) || code === 0x06E7 || code === 0x06E8 ||
             (code >= 0x06EA && code <= 0x06ED)) other++;
  }
  return { shadda, sukun, tanween, harakat, other };
}

const DiacriticsCleanPanel: React.FC<DiacriticsCleanPanelProps> = ({
  results, onAccept, onReject, onAcceptAll, onClose,
}) => {
  const pending = results.filter(r => r.status === 'pending');
  const accepted = results.filter(r => r.status === 'accepted').length;
  const rejected = results.filter(r => r.status === 'rejected').length;

  if (results.length === 0) return null;

  // Summary stats
  const totalStats = results.reduce((acc, r) => {
    const d = r.details || analyzeDiacritics(r.before);
    return {
      shadda: acc.shadda + d.shadda,
      sukun: acc.sukun + d.sukun,
      tanween: acc.tanween + d.tanween,
      harakat: acc.harakat + d.harakat,
      other: acc.other + d.other,
    };
  }, { shadda: 0, sukun: 0, tanween: 0, harakat: 0, other: 0 });

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-display font-bold text-sm flex items-center gap-2">
              <Type className="w-4 h-4 text-primary" />
              إزالة التشكيلات — {results.length} نتيجة
              {accepted > 0 && <Badge variant="secondary" className="text-[10px]">✅ {accepted}</Badge>}
              {rejected > 0 && <Badge variant="destructive" className="text-[10px]">❌ {rejected}</Badge>}
            </h3>
            {/* Breakdown badges */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {totalStats.shadda > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1">شدّة <span className="font-mono">{totalStats.shadda}</span></Badge>
              )}
              {totalStats.sukun > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1">سُكون <span className="font-mono">{totalStats.sukun}</span></Badge>
              )}
              {totalStats.tanween > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1">تنوين <span className="font-mono">{totalStats.tanween}</span></Badge>
              )}
              {totalStats.harakat > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1">حركات <span className="font-mono">{totalStats.harakat}</span></Badge>
              )}
              {totalStats.other > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1">أخرى <span className="font-mono">{totalStats.other}</span></Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {pending.length > 0 && (
              <Button variant="default" size="sm" onClick={onAcceptAll} className="text-xs font-display">
                <CheckCircle2 className="w-3 h-3" /> موافقة على الكل ({pending.length})
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {results.map((item) => {
            if (item.status !== 'pending') return null;
            const details = item.details || analyzeDiacritics(item.before);
            const detailParts: string[] = [];
            if (details.shadda) detailParts.push(`${details.shadda} شدّة`);
            if (details.sukun) detailParts.push(`${details.sukun} سُكون`);
            if (details.tanween) detailParts.push(`${details.tanween} تنوين`);
            if (details.harakat) detailParts.push(`${details.harakat} حركات`);
            if (details.other) detailParts.push(`${details.other} أخرى`);

            return (
              <div
                key={item.key}
                className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground font-mono truncate" dir="ltr">
                    {item.key.split(':').slice(1, 3).join(':')}
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    {detailParts.join(' • ')}
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-destructive shrink-0 mt-1">قبل:</span>
                  <p className="text-sm font-body text-foreground bg-destructive/5 rounded px-2 py-1 flex-1 leading-relaxed" dir="rtl">
                    {item.before}
                  </p>
                </div>

                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-secondary shrink-0 mt-1">بعد:</span>
                  <p className="text-sm font-body text-foreground bg-secondary/5 rounded px-2 py-1 flex-1 leading-relaxed" dir="rtl">
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

export default DiacriticsCleanPanel;
