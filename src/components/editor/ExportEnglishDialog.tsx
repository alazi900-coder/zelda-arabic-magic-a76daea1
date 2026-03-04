import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileText, Archive } from "lucide-react";

type ExportFormat = "txt" | "json";
type ExportScope = "untranslated" | "all";

interface ExportEnglishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalCount: number;
  totalEntries: number;
  totalPages: number;
  onExport: (chunkSize: number, format: ExportFormat, scope: ExportScope, startPage?: number, endPage?: number) => void;
  /** Returns the real count of entries for given scope and page range (0-indexed pages) */
  onGetRealCount?: (scope: ExportScope, startPage?: number, endPage?: number) => number;
}

const ExportEnglishDialog: React.FC<ExportEnglishDialogProps> = ({
  open,
  onOpenChange,
  totalCount,
  totalEntries,
  totalPages,
  onExport,
  onGetRealCount,
}) => {
  const [chunkSize, setChunkSize] = useState(1000);
  const [format, setFormat] = useState<ExportFormat>("json");
  const [scope, setScope] = useState<ExportScope>("all");
  const [usePageRange, setUsePageRange] = useState(true);
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(totalPages);

  React.useEffect(() => {
    if (open) {
      setStartPage(1);
      setEndPage(totalPages);
      setScope(totalCount === 0 ? "all" : "untranslated");
    }
  }, [open, totalPages, totalCount]);

  // Calculate effective count using real data when available
  const effectiveCount = useMemo(() => {
    if (onGetRealCount) {
      const sp = usePageRange ? startPage - 1 : undefined;
      const ep = usePageRange ? endPage - 1 : undefined;
      return onGetRealCount(scope, sp, ep);
    }
    // Fallback: use totals directly
    const baseCount = scope === "untranslated" ? totalCount : totalEntries;
    if (!usePageRange) return baseCount;
    
    const PAGE_SIZE = 50;
    const validStart = Math.max(1, startPage);
    const validEnd = Math.min(endPage, totalPages);
    const selectedPages = Math.max(0, validEnd - validStart + 1);
    const rangeEntries = Math.min(selectedPages * PAGE_SIZE, totalEntries);
    
    if (scope === "all") return rangeEntries;
    const ratio = totalEntries > 0 ? totalCount / totalEntries : 0;
    return Math.round(rangeEntries * ratio);
  }, [scope, totalCount, totalEntries, usePageRange, startPage, endPage, totalPages, onGetRealCount]);
  
  const fileCount = useMemo(() => Math.ceil(Math.max(effectiveCount, 1) / chunkSize), [effectiveCount, chunkSize]);

  const handleExport = () => {
    onExport(
      chunkSize,
      format,
      scope,
      usePageRange ? startPage - 1 : undefined,
      usePageRange ? endPage - 1 : undefined
    );
    onOpenChange(false);
  };

  const presets = [200, 500, 1000, 2000, 5000];
  const ext = format === "json" ? "JSON" : "TXT";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-primary" />
            تصدير النصوص الإنجليزية
          </DialogTitle>
          <DialogDescription>
            إجمالي النصوص: <strong className="text-foreground">{totalEntries.toLocaleString()}</strong>
            {" · "}غير مترجمة: <strong className="text-foreground">{totalCount.toLocaleString()}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Scope selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">نطاق التصدير</label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={scope === "untranslated" ? "default" : "outline"}
                className="text-xs h-8 px-3"
                onClick={() => setScope("untranslated")}
              >
                غير المترجمة فقط ({totalCount.toLocaleString()})
              </Button>
              <Button
                size="sm"
                variant={scope === "all" ? "default" : "outline"}
                className="text-xs h-8 px-3"
                onClick={() => setScope("all")}
              >
                الكل ({totalEntries.toLocaleString()})
              </Button>
            </div>
          </div>

          {/* Page range toggle */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="usePageRange"
                checked={usePageRange}
                onChange={(e) => setUsePageRange(e.target.checked)}
                className="rounded border-border"
              />
              <label htmlFor="usePageRange" className="text-sm font-medium cursor-pointer">
                📄 تحديد نطاق الصفحات
              </label>
            </div>
            {usePageRange && (
              <div className="space-y-2 bg-muted/50 rounded-lg p-3 border">
                <p className="text-xs text-muted-foreground">
                  اختر الصفحات (من {totalPages} صفحة)
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">من صفحة</Label>
                    <Input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={startPage}
                      onChange={(e) => setStartPage(Number(e.target.value))}
                      className="text-center h-8"
                    />
                  </div>
                  <span className="mt-5 text-muted-foreground font-bold">→</span>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">إلى صفحة</Label>
                    <Input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={endPage}
                      onChange={(e) => setEndPage(Number(e.target.value))}
                      className="text-center h-8"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  سيتم تصدير <strong className="text-foreground">{effectiveCount.toLocaleString()}</strong> نص
                </p>
              </div>
            )}
          </div>

          {/* Format selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">صيغة التصدير</label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={format === "json" ? "default" : "outline"}
                className="text-xs h-8 px-3"
                onClick={() => setFormat("json")}
              >
                JSON (للاستيراد التلقائي)
              </Button>
              <Button
                size="sm"
                variant={format === "txt" ? "default" : "outline"}
                className="text-xs h-8 px-3"
                onClick={() => setFormat("txt")}
              >
                TXT (نص عادي)
              </Button>
            </div>
          </div>

          {/* Chunk size slider */}
          <div className="space-y-2">
            <label className="text-sm font-medium">عدد النصوص في كل ملف</label>
            <Slider
              value={[chunkSize]}
              onValueChange={([v]) => setChunkSize(v)}
              min={100}
              max={Math.max(effectiveCount, 100)}
              step={100}
              className="my-3"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>100</span>
              <span className="font-bold text-foreground text-sm">{chunkSize.toLocaleString()} نص/ملف</span>
              <span>{effectiveCount.toLocaleString()}</span>
            </div>
          </div>

          {/* Presets */}
          <div className="flex gap-1.5 flex-wrap">
            {presets.filter(p => p <= effectiveCount || p === presets[0]).map(p => (
              <Button
                key={p}
                size="sm"
                variant={chunkSize === p ? "default" : "outline"}
                className="text-xs h-7 px-2.5"
                onClick={() => setChunkSize(Math.min(p, effectiveCount))}
              >
                {p.toLocaleString()}
              </Button>
            ))}
            <Button
              size="sm"
              variant={chunkSize >= effectiveCount ? "default" : "outline"}
              className="text-xs h-7 px-2.5"
              onClick={() => setChunkSize(effectiveCount)}
            >
              الكل
            </Button>
          </div>

          {/* Result preview */}
          <div className="bg-muted/50 rounded-lg p-3 border text-sm space-y-1">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <span>
                {fileCount === 1 ? (
                  <span>ملف {ext} واحد يحتوي على <strong>{effectiveCount.toLocaleString()}</strong> نص</span>
                ) : (
                  <span>
                    <strong>{fileCount}</strong> ملفات {ext}، كل ملف يحتوي على <strong>{chunkSize.toLocaleString()}</strong> نص
                    {effectiveCount % chunkSize !== 0 && (
                      <span className="text-muted-foreground"> (الأخير: {(effectiveCount % chunkSize).toLocaleString()})</span>
                    )}
                  </span>
                )}
              </span>
            </div>
            {fileCount > 1 && (
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Archive className="w-3.5 h-3.5" />
                سيتم تصديرها في ملف ZIP مضغوط مرقّم
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button
            onClick={handleExport}
            className="gap-1.5"
            disabled={effectiveCount === 0 || (usePageRange && (startPage > endPage || startPage < 1 || endPage > totalPages))}
          >
            <Download className="w-4 h-4" />
            تصدير {effectiveCount.toLocaleString()} نص {fileCount > 1 ? `(${fileCount} ملفات ${ext} ZIP)` : `(${ext})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportEnglishDialog;
