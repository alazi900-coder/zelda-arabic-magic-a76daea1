import React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronLeft, ChevronRight, Search, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * شجرة فلاتر الجداول:
 *   قسم رئيسي (مثلاً ⚔️ القتال) → أقسام فرعية (BTL_skilllist، BTL_enemy ...) → الجداول.
 *
 * تستبدل قائمة <select> المسطّحة بشجرة قابلة للطي + بحث، لتسهيل التنقّل
 * عند وجود مئات الجداول (XC1 DE / XC3).
 */

interface Category {
  label: string;
  match: (t: string) => boolean;
  /** كيف نشتق اسم القسم الفرعي من اسم الجدول. */
  subgroup: (t: string) => string;
  /** ترجمة عربية اختيارية للقسم الفرعي. */
  subLabel?: (key: string) => string;
}

const stripSuffix = (t: string) => t.replace(/_(ms|en|gb|us|fr|de|it|es|jp|kr|cn|tw)$/i, "");

const tokenSub = (t: string, n = 2) => {
  const base = stripSuffix(t);
  const parts = base.split("_");
  return parts.slice(0, n).join("_");
};

const CATEGORIES: Category[] = [
  {
    label: "⚔️ القتال — مهارات وأعداء",
    match: (t) => /^BTL_/i.test(t),
    subgroup: (t) => {
      const base = stripSuffix(t);
      if (/^BTL_skill/i.test(base)) return "BTL_skill — المهارات";
      if (/^BTL_enemy/i.test(base) || /^BTL_en_/i.test(base)) return "BTL_enemy — الأعداء";
      if (/^BTL_arts/i.test(base)) return "BTL_arts — فنون قتال";
      if (/^BTL_aura/i.test(base)) return "BTL_aura — الهالات";
      if (/^BTL_buff/i.test(base) || /^BTL_status/i.test(base)) return "BTL_buff/status — الحالات";
      if (/^BTL_gem/i.test(base)) return "BTL_gem — الجواهر";
      if (/^BTL_chain/i.test(base)) return "BTL_chain — الهجمات المتسلسلة";
      if (/^BTL_party/i.test(base) || /^BTL_pc/i.test(base)) return "BTL_party — أفراد الفريق";
      if (/^BTL_dmg/i.test(base) || /^BTL_damage/i.test(base)) return "BTL_damage — الأضرار";
      return tokenSub(base, 2);
    },
  },
  {
    label: "✨ الفنون (Arts)",
    match: (t) => /^(pc_arts|nopon_arts)/i.test(t),
    subgroup: (t) => (/^pc_arts/i.test(t) ? "pc_arts — فنون الشخصيات" : "nopon_arts — فنون النوبون"),
  },
  {
    label: "💬 الحوارات الجانبية",
    match: (t) => /^pctalk_/i.test(t),
    subgroup: (t) => {
      const m = stripSuffix(t).match(/^pctalk_(\d+)/i);
      if (m) {
        const n = parseInt(m[1], 10);
        return `pctalk_${m[1]} — حوارات المنطقة ${n}`;
      }
      return "pctalk — حوارات متفرقة";
    },
  },
  {
    label: "🎒 الأغراض والمعدات",
    match: (t) => /^ITM_/i.test(t),
    subgroup: (t) => {
      const base = stripSuffix(t);
      if (/^ITM_weapon/i.test(base) || /^ITM_wpn/i.test(base)) return "ITM_weapon — الأسلحة";
      if (/^ITM_armor/i.test(base) || /^ITM_arm/i.test(base)) return "ITM_armor — الدروع";
      if (/^ITM_gem/i.test(base)) return "ITM_gem — الجواهر";
      if (/^ITM_material/i.test(base) || /^ITM_mat/i.test(base)) return "ITM_material — المواد";
      if (/^ITM_collect/i.test(base) || /^ITM_col/i.test(base)) return "ITM_collect — المقتنيات";
      if (/^ITM_event/i.test(base) || /^ITM_evt/i.test(base)) return "ITM_event — أغراض القصة";
      if (/^ITM_skill/i.test(base)) return "ITM_skill — كتب المهارات";
      return tokenSub(base, 2);
    },
  },
  {
    label: "📔 السجل والمهام",
    match: (t) => /^JNL_/i.test(t),
    subgroup: (t) => {
      const base = stripSuffix(t);
      if (/^JNL_quest/i.test(base)) return "JNL_quest — المهام";
      if (/^JNL_story/i.test(base) || /^JNL_main/i.test(base)) return "JNL_story — القصة";
      if (/^JNL_tutorial/i.test(base) || /^JNL_tuto/i.test(base)) return "JNL_tutorial — الدروس";
      return tokenSub(base, 2);
    },
  },
  {
    label: "📋 القوائم والواجهة",
    match: (t) => /^MNU_/i.test(t),
    subgroup: (t) => tokenSub(t, 2),
  },
  {
    label: "🗺️ العالم والخرائط",
    match: (t) => /^FLD_/i.test(t),
    subgroup: (t) => tokenSub(t, 2),
  },
  {
    label: "🧭 الخرائط المصغّرة",
    match: (t) => /^minimaplist/i.test(t),
    subgroup: () => "minimaplist",
  },
  {
    label: "🏘️ Colony 6 — إعادة الإعمار",
    match: (t) => /^CL6_/i.test(t),
    subgroup: (t) => tokenSub(t, 2),
  },
];

