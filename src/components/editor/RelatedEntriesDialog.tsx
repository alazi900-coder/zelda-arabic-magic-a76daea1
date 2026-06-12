import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pin, Copy, Table2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { ExtractedEntry } from "./types";

interface RelatedEntriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ExtractedEntry | null;
  entries: ExtractedEntry[];
  translations: Record<string, string>;
  onNavigateToEntry: (key: string) => void;
  onPinKeys: (keys: Set<string>) => void;
  onFilterByTable?: (tableName: string) => void;
}

const MAX_RESULTS = 200;

/** Extract table name from msbtFile path or label. */
function getTableName(e: ExtractedEntry): string {
  const labelMatch = e.label?.match(/^(.+?)\[/);
  if (labelMatch) return labelMatch[1];
  const parts = e.msbtFile.split(":");
  // bdat-bin:bdat_common_ms.bdat:tableName:index:column
  if (parts.length >= 3) return parts[2];
  return e.msbtFile;
}

/** Extract index.column suffix from label (e.g. `[5].name`). */
function getRowKey(e: ExtractedEntry): string {
  const m = e.label?.match(/(\[\d+\]\..+)$/);
  return m ? m[1] : `[${e.index}]`;
}

/** Word-level Dice coefficient similarity (0..1). */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const tokens = (s: string) => s.toLowerCase().match(/\w+/g) || [];
  const wa = new Set(tokens(a));
  const wb = new Set(tokens(b));
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const t of wa) if (wb.has(t)) inter++;
  return (2 * inter) / (wa.size + wb.size);
}

