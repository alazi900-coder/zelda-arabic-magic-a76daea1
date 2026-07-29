import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Eye, AlertTriangle, ChevronRight, Check, X, Table2, Columns3 } from "lucide-react";
import DebouncedInput from "./DebouncedInput";
import { measureEntryBytes } from "@/lib/entry-bytes";
import { ExtractedEntry, displayOriginal } from "./types";

interface QuickReviewModeProps {
  filteredEntries: ExtractedEntry[];
  quickReviewIndex: number;
  setQuickReviewIndex: (idx: number) => void;
  setQuickReviewMode: (mode: boolean) => void;
  translations: Record<string, string>;
  qualityProblemKeys: Set<string>;
  updateTranslation: (key: string, value: string) => void;
}

const QuickReviewMode: React.FC<QuickReviewModeProps> = ({
  filteredEntries, quickReviewIndex, setQuickReviewIndex, setQuickReviewMode,
  translations, qualityProblemKeys, updateTranslation,
}) => {
  if (filteredEntries.length === 0) return null;

  const entry = filteredEntries[quickReviewIndex];
  if (!entry) return null;
  const key = `${entry.msbtFile}:${entry.index}`;
  const translation = translations[key] || '';
  const hasProblem = qualityProblemKeys.has(key);
  const byteUsed = entry.maxBytes > 0 ? measureEntryBytes(entry.msbtFile, translation) : 0;

  return (
    <Card className="mb-6 border-primary/30">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            المراجعة السريعة
          </h3>
          <span className="text-sm text-muted-foreground font-display">
            {quickReviewIndex + 1} / {filteredEntries.length}
          </span>
        </div>
        <Progress value={((quickReviewIndex + 1) / filteredEntries.length) * 100} className="h-1.5 mb-4" />

        {(() => {
          const match = entry.label.match(/^(.+?)\[(\d+)\]\.(.+)$/);
          if (match) {
            const [, tblName, rowIdx, colName] = match;
            return (
              <div className="flex flex-wrap items-center gap-1.5 mb-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary/15 text-secondary border border-secondary/20">
                  <Table2 className="w-3 h-3" /> {tblName}
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/20">
                  <Columns3 className="w-3 h-3" /> {colName}
                </span>
                <span className="text-muted-foreground/60">صف {rowIdx}</span>
              </div>
            );
          }
          return <p className="text-xs text-muted-foreground mb-2">{entry.msbtFile} • {entry.label}</p>;
        })()}
        <div className="p-3 rounded border border-border/50 bg-muted/30 mb-3">
          <p className="text-xs text-muted-foreground mb-1">النص الأصلي:</p>
          <p className="font-body text-sm">{displayOriginal(entry.original)}</p>
        </div>
        {hasProblem && (
          <p className="text-xs text-destructive mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> هذا النص به مشكلة
            {entry.maxBytes > 0 && byteUsed > entry.maxBytes && ` (${byteUsed}/${entry.maxBytes} بايت)`}
          </p>
        )}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-1">الترجمة:</p>
          <DebouncedInput
            value={translation}
            onChange={(val) => updateTranslation(key, val)}
            placeholder="أدخل الترجمة..."
            className="w-full px-3 py-2 rounded bg-background border border-border font-body text-sm"
            autoFocus
            multiline
          />
          {entry.maxBytes > 0 && (
            <p className={`text-xs mt-1 ${byteUsed > entry.maxBytes ? 'text-destructive' : 'text-muted-foreground'}`}>
              {byteUsed}/{entry.maxBytes} بايت
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setQuickReviewIndex(Math.max(0, quickReviewIndex - 1))} disabled={quickReviewIndex === 0}>
            <ChevronRight className="w-4 h-4" /> السابق
          </Button>
          <Button variant="default" size="sm" onClick={() => setQuickReviewIndex(Math.min(filteredEntries.length - 1, quickReviewIndex + 1))} disabled={quickReviewIndex >= filteredEntries.length - 1} className="flex-1">
            <Check className="w-4 h-4" /> قبول والتالي
          </Button>
          <Button variant="destructive" size="sm" onClick={() => { updateTranslation(key, ''); setQuickReviewIndex(Math.min(filteredEntries.length - 1, quickReviewIndex + 1)); }} disabled={quickReviewIndex >= filteredEntries.length - 1 && !translation}>
            <X className="w-4 h-4" /> رفض
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setQuickReviewMode(false)}>إغلاق</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default QuickReviewMode;
