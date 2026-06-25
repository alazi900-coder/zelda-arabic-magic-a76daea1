import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ExtractedEntry } from "./types";

interface SceneContextPanelProps {
  open: boolean;
  onClose: () => void;
  entry: ExtractedEntry | null;
  entries: ExtractedEntry[];
  translations: Record<string, string>;
  range?: number;
}

// Xenoblade characters (XC1/XC2/XC3) used for speaker auto-detection.
const XC_CHARACTERS = [
  "Noah", "Mio", "Eunie", "Taion", "Lanz", "Sena",
  "Rex", "Pyra", "Mythra", "Nia", "Tora", "Morag", "Zeke", "Poppi", "Brighid",
  "Shulk", "Reyn", "Fiora", "Sharla", "Dunban", "Riki", "Melia",
  "N", "M", "Crys", "Joran", "Ghondor", "Monica", "Cammuravi", "Ethel",
];

const getSpeakerFromContent = (text: string): string | null => {
  for (const name of XC_CHARACTERS) {
    const re = new RegExp(`\\b${name}\\b`);
    if (re.test(text)) return name;
  }
  return null;
};

// Xenoblade msbtFile pattern: "bdat-bin:<FILE>.bdat:<TABLE>:<row>:<col>"
const parseFileMeta = (msbtFile: string): { fileName: string; tablePrefix: string } => {
  const parts = msbtFile.split(":");
  const fileName = parts[1] || msbtFile;
  const table = parts[2] || "";
  const tablePrefix = (table.match(/^[A-Z]+_/)?.[0] || table.slice(0, 4)).toUpperCase();
  return { fileName, tablePrefix };
};

const getSceneType = (tablePrefix: string): { label: string; emoji: string; cls: string } => {
  const p = tablePrefix.toUpperCase();
  if (p.startsWith("FLD") || p.startsWith("NPC") || p.startsWith("TLK"))
    return { label: "حوار", emoji: "💬", cls: "bg-blue-500/15 text-blue-500 border-blue-500/30" };
  if (p.startsWith("EVT") || p.startsWith("STR") || p.startsWith("MAIN"))
    return { label: "قصة", emoji: "📖", cls: "bg-purple-500/15 text-purple-500 border-purple-500/30" };
  if (p.startsWith("BTL") || p.startsWith("SKL") || p.startsWith("ART"))
    return { label: "تحدي", emoji: "⚔️", cls: "bg-red-500/15 text-red-500 border-red-500/30" };
  if (p.startsWith("MNU") || p.startsWith("SYS") || p.startsWith("UI"))
    return { label: "واجهة", emoji: "🖥️", cls: "bg-slate-500/15 text-slate-500 border-slate-500/30" };
  if (p.startsWith("CHR") || p.startsWith("CHARACTER"))
    return { label: "شخصية", emoji: "👤", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" };
  if (p.startsWith("ITM") || p.startsWith("ITEM"))
    return { label: "عناصر", emoji: "🎒", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
  if (p.startsWith("TIP") || p.startsWith("HELP"))
    return { label: "نصائح", emoji: "💡", cls: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30" };
  if (p.startsWith("QST"))
    return { label: "مهمة", emoji: "📜", cls: "bg-orange-500/15 text-orange-500 border-orange-500/30" };
  return { label: "نص", emoji: "📄", cls: "bg-muted text-muted-foreground border-border" };
};

const SceneContextPanel: React.FC<SceneContextPanelProps> = ({
  open, onClose, entry, entries, translations, range = 6,
}) => {
  const [extraRange, setExtraRange] = useState(0);

  const data = useMemo(() => {
    if (!entry) return null;
    const fileEntries = entries
      .filter((e) => e.msbtFile === entry.msbtFile)
      .sort((a, b) => a.index - b.index);
    const currentIdx = fileEntries.findIndex(
      (e) => e.msbtFile === entry.msbtFile && e.index === entry.index
    );
    if (currentIdx < 0) return null;
    const r = range + extraRange;
    const start = Math.max(0, currentIdx - r);
    const end = Math.min(fileEntries.length, currentIdx + r + 1);
    const window = fileEntries.slice(start, end);
    const translatedCount = fileEntries.filter(
      (e) => (translations[`${e.msbtFile}:${e.index}`] || "").trim()
    ).length;
    const meta = parseFileMeta(entry.msbtFile);
    return {
      window, currentIdx, fileTotal: fileEntries.length, translatedCount,
      sceneType: getSceneType(meta.tablePrefix), fileName: meta.fileName,
      speaker: getSpeakerFromContent(entry.original),
    };
  }, [entry, entries, translations, range, extraRange]);

  if (!entry || !data) return null;
  const pct = data.fileTotal ? Math.round((data.translatedCount / data.fileTotal) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center flex-wrap gap-2">
            <span>🎬 سياق المشهد</span>
            <Badge variant="outline" className={data.sceneType.cls}>
              {data.sceneType.emoji} {data.sceneType.label}
            </Badge>
            {data.speaker && (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                👤 {data.speaker}
              </Badge>
            )}
          </DialogTitle>
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span className="font-mono truncate" title={data.fileName}>{data.fileName}</span>
            <span>
              {data.translatedCount}/{data.fileTotal} مترجم ({pct}%)
            </span>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-2 px-2">
          <div className="relative space-y-2 py-2">
            <div className="absolute right-4 top-0 bottom-0 w-px bg-border/50 pointer-events-none" />
            {data.window.map((e) => {
              const key = `${e.msbtFile}:${e.index}`;
              const tr = (translations[key] || "").trim();
              const isCurrent = e.msbtFile === entry.msbtFile && e.index === entry.index;
              return (
                <div
                  key={key}
                  className={`relative rounded-lg border p-3 transition-all ${
                    isCurrent
                      ? "border-primary ring-2 ring-primary/30 shadow-md bg-primary/5"
                      : "border-border/60 bg-card/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      #{e.index}
                    </span>
                    {isCurrent && (
                      <Badge className="text-[10px] h-5 px-1.5">◀ الحالي</Badge>
                    )}
                  </div>
                  <p dir="ltr" className="text-sm font-mono whitespace-pre-wrap break-words text-foreground/90">
                    {e.original}
                  </p>
                  {tr ? (
                    <p dir="rtl" className="text-sm mt-2 whitespace-pre-wrap break-words text-foreground border-r-2 border-primary/40 pr-2">
                      {tr}
                    </p>
                  ) : (
                    <span className="inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/30">
                      ⚠️ غير مترجم
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setExtraRange((r) => r + 5)}>
              توسيع النطاق (+5)
            </Button>
            {extraRange > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setExtraRange(0)}>
                تقليص
              </Button>
            )}
          </div>
          <Button size="sm" onClick={onClose}>إغلاق</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SceneContextPanel;
