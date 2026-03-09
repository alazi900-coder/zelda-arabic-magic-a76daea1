import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle, CheckCheck, X, BookOpen } from "lucide-react";

interface GlossaryPreviewEntry {
  key: string;
  original: string;
  newTranslation: string;
  oldTranslation: string;
  matchType: 'exact' | 'partial';
}

interface GlossaryTranslationPreviewProps {
  open: boolean;
  entries: GlossaryPreviewEntry[];
  onApply: (selectedKeys: Set<string>) => void;
  onDiscard: () => void;
}

/* ─── Word-level diff (LCS-based) ─── */
type DiffToken = { text: string; type: 'same' | 'added' | 'removed' };

function computeWordDiff(oldText: string, newText: string): DiffToken[] {
  if (!oldText && !newText) return [];
  if (!oldText) return newText.split(/(\s+)/).filter(Boolean).map(t => ({ text: t, type: 'added' }));
  if (!newText) return oldText.split(/(\s+)/).filter(Boolean).map(t => ({ text: t, type: 'removed' }));

  const oldTokens = oldText.split(/(\s+)/).filter(Boolean);
  const newTokens = newText.split(/(\s+)/).filter(Boolean);
  const n = oldTokens.length;
  const m = newTokens.length;

  // Safety: fall back to simple highlight if texts are very long
  if (n * m > 50000) {
    return [
      { text: oldText, type: 'removed' },
      { text: newText, type: 'added' },
    ];
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = oldTokens[i - 1] === newTokens[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result: DiffToken[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      result.unshift({ text: oldTokens[i - 1], type: 'same' });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ text: newTokens[j - 1], type: 'added' });
      j--;
    } else {
      result.unshift({ text: oldTokens[i - 1], type: 'removed' });
      i--;
    }
  }
  return result;
}

/* ─── Old translation view: show same + removed (struck-through) ─── */
function OldTranslationDiff({ diff }: { diff: DiffToken[] }) {
  return (
    <span dir="rtl">
      {diff.map((token, i) => {
        if (token.type === 'added') return null;
        if (/^\s+$/.test(token.text)) return <span key={i}>{token.text}</span>;
        if (token.type === 'removed') {
          return <span key={i} className="line-through text-destructive/80 bg-destructive/10 rounded px-0.5">{token.text}</span>;
        }
        return <span key={i}>{token.text}</span>;
      })}
    </span>
  );
}

/* ─── New translation view: show same + added (highlighted) ─── */
function NewTranslationDiff({ diff }: { diff: DiffToken[] }) {
  return (
    <span dir="rtl">
      {diff.map((token, i) => {
        if (token.type === 'removed') return null;
        if (/^\s+$/.test(token.text)) return <span key={i}>{token.text}</span>;
        if (token.type === 'added') {
          return <span key={i} className="bg-amber-500/25 text-amber-300 border-b border-amber-500/60 rounded-sm px-0.5 font-semibold">{token.text}</span>;
        }
        return <span key={i}>{token.text}</span>;
      })}
    </span>
  );
}