const RelatedEntriesDialog: React.FC<RelatedEntriesDialogProps> = ({
  open, onOpenChange, entry, entries, translations,
  onNavigateToEntry, onPinKeys, onFilterByTable,
}) => {
  const [tab, setTab] = useState("exact");

  const currentKey = entry ? `${entry.msbtFile}:${entry.index}` : "";
  const tableName = entry ? getTableName(entry) : "";
  const rowKey = entry ? getRowKey(entry) : "";

  // Only compute when dialog is open + entry exists.
  const results = useMemo(() => {
    if (!open || !entry) {
      return { exact: [], similar: [], sameKey: [], sameTable: [] };
    }
    const origTrim = entry.original.trim();

    const exact: ExtractedEntry[] = [];
    const similar: Array<{ e: ExtractedEntry; score: number }> = [];
    const sameKey: ExtractedEntry[] = [];
    const sameTable: ExtractedEntry[] = [];

    for (const e of entries) {
      const k = `${e.msbtFile}:${e.index}`;
      if (k === currentKey) continue;

      // Exact original match
      if (e.original.trim() === origTrim) {
        exact.push(e);
      } else if (origTrim.length >= 4) {
        const s = similarity(origTrim, e.original);
        if (s >= 0.7) similar.push({ e, score: s });
      }

      // Same row key across tables (e.g. [5].name)
      if (rowKey && getRowKey(e) === rowKey && getTableName(e) !== tableName) {
        sameKey.push(e);
      }

      // Same table/scene
      if (getTableName(e) === tableName) {
        sameTable.push(e);
      }
    }

    similar.sort((a, b) => b.score - a.score);

    return {
      exact: exact.slice(0, MAX_RESULTS),
      similar: similar.slice(0, MAX_RESULTS).map((x) => x.e),
      sameKey: sameKey.slice(0, MAX_RESULTS),
      sameTable: sameTable.slice(0, MAX_RESULTS),
    };
  }, [open, entry, entries, currentKey, rowKey, tableName]);

  if (!entry) return null;

  const renderList = (list: ExtractedEntry[], emptyMsg: string) => {
    if (list.length === 0) {
      return <p className="text-center text-sm text-muted-foreground py-8">{emptyMsg}</p>;
    }
    return (
      <div className="space-y-2">
        {list.map((e) => {
          const k = `${e.msbtFile}:${e.index}`;
          const t = translations[k] || "";
          return (
            <div key={k} className="rounded-lg border border-border bg-card/50 p-3 text-sm space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-[10px] text-muted-foreground truncate" dir="ltr">
                  {getTableName(e)} · {e.label || `#${e.index}`}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {t && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      title="نسخ هذه الترجمة"
                      onClick={() => {
                        navigator.clipboard.writeText(t);
                        toast({ title: "📋 نُسخت الترجمة" });
                      }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    title="اذهب إلى هذا الإدخال"
                    onClick={() => {
                      onNavigateToEntry(k);
                      onOpenChange(false);
                    }}
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <p className="text-xs whitespace-pre-wrap break-words" dir="ltr">{e.original}</p>
              {t && (
                <p className="text-xs whitespace-pre-wrap break-words text-primary border-t border-border/50 pt-2" dir="rtl">
                  {t}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const tabConfig = [
    { id: "exact",     label: "مطابق",       count: results.exact.length,     list: results.exact,     empty: "لا توجد نصوص إنجليزية مطابقة تماماً." },
    { id: "similar",   label: "متشابه",      count: results.similar.length,   list: results.similar,   empty: "لا توجد نصوص متشابهة (≥70%)." },
    { id: "samekey",   label: "نفس المفتاح", count: results.sameKey.length,   list: results.sameKey,   empty: "لا توجد إدخالات بنفس index/column في جداول أخرى." },
    { id: "sametable", label: "نفس الجدول",  count: results.sameTable.length, list: results.sameTable, empty: "لا توجد إدخالات أخرى في هذا الجدول." },
  ];

  const activeList = tabConfig.find((t) => t.id === tab)?.list ?? [];

  const pinAll = () => {
    const keys = new Set<string>([currentKey, ...activeList.map((e) => `${e.msbtFile}:${e.index}`)]);
    if (keys.size <= 1) {
      toast({ title: "لا شيء لتثبيته", description: "القائمة الحالية فارغة." });
      return;
    }
    onPinKeys(keys);
    onOpenChange(false);
    toast({ title: "📌 تم التثبيت", description: `${keys.size} إدخال معروض في المحرر.` });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base">الترجمات المتعلقة</DialogTitle>
          <DialogDescription className="text-xs">
            <span dir="ltr" className="font-mono">{tableName} · {entry.label || `#${entry.index}`}</span>
          </DialogDescription>
          <div className="rounded-md bg-muted/30 p-2 mt-2">
            <p className="text-xs whitespace-pre-wrap break-words" dir="ltr">{entry.original}</p>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-4 h-auto">
            {tabConfig.map((tc) => (
              <TabsTrigger key={tc.id} value={tc.id} className="text-[11px] flex-col gap-0.5 py-1.5">
                <span>{tc.label}</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{tc.count}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {tabConfig.map((tc) => (
            <TabsContent key={tc.id} value={tc.id} className="flex-1 overflow-y-auto mt-2 pr-1">
              {renderList(tc.list, tc.empty)}
              {tc.count >= MAX_RESULTS && (
                <p className="text-center text-[11px] text-muted-foreground py-2">
                  عُرضت أول {MAX_RESULTS} نتيجة فقط.
                </p>
              )}
            </TabsContent>
          ))}
        </Tabs>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
          <Button size="sm" variant="outline" onClick={pinAll} className="gap-1.5">
            <Pin className="w-3.5 h-3.5" />
            عرض الكل في المحرر
          </Button>
          {onFilterByTable && (
            <Button
              size="sm" variant="outline" className="gap-1.5"
              onClick={() => {
                onFilterByTable(tableName);
                onOpenChange(false);
                toast({ title: "🗂 اذهب إلى الجدول", description: tableName });
              }}
            >
              <Table2 className="w-3.5 h-3.5" />
              اذهب إلى الجدول
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} className="mr-auto">
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RelatedEntriesDialog;