interface TreeNode {
  label: string;
  subs: Map<string, string[]>; // subLabel -> tables
  total: number;
}

function buildTree(tables: string[], counts?: Record<string, number>) {
  const tree = new Map<string, TreeNode>();
  const other: string[] = [];
  const countOf = (t: string) => counts?.[t] || 0;

  for (const t of tables) {
    const idx = CATEGORIES.findIndex((c) => c.match(t));
    if (idx === -1) {
      other.push(t);
      continue;
    }
    const cat = CATEGORIES[idx];
    let node = tree.get(cat.label);
    if (!node) {
      node = { label: cat.label, subs: new Map(), total: 0 };
      tree.set(cat.label, node);
    }
    const subKey = cat.subgroup(t);
    if (!node.subs.has(subKey)) node.subs.set(subKey, []);
    node.subs.get(subKey)!.push(t);
    node.total += countOf(t);
  }

  // Preserve declared category order
  const ordered: TreeNode[] = [];
  for (const c of CATEGORIES) {
    const n = tree.get(c.label);
    if (n) {
      // sort subs alphabetically, tables alphabetically
      n.subs = new Map([...n.subs.entries()].sort((a, b) => a[0].localeCompare(b[0], "ar")));
      for (const [, arr] of n.subs) arr.sort();
      ordered.push(n);
    }
  }
  if (other.length) {
    other.sort();
    ordered.push({
      label: "📦 أخرى",
      subs: new Map([["غير مصنّفة", other]]),
      total: other.reduce((s, t) => s + countOf(t), 0),
    });
  }
  return ordered;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  tables: string[];
  counts?: Record<string, number>;
  totalEntries?: number;
  className?: string;
  /** عند تمريرها يظهر زر حذف أحمر بجانب كل قسم/فرع/جدول. */
  onDeleteScope?: (tables: string[], label: string) => void;
}

