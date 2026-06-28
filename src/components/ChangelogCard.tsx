import React, { useState } from "react";
import { CHANGELOG, KIND_META } from "@/lib/changelog";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";

interface Props {
  /** عدد الإدخالات الافتراضي قبل التوسيع */
  initialCount?: number;
  className?: string;
}

const ChangelogCard: React.FC<Props> = ({ initialCount = 1, className = "" }) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? CHANGELOG : CHANGELOG.slice(0, initialCount);
  const hasMore = CHANGELOG.length > initialCount;

  return (
    <div dir="rtl" className={`rounded-xl border border-border bg-card/60 backdrop-blur p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-primary" />
        <h3 className="font-bold text-sm">آخر التحديثات</h3>
      </div>

      <div className="space-y-4">
        {visible.map((entry) => (
          <div key={entry.version} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 font-mono text-xs font-bold">
                v{entry.version}
              </span>
              <span className="text-[11px] text-muted-foreground">{entry.date}</span>
            </div>
            <ul className="space-y-1.5">
              {entry.changes.map((c, i) => {
                const meta = KIND_META[c.kind];
                return (
                  <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                    <span className={`shrink-0 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold ${meta.cls}`}>
                      <span>{meta.emoji}</span>
                      <span>{meta.label}</span>
                    </span>
                    <span className="text-foreground/90">{c.text}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded((x) => !x)}
          className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {expanded ? <><ChevronUp className="w-3 h-3" /> عرض أقل</> : <><ChevronDown className="w-3 h-3" /> عرض كل التحديثات ({CHANGELOG.length})</>}
        </button>
      )}
    </div>
  );
};

export default ChangelogCard;
