// GTA IV editor tool: inserts ~n~ between balanced Arabic lines while preserving source runtime tokens.
import React from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw, Scissors } from "lucide-react";
import { planGtaIvLineJoin, planGtaIvLineSplit } from "@/lib/gtaiv/gtaiv-line-split";
import type { ExtractedEntry } from "@/components/editor/types";

const STORAGE_KEY = "gtaivLineSplitLimit";
const DEFAULT_LIMIT = 40;
const MIN_LIMIT = 15;
const MAX_LIMIT = 120;

interface GtaIvLineSplitToolProps {
  filteredEntries: ExtractedEntry[];
  translations: Record<string, string>;
  updateTranslationsBatch: (updates: Record<string, string>) => number;
  onFilterByKeys?: (keys: Set<string>) => void;
}

const GtaIvLineSplitTool: React.FC<GtaIvLineSplitToolProps> = ({
  filteredEntries, translations, updateTranslationsBatch, onFilterByKeys,
}) => {
  const [limit, setLimit] = React.useState(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      return saved >= MIN_LIMIT && saved <= MAX_LIMIT ? saved : DEFAULT_LIMIT;
    } catch { return DEFAULT_LIMIT; }
  });
  const [limitText, setLimitText] = React.useState(String(limit));
  const undoSnapshotRef = React.useRef<Record<string, string> | null>(null);

  const commitLimit = () => {
    const entered = parseInt(limitText, 10);
    const next = Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Number.isFinite(entered) ? entered : DEFAULT_LIMIT));
    setLimit(next);
    setLimitText(String(next));
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* Storage is optional. */ }
  };

  const applyPlan = async (kind: "split" | "join") => {
    const { toast } = await import("sonner");
    const plan = kind === "split"
      ? planGtaIvLineSplit(filteredEntries, translations, limit)
      : planGtaIvLineJoin(filteredEntries, translations);
    if (plan.targetKeys.length === 0) {
      toast.info(kind === "split" ? "لا توجد نصوص تحتاج تقسيمًا ضمن العرض الحالي" : "لا توجد أسطر يمكن دمجها ضمن العرض الحالي");
      return;
    }
    const action = kind === "split" ? "تقسيم" : "دمج";
    const detail = kind === "split" ? "سيُضاف ~n~ بين الأسطر." : "سيُحذف ~n~ الذي أضافته الأداة.";
    if (!window.confirm(`سيتم ${action} ${plan.targetKeys.length} نصًا من أصل ${filteredEntries.length} المعروضة حاليًا.\n${detail}\n\nمتابعة؟`)) return;

    undoSnapshotRef.current = plan.snapshot;
    const count = updateTranslationsBatch(plan.updates);
    if (kind === "split") onFilterByKeys?.(new Set(plan.targetKeys));
    toast.success(`تم ${action} ${count} نصًا`, {
      action: {
        label: "تراجع",
        onClick: () => {
          if (!undoSnapshotRef.current) return;
          updateTranslationsBatch(undoSnapshotRef.current);
          undoSnapshotRef.current = null;
        },
      },
    });
  };

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-xs text-muted-foreground font-body hidden md:inline">الحد الأقصى للسطر</span>
      <input
        type="number"
        value={limitText}
        onChange={(event) => setLimitText(event.target.value)}
        onBlur={commitLimit}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
        min={MIN_LIMIT}
        max={MAX_LIMIT}
        title="الحد الأقصى للسطر"
        className="w-16 px-2 py-2 rounded bg-background border border-border font-body text-sm text-center"
      />
      <Button variant="outline" size="sm" onClick={() => void applyPlan("split")} className="font-body text-xs shrink-0 gap-1" title="يقسم عند الكلمات ويضع ~n~ بين السطور">
        <Scissors className="w-3.5 h-3.5" /> تقسيم الأسطر
      </Button>
      <Button variant="outline" size="sm" onClick={() => void applyPlan("join")} className="font-body text-xs shrink-0 gap-1" title="يحذف ~n~ الذي أضافته أداة التقسيم">
        <RotateCcw className="w-3.5 h-3.5" /> دمج الأسطر
      </Button>
    </div>
  );
};

export default GtaIvLineSplitTool;
