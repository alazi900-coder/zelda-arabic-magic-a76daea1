import React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, X } from "lucide-react";
import { countEffectiveLines } from "@/lib/text-tokens";

interface PageTranslationCompareProps {
  open: boolean;
  originals: Record<string, string>;
  oldTranslations: Record<string, string>;
  newTranslations: Record<string, string>;
  onApply: (selectedKeys: Set<string>) => void;
  onDiscard: () => void;
}

const PageTranslationCompare: React.FC<PageTranslationCompareProps> = ({
  open, originals, oldTranslations, newTranslations, onApply, onDiscard,
}) => {
  const keys = Object.keys(newTranslations);
  const [selected, setSelected] = React.useState<Set<string>>(new Set(keys));

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999]" dir="rtl">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onDiscard}
      />

      {/* Dialog box */}
      <div className="absolute inset-4 sm:inset-8 md:inset-12 lg:inset-x-[15%] lg:inset-y-10 bg-background border rounded-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 p-4 pb-3 border-b space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">📄 مقارنة ترجمة الصفحة</h2>
              <p className="text-sm text-muted-foreground font-body mt-1">
                تم ترجمة <span className="font-bold text-primary">{keys.length}</span> نص — راجع النتائج قبل التطبيق
              </p>
            </div>
            <button
              onClick={onDiscard}
              className="p-1 rounded-sm hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

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
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="space-y-2">
            {keys.map((key) => {
              const original = originals[key] || '';
              const old = oldTranslations[key] || '';
              const newT = newTranslations[key] || '';
              const changed = old !== newT;
              const isSingleLineOriginal = countEffectiveLines(original) <= 1;

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
                  <div className={`text-xs font-body pr-6 ${isSingleLineOriginal ? 'whitespace-nowrap overflow-x-auto' : 'whitespace-pre-wrap break-words'} ${changed ? 'text-primary font-semibold' : ''}`} dir="rtl">
                    {newT}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 p-4 pt-3 border-t flex flex-row-reverse gap-2">
          <Button onClick={() => onApply(selected)} className="font-display gap-1" disabled={selected.size === 0}>
            <CheckCircle2 className="w-4 h-4" /> تطبيق ({selected.size}/{keys.length}) ✅
          </Button>
          <Button variant="outline" onClick={onDiscard} className="font-display gap-1">
            <X className="w-4 h-4" /> إلغاء
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PageTranslationCompare;
