import React from "react";
import { Button } from "@/components/ui/button";
import { FileText, Filter, Wrench } from "lucide-react";

export type MobileTab = "entries" | "filters" | "tools";

interface EditorMobileTabsHeaderProps {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
}

const TABS: { id: MobileTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "entries", label: "الترجمات", icon: FileText },
  { id: "filters", label: "الفلاتر", icon: Filter },
  { id: "tools", label: "الأدوات", icon: Wrench },
];

const EditorMobileTabsHeader: React.FC<EditorMobileTabsHeaderProps> = ({ active, onChange }) => (
  <div
    role="tablist"
    aria-label="أقسام المحرر للهاتف"
    className="md:hidden sticky top-[52px] z-30 -mx-3 px-3 py-1.5 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/40 mb-3 grid grid-cols-3 gap-1"
  >
    {TABS.map(({ id, label, icon: Icon }) => {
      const isActive = active === id;
      return (
        <Button
          key={id}
          role="tab"
          aria-selected={isActive}
          variant={isActive ? "default" : "ghost"}
          size="sm"
          onClick={() => onChange(id)}
          className="h-9 text-xs font-display font-bold gap-1.5"
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </Button>
      );
    })}
  </div>
);

export default EditorMobileTabsHeader;