const GlossaryTranslationPreview: React.FC<GlossaryTranslationPreviewProps> = ({
  open, entries, onApply, onDiscard,
}) => {
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    for (const e of entries) initial[e.key] = true;
    setDecisions(initial);
  }, [entries]);

  const acceptAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const e of entries) next[e.key] = true;
    setDecisions(next);
  }, [entries]);

  const rejectAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const e of entries) next[e.key] = false;
    setDecisions(next);
  }, [entries]);

  const toggle = useCallback((key: string, value: boolean) => {
    setDecisions(prev => ({ ...prev, [key]: value }));
  }, []);

  const acceptedCount = useMemo(() => Object.values(decisions).filter(Boolean).length, [decisions]);
  const modifiedCount = useMemo(() => entries.filter(e => e.oldTranslation.trim()).length, [entries]);
  const newCount = useMemo(() => entries.filter(e => !e.oldTranslation.trim()).length, [entries]);

  // Pre-compute diffs for entries with old translations
  const diffMap = useMemo(() => {
    const map = new Map<string, DiffToken[]>();
    for (const e of entries) {
      if (e.oldTranslation.trim()) {
        map.set(e.key, computeWordDiff(e.oldTranslation, e.newTranslation));
      }
    }
    return map;
  }, [entries]);

  const handleApply = useCallback(() => {
    const selected = new Set(entries.filter(e => decisions[e.key]).map(e => e.key));
    onApply(selected);
  }, [entries, decisions, onApply]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onDiscard(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookOpen className="w-5 h-5 text-primary" />
            معاينة ترجمة القاموس
          </DialogTitle>
          <DialogDescription className="text-xs">
            راجع التغييرات وقبّل أو ارفض كل إدخال — الكلمات المتأثرة مميزة باللون
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="secondary">{entries.length} إجمالي</Badge>
            {modifiedCount > 0 && <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">{modifiedCount} معدّل</Badge>}
            {newCount > 0 && <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">{newCount} جديد</Badge>}
            <span className="text-xs text-muted-foreground mr-auto">
              {acceptedCount} مقبول من {entries.length}
            </span>
          </div>
        </DialogHeader>

        {/* Global actions */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-muted/20">
          <Button variant="outline" size="sm" onClick={acceptAll} className="text-xs h-7 gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10">
            <CheckCheck className="w-3.5 h-3.5" /> قبول الكل
          </Button>
          <Button variant="outline" size="sm" onClick={rejectAll} className="text-xs h-7 gap-1 text-destructive border-destructive/30 hover:bg-destructive/10">
            <XCircle className="w-3.5 h-3.5" /> رفض الكل
          </Button>
        </div>

        {/* Entry list */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="divide-y divide-border/50">
            {entries.map((entry) => {
              const isAccepted = decisions[entry.key] ?? true;
              const hasOld = !!entry.oldTranslation.trim();
              const diff = diffMap.get(entry.key);

              return (
                <div
                  key={entry.key}
                  className={`p-3 transition-colors ${isAccepted ? 'bg-background' : 'bg-muted/30 opacity-60'}`}
                >
                  {/* Key + badge */}
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="text-[10px] text-muted-foreground truncate flex-1 font-mono">{entry.key}</div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${entry.matchType === 'exact' ? 'border-blue-500/40 text-blue-400' : 'border-amber-500/40 text-amber-400'}`}>
                        {entry.matchType === 'exact' ? 'كامل' : 'جزئي'}
                      </Badge>
                      {hasOld && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-orange-500/40 text-orange-400">معدّل</Badge>}
                    </div>
                  </div>

                  {/* English original */}
                  <div className="text-xs text-muted-foreground/70 bg-muted/10 rounded px-2 py-1 mb-2 font-mono" dir="ltr">
                    {entry.original}
                  </div>

                  {/* Translation comparison */}
                  <div className="space-y-1.5">
                    {hasOld && diff ? (
                      <>
                        <div className="text-sm bg-destructive/5 border border-destructive/15 rounded px-2 py-1.5 font-body" dir="rtl">
                          <span className="text-[10px] text-destructive/60 block mb-0.5">قبل:</span>
                          <OldTranslationDiff diff={diff} />
                        </div>
                        <div className="text-sm bg-emerald-500/5 border border-emerald-500/15 rounded px-2 py-1.5 font-body" dir="rtl">
                          <span className="text-[10px] text-emerald-500/60 block mb-0.5">بعد:</span>
                          <NewTranslationDiff diff={diff} />
                        </div>
                      </>
                    ) : (
                      <div className="text-sm bg-emerald-500/5 border border-emerald-500/15 rounded px-2 py-1.5 font-body" dir="rtl">
                        <span className="text-[10px] text-emerald-500/60 block mb-0.5">الترجمة:</span>
                        {entry.newTranslation}
                      </div>
                    )}
                  </div>

                  {/* Accept / Reject buttons */}
                  <div className="flex items-center justify-end gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggle(entry.key, false)}
                      className={`text-xs h-7 gap-1 ${!isAccepted ? 'bg-destructive/20 text-destructive border-destructive/40' : 'text-muted-foreground hover:text-destructive hover:border-destructive/40'}`}
                    >
                      <XCircle className="w-3.5 h-3.5" /> رفض
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggle(entry.key, true)}
                      className={`text-xs h-7 gap-1 ${isAccepted ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'text-muted-foreground hover:text-emerald-400 hover:border-emerald-500/40'}`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> قبول
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Footer */}
        <DialogFooter className="px-4 py-3 border-t border-border flex flex-row items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onDiscard} className="text-xs">
            <X className="w-3.5 h-3.5" /> إلغاء
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={handleApply}
            disabled={acceptedCount === 0}
            className="text-xs font-display"
          >
            <CheckCircle2 className="w-4 h-4" />
            تطبيق المقبول ({acceptedCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GlossaryTranslationPreview;
export type { GlossaryPreviewEntry };
