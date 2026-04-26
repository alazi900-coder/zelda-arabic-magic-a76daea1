import React, { useMemo, useState } from "react";
import { FileText, ChevronDown, ChevronUp, Package, CheckCircle2, AlertTriangle } from "lucide-react";
import type { ExtractedEntry } from "./types";

interface FileLoadReportProps {
  entries: ExtractedEntry[];
  translations: Record<string, string>;
}

const FileLoadReport: React.FC<FileLoadReportProps> = ({ entries, translations }) => {
  const [expanded, setExpanded] = useState(false);

  const stats = useMemo(() => {
    const fileMap = new Map<string, { total: number; translated: number }>();
    for (const entry of entries) {
      const file = entry.msbtFile.includes(":") ? entry.msbtFile.split(":").slice(0, -1).join(":") : entry.msbtFile;
      if (!fileMap.has(file)) fileMap.set(file, { total: 0, translated: 0 });
      const s = fileMap.get(file)!;
      s.total++;
      const key = `${entry.msbtFile}:${entry.index}`;
      if (translations[key]?.trim()) s.translated++;
    }
    return Array.from(fileMap.entries())
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, translations]);

  const totalFiles = stats.length;
  const totalEntries = entries.length;
  const totalTranslated = Object.values(translations).filter(v => v?.trim()).length;
  const overallPct = totalEntries > 0 ? Math.round((totalTranslated / totalEntries) * 100) : 0;

  if (totalFiles === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden mb-4" dir="rtl">
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/50 hover:bg-muted/70 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Package className="w-4 h-4 text-primary" />
          <span>تقرير الملفات المحملة</span>
          <span className="text-muted-foreground text-xs">— {totalFiles} ملف، {totalEntries} نص</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-primary">{overallPct}%</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded file list */}
      {expanded && (
        <div className="divide-y divide-border/50 max-h-64 overflow-y-auto">
          {stats.map((f) => {
            const pct = f.total > 0 ? Math.round((f.translated / f.total) * 100) : 0;
            const isComplete = f.translated === f.total && f.total > 0;
            const isPartial = f.translated > 0 && !isComplete;

            return (
              <div key={f.name} className="flex items-center gap-2 px-3 py-2">
                <div className="shrink-0">
                  {isComplete ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-secondary" />
                  ) : isPartial ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-accent" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
                <span className="flex-1 truncate text-xs font-mono text-foreground" title={f.name}>
                  {f.name}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isComplete ? "bg-secondary" : isPartial ? "bg-accent" : "bg-muted-foreground/30"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={`text-xs font-mono font-bold tabular-nums ${
                    isComplete ? "text-secondary" : isPartial ? "text-accent" : "text-muted-foreground"
                  }`}>
                    {f.translated}/{f.total}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FileLoadReport;
