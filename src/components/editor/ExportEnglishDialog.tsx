import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Download, FileText, Archive } from "lucide-react";

type ExportFormat = "txt" | "json";

interface ExportEnglishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalCount: number;
  onExport: (chunkSize: number, format: ExportFormat) => void;
}

const ExportEnglishDialog: React.FC<ExportEnglishDialogProps> = ({
  open,
  onOpenChange,
  totalCount,
  onExport,
}) => {
  const [chunkSize, setChunkSize] = useState(1000);
  const [format, setFormat] = useState<ExportFormat>("json");

  const fileCount = useMemo(() => Math.ceil(totalCount / chunkSize), [totalCount, chunkSize]);

  const handleExport = () => {
    onExport(chunkSize, format);
    onOpenChange(false);
  };

  const presets = [200, 500, 1000, 2000, 5000];
  const ext = format === "json" ? "JSON" : "TXT";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-primary" />
            تصدير الإنجليزية غير المترجمة
          </DialogTitle>
          <DialogDescription>
            إجمالي النصوص: <strong className="text-foreground">{totalCount.toLocaleString()}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
              max={Math.max(totalCount, 100)}
              step={100}
              className="my-3"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>100</span>
              <span className="font-bold text-foreground text-sm">{chunkSize.toLocaleString()} نص/ملف</span>
              <span>{totalCount.toLocaleString()}</span>
            </div>
          </div>

          {/* Presets */}
          <div className="flex gap-1.5 flex-wrap">
            {presets.filter(p => p <= totalCount || p === presets[0]).map(p => (
              <Button
                key={p}
                size="sm"
                variant={chunkSize === p ? "default" : "outline"}
                className="text-xs h-7 px-2.5"
                onClick={() => setChunkSize(Math.min(p, totalCount))}
              >
                {p.toLocaleString()}
              </Button>
            ))}
            <Button
              size="sm"
              variant={chunkSize >= totalCount ? "default" : "outline"}
              className="text-xs h-7 px-2.5"
              onClick={() => setChunkSize(totalCount)}
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
                  <span>ملف {ext} واحد يحتوي على <strong>{totalCount.toLocaleString()}</strong> نص</span>
                ) : (
                  <span>
                    <strong>{fileCount}</strong> ملفات {ext}، كل ملف يحتوي على <strong>{chunkSize.toLocaleString()}</strong> نص
                    {totalCount % chunkSize !== 0 && (
                      <span className="text-muted-foreground"> (الأخير: {(totalCount % chunkSize).toLocaleString()})</span>
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
          <Button onClick={handleExport} className="gap-1.5">
            <Download className="w-4 h-4" />
            تصدير {fileCount > 1 ? `${fileCount} ملفات ${ext} (ZIP)` : `ملف ${ext} واحد`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportEnglishDialog;
