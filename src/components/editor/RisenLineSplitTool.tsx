import React from "react";
import { Button } from "@/components/ui/button";
import { Scissors } from "lucide-react";
import { planLineSplit } from "@/lib/risen-line-split";
import type { ExtractedEntry } from "@/components/editor/types";

const STORAGE_KEY = "risenLineSplitLimit";
const DEFAULT_LIMIT = 40;
const MIN_LIMIT = 15;
const MAX_LIMIT = 120;

interface RisenLineSplitToolProps {
  filteredEntries: ExtractedEntry[];
  translations: Record<string, string>;
  updateTranslationsBatch: (updates: Record<string, string>) => number;
}

/** Manual bulk line-splitting tool for Risen — see src/lib/risen-line-split.ts for why. */
const RisenLineSplitTool: React.FC<RisenLineSplitToolProps> = ({
  filteredEntries, translations, updateTranslationsBatch,
}) => {
  const [limit, setLimit] = React.useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      return saved >= MIN_LIMIT && saved <= MAX_LIMIT ? saved : DEFAULT_LIMIT;
    } catch { return DEFAULT_LIMIT; }
  });
  // One undo level is enough — a later bulk split invalidates the previous snapshot.
  const undoSnapshotRef = React.useRef<Record<string, string> | null>(null);

  const setLimitPersisted = (v: number) => {
    const clamped = Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Number.isFinite(v) ? v : DEFAULT_LIMIT));
    setLimit(clamped);
    try { localStorage.setItem(STORAGE_KEY, String(clamped)); } catch { /* localStorage unavailable */ }
  };

  const handleSplit = async () => {
    const { toast } = await import("sonner");
    const plan = planLineSplit(filteredEntries, translations, limit);

    if (plan.targetKeys.length === 0) {
      toast.info("لا توجد نصوص تحتاج تقسيمًا ضمن العرض الحالي");
      return;
    }

    const ok = window.confirm(
      `سيتم تقسيم أسطر ${plan.targetKeys.length} نصًا من أصل ${filteredEntries.length} المعروضة حاليًا. متابعة؟`
    );
    if (!ok) return;

    undoSnapshotRef.current = plan.snapshot;
    const count = updateTranslationsBatch(plan.updates);

    toast.success(`تم تقسيم أسطر ${count} نصًا`, {
      action: {
        label: "تراجع",
        onClick: () => {
          if (undoSnapshotRef.current) {
            updateTranslationsBatch(undoSnapshotRef.current);
            undoSnapshotRef.current = null;
          }
        },
      },
    });
  };

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-xs text-muted-foreground font-body hidden md:inline">الحد الأقصى للسطر</span>
      <input
        type="number"
        value={limit}
        onChange={(e) => setLimitPersisted(parseInt(e.target.value, 10))}
        min={MIN_LIMIT}
        max={MAX_LIMIT}
        title="الحد الأقصى للسطر"
        className="w-16 px-2 py-2 rounded bg-background border border-border font-body text-sm text-center"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={handleSplit}
        className="font-body text-xs shrink-0 gap-1"
        title="تقسيم أسطر الترجمات الطويلة عند المسافات"
      >
        <Scissors className="w-3.5 h-3.5" /> تقسيم الأسطر
      </Button>
    </div>
  );
};

export default RisenLineSplitTool;
