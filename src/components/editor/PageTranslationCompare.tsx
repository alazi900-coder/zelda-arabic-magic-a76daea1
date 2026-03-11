import React from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, X } from "lucide-react";

interface PageTranslationCompareProps {
  open: boolean;
  originals: Record<string, string>; // key -> English original
  oldTranslations: Record<string, string>; // key -> previous Arabic (may be empty)
  newTranslations: Record<string, string>; // key -> new Arabic
  onApply: (selectedKeys: Set<string>) => void;
  onDiscard: () => void;
}

const PageTranslationCompare: React.FC<PageTranslationCompareProps> = ({
  open, originals, oldTranslations, newTranslations, onApply, onDiscard,
}) => {
  const keys = Object.keys(newTranslations);
  const [selected, setSelected] = React.useState<Set<string>>(new Set(keys));

  // Reset selection when new data comes in
  React.useEffect(() => {
    setSelected(new Set(Object.keys(newTranslations)));
  }, [newTranslations]);

  const toggleKey = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === keys.length) setSelected(new Set());
    else setSelected(new Set(keys));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onDiscard(); }}>
      <DialogContent
        className="!grid-rows-[auto_1fr] max-w-4xl w-[95vw] max-h-[85vh] overflow-hidden p-0"
        dir="rtl"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        {/* Fixed header */}
        <div className="shrink-0 p-4 pb-2 border-b space-y-2">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">📄 مقارنة ترجمة الصفحة</DialogTitle>
            <DialogDescription className="font-body">
              تم ترجمة <span className="font-bold text-primary">{keys.length}</span> نص — راجع النتائج قبل التطبيق
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selected.size === keys.length}
                onCheckedChange={toggleAll}
              />
              <span className="text-xs font-display text-muted-foreground">تحديد الكل</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={onDiscard} className="font-display gap-1 text-xs">
                <X className="w-3.5 h-3.5" /> تجاهل
              </Button>
              <Button size="sm" onClick={() => onApply(selected)} className="font-display gap-1 text-xs" disabled={selected.size === 0}>
                <CheckCircle2 className="w-3.5 h-3.5" /> تطبيق ({selected.size}/{keys.length})
              </Button>
            </div>
          </div>
        </div>

        {/* Scrollable list */}
        <div
          className="flex-1 overflow-y-auto p-4"
          style={{ minHeight: 0, WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
        >
          <div className="space-y-2">
            {keys.map((key) => {
              const original = originals[key] || '';
              const old = oldTranslations[key] || '';
              const newT = newTranslations[key] || '';
              const changed = old !== newT;

              return (
                <div
                  key={key}
                  className={`border rounded-md p-2.5 space-y-1.5 cursor-pointer select-none transition-opacity ${
                    !selected.has(key) ? 'opacity-40' : ''
                  } ${changed ? 'border-primary/30' : 'bg-muted/30'}`}
                  onClick={() => toggleKey(key)}
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selected.has(key)}
                      onCheckedChange={() => toggleKey(key)}
                    />
                    <span className="font-body text-muted-foreground text-[11px] leading-relaxed flex-1 truncate" dir="ltr">
                      {original}
                    </span>
                  </div>
                  {old && (
                    <div className="text-xs font-body text-muted-foreground pr-6 line-through" dir="rtl">
                      {old}
                    </div>
                  )}
                  <div className={`text-xs font-body pr-6 ${changed ? 'text-primary font-semibold' : ''}`} dir="rtl">
                    {newT}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Fixed footer */}
        <div className="shrink-0 p-4 pt-2 border-t flex flex-row-reverse gap-2">
          <Button onClick={() => onApply(selected)} className="font-display gap-1" disabled={selected.size === 0}>
            <CheckCircle2 className="w-4 h-4" /> تطبيق ({selected.size}/{keys.length}) ✅
          </Button>
          <Button variant="outline" onClick={onDiscard} className="font-display gap-1">
            <X className="w-4 h-4" /> إلغاء
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PageTranslationCompare;
