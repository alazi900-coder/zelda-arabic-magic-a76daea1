import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PageRangeDialogProps {
  open: boolean;
  onClose: () => void;
  totalPages: number;
  onConfirm: (startPage: number, endPage: number) => void;
}

const PageRangeDialog: React.FC<PageRangeDialogProps> = ({
  open,
  onClose,
  totalPages,
  onConfirm,
}) => {
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(totalPages);

  React.useEffect(() => {
    if (open) {
      setStartPage(1);
      setEndPage(totalPages);
    }
  }, [open, totalPages]);

  const handleConfirm = () => {
    const s = Math.max(1, Math.min(startPage, totalPages));
    const e = Math.max(s, Math.min(endPage, totalPages));
    onConfirm(s - 1, e - 1); // convert to 0-indexed
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-display">📄 تحديد نطاق الصفحات</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            اختر الصفحات التي تريد ترجمتها (من {totalPages} صفحة).
            <br />
            النصوص المترجمة مسبقاً لن تُعاد ترجمتها.
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
                className="text-center"
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
                className="text-center"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            سيتم ترجمة {Math.max(0, Math.min(endPage, totalPages) - Math.max(1, startPage) + 1)} صفحة
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleConfirm} disabled={startPage > endPage || startPage < 1 || endPage > totalPages}>
            بدء الترجمة 🚀
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PageRangeDialog;