const TableFilterTree: React.FC<Props> = ({ value, onChange, tables, counts, totalEntries, className, onDeleteScope }) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [openCats, setOpenCats] = React.useState<Set<string>>(new Set());
  const [openSubs, setOpenSubs] = React.useState<Set<string>>(new Set());

  const tree = React.useMemo(() => buildTree(tables, counts), [tables, counts]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tree;
    return tree
      .map((node) => {
        const subs = new Map<string, string[]>();
        for (const [sk, arr] of node.subs) {
          const matches = arr.filter((t) => t.toLowerCase().includes(q));
          if (matches.length) subs.set(sk, matches);
        }
        return subs.size ? { ...node, subs } : null;
      })
      .filter((n): n is TreeNode => n !== null);
  }, [tree, query]);

  // عند البحث: افتح كل المطابق تلقائياً
  React.useEffect(() => {
    if (!query.trim()) return;
    const cats = new Set<string>();
    const subs = new Set<string>();
    for (const n of filtered) {
      cats.add(n.label);
      for (const sk of n.subs.keys()) subs.add(`${n.label}::${sk}`);
    }
    setOpenCats(cats);
    setOpenSubs(subs);
  }, [query, filtered]);

  const toggleCat = (k: string) =>
    setOpenCats((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  const toggleSub = (k: string) =>
    setOpenSubs((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  const display =
    value === "all"
      ? `كل الجداول${totalEntries != null ? ` (${totalEntries})` : ""}`
      : `${value} (${counts?.[value] || 0})`;

  const pick = (t: string) => {
    onChange(t);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "font-body text-sm h-9 justify-between gap-2 max-w-[220px] truncate",
            value !== "all" && "border-primary/40 bg-primary/5",
            className,
          )}
          title={display}
        >
          <span className="truncate">{display}</span>
          <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0 w-[320px] max-h-[70vh] overflow-hidden flex flex-col bg-popover border-border"
        dir="rtl"
      >
        <div className="p-2 border-b border-border flex items-center gap-2">
          <Search className="w-3.5 h-3.5 opacity-60 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن جدول..."
            className="flex-1 bg-transparent text-sm font-body outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => setQuery("")} className="opacity-60 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1 py-1">
          <button
            onClick={() => pick("all")}
            className={cn(
              "w-full text-right px-3 py-2 text-sm font-body hover:bg-accent transition-colors",
              value === "all" && "bg-primary/10 text-primary font-semibold",
            )}
          >
            🗂️ كل الجداول{totalEntries != null ? ` (${totalEntries})` : ""}
          </button>

          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground font-body">
              لا توجد نتائج
            </div>
          )}

          {filtered.map((node) => {
            const catOpen = openCats.has(node.label);
            return (
              <Collapsible key={node.label} open={catOpen} onOpenChange={() => toggleCat(node.label)}>
                <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 text-sm font-display font-semibold hover:bg-accent/60 transition-colors border-t border-border/50">
                  <span className="flex items-center gap-1.5">
                    {catOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                    {node.label}
                  </span>
                  <span className="text-[10px] opacity-60 font-body">
                    {[...node.subs.values()].reduce((s, a) => s + a.length, 0)} جدول
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {[...node.subs.entries()].map(([sk, arr]) => {
                    const subKey = `${node.label}::${sk}`;
                    const subOpen = openSubs.has(subKey);
                    return (
                      <Collapsible key={subKey} open={subOpen} onOpenChange={() => toggleSub(subKey)}>
                        <CollapsibleTrigger className="w-full flex items-center justify-between pr-6 pl-3 py-1.5 text-xs font-body text-muted-foreground hover:bg-accent/40 transition-colors">
                          <span className="flex items-center gap-1">
                            {subOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
                            {sk}
                          </span>
                          <span className="text-[10px] opacity-60">{arr.length}</span>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          {arr.map((t) => (
                            <button
                              key={t}
                              onClick={() => pick(t)}
                              className={cn(
                                "w-full text-right pr-10 pl-3 py-1.5 text-xs font-body hover:bg-accent transition-colors flex items-center justify-between gap-2",
                                value === t && "bg-primary/10 text-primary font-semibold",
                              )}
                            >
                              <span className="truncate">{t}</span>
                              <span className="text-[10px] opacity-60 shrink-0">{counts?.[t] || 0}</span>
                            </button>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TableFilterTree;
