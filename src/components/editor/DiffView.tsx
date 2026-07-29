import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { ExtractedEntry, displayOriginal, PAGE_SIZE } from "./types";
import { measureEntryBytes } from "@/lib/entry-bytes";
import PaginationControls from "./PaginationControls";

interface DiffViewProps {
  entries: ExtractedEntry[];
  translations: Record<string, string>;
  onClose: () => void;
}

/** Highlight Arabic vs Latin segments with color coding */
function highlightDiff(original: string, translation: string): React.ReactNode {
  if (!translation?.trim()) {
    return <span className="text-muted-foreground italic">— لم تُترجم —</span>;
  }

  // Find common prefix/suffix to highlight changes
  const words = translation.split(/(\s+)/);
  return words.map((word, i) => {
    if (/^\s+$/.test(word)) return <span key={i}>{word}</span>;
    // Check if this word exists in original
    const isNew = !original.includes(word);
    if (isNew) {
      return (
        <span key={i} className="bg-secondary/20 text-secondary-foreground border-b-2 border-secondary rounded-sm px-0.5">
          {word}
        </span>
      );
    }
    return <span key={i}>{word}</span>;
  });
}

const DiffView: React.FC<DiffViewProps> = ({ entries, translations, onClose }) => {
  const [currentPage, setCurrentPage] = React.useState(0);

  // Only show entries that have translations
  const translatedEntries = useMemo(() =>
    entries.filter(e => {
      const key = `${e.msbtFile}:${e.index}`;
      return translations[key]?.trim();
    }),
    [entries, translations]
  );

  const totalPages = Math.ceil(translatedEntries.length / PAGE_SIZE);
  const paginatedEntries = translatedEntries.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );

  return (
    <Card className="mb-6 border-border">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="font-display font-bold text-sm">📊 عرض المقارنة — {translatedEntries.length} نص مترجم</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Header row */}
      <div className="grid grid-cols-[200px_1fr_1fr] gap-0 text-xs font-display font-bold border-b border-border bg-muted/30">
        <div className="p-2 border-l border-border">الملف / التسمية</div>
        <div className="p-2 border-l border-border">النص الأصلي 🇯🇵</div>
        <div className="p-2 border-l border-border">الترجمة العربية 🇸🇦</div>
      </div>

      {/* Rows */}
      <div className="max-h-[60vh] overflow-y-auto">
        {paginatedEntries.map((entry) => {
          const key = `${entry.msbtFile}:${entry.index}`;
          const translation = translations[key] || "";
          const byteUsed = translation ? measureEntryBytes(entry.msbtFile, translation) : 0;
          const ratio = entry.maxBytes > 0 ? byteUsed / entry.maxBytes : 0;

          return (
            <div
              key={key}
              className={`grid grid-cols-[200px_1fr_1fr] gap-0 border-b border-border/50 hover:bg-muted/10 transition-colors text-sm ${
                ratio > 1 ? "bg-destructive/5" : ""
              }`}
            >
              <div className="p-2 border-l border-border/50 text-xs text-muted-foreground truncate">
                <div className="truncate font-medium">{entry.msbtFile}</div>
                <div className="truncate text-[10px]">{entry.label}</div>
                {entry.maxBytes > 0 && (
                  <div className={`text-[10px] mt-0.5 ${ratio > 1 ? "text-destructive font-bold" : ratio > 0.8 ? "text-amber-500" : "text-muted-foreground"}`}>
                    {byteUsed}/{entry.maxBytes}b ({Math.round(ratio * 100)}%)
                  </div>
                )}
              </div>
              <div className="p-2 border-l border-border/50 font-body break-words" dir="auto">
                {displayOriginal(entry.original)}
              </div>
              <div className="p-2 border-l border-border/50 font-body break-words" dir="rtl">
                {highlightDiff(entry.original, translation)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-2 border-t border-border flex justify-center">
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={translatedEntries.length}
            pageSize={PAGE_SIZE}
            setCurrentPage={setCurrentPage}
          />
        </div>
      )}
    </Card>
  );
};

export default DiffView;
