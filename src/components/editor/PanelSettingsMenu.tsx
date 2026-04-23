import { useState, useRef, useEffect } from "react";
import { Settings, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const PANELS = [
  { id: "autopilot", label: "الوكيل التلقائي" },
  { id: "progress", label: "لوحة التقدم" },
  { id: "consistency", label: "تناقضات الترجمة" },
  { id: "tools", label: "أدوات الترجمة" },
  { id: "ai-enhance", label: "تحسين الذكاء الاصطناعي" },
];

export function PanelSettingsMenu({
  hiddenPanels,
  togglePanel,
}: {
  hiddenPanels: string[];
  togglePanel: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(!open)}
        title="إظهار / إخفاء الأدوات"
      >
        <Settings className="w-4 h-4" />
      </Button>
      {open && (
        <div className="absolute left-0 top-8 z-50 bg-background border border-border rounded-lg shadow-lg py-1.5 min-w-[190px]">
          <p className="text-[10px] text-muted-foreground px-3 pb-1 uppercase tracking-wide">الأدوات المرئية</p>
          {PANELS.map((p) => {
            const visible = !hiddenPanels.includes(p.id);
            return (
              <button
                key={p.id}
                className="flex items-center gap-2.5 w-full text-sm py-1.5 px-3 hover:bg-muted/50 text-right"
                onClick={() => togglePanel(p.id)}
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    visible ? "bg-primary border-primary" : "border-border bg-transparent"
                  }`}
                >
                  {visible && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </span>
                <span className="font-display">{p.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
