import React, { useMemo, useState } from "react";
import { buildOwnerIndex, buildItemPrefixIndex, buildSectionPrefixIndex, type RisenSectionFilterValue, type RisenCategory } from "@/lib/risen/categories";
import type { ExtractedEntry } from "./types";

interface RisenSubFiltersProps {
  entries: ExtractedEntry[];
  activeCategories: string[];
  filterRisenOwner: string | null;
  setFilterRisenOwner: (v: string | null) => void;
  filterRisenItemPrefix: string | null;
  setFilterRisenItemPrefix: (v: string | null) => void;
  filterRisenSection: RisenSectionFilterValue | null;
  setFilterRisenSection: (v: RisenSectionFilterValue | null) => void;
  risenCategories: RisenCategory[];
}

const TOP_OWNERS_SHOWN = 15;

const RisenSubFilters: React.FC<RisenSubFiltersProps> = ({
  entries, activeCategories, filterRisenOwner, setFilterRisenOwner, filterRisenItemPrefix, setFilterRisenItemPrefix,
  filterRisenSection, setFilterRisenSection, risenCategories,
}) => {
  const [ownerSearch, setOwnerSearch] = useState("");

  const ownerIndex = useMemo(() => buildOwnerIndex(entries), [entries]);
  const itemPrefixIndex = useMemo(() => buildItemPrefixIndex(entries), [entries]);

  // Generic "sections" browser: one panel per active category other than items
  // (which already has its own richer 3-segment + friendly-label filter above).
  const sectionPanels = useMemo(() => {
    return activeCategories
      .filter((id) => id !== "risen-items")
      .map((id) => ({ id, index: buildSectionPrefixIndex(entries, id) }))
      .filter((p) => p.index.length > 0);
  }, [entries, activeCategories]);

  const showOwners = activeCategories.includes("risen-dialogue") && ownerIndex.length > 0;
  const showItems = activeCategories.includes("risen-items") && itemPrefixIndex.length > 0;

  if (!showOwners && !showItems && sectionPanels.length === 0) return null;

  const trimmedSearch = ownerSearch.trim().toLowerCase();
  const filteredOwners = trimmedSearch
    ? ownerIndex.filter((o) => o.owner.toLowerCase().includes(trimmedSearch))
    : ownerIndex.slice(0, TOP_OWNERS_SHOWN);

  return (
    <div className="mb-4 space-y-3">
      {showOwners && (
        <div className="p-3 rounded-lg border border-border/50 bg-card/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-display font-bold">تصفية الحوارات حسب الشخصية (Owner)</span>
            {filterRisenOwner && (
              <button onClick={() => setFilterRisenOwner(null)} className="text-xs text-destructive hover:text-destructive/80">
                مسح ✕
              </button>
            )}
          </div>
          <input
            type="text"
            value={ownerSearch}
            onChange={(e) => setOwnerSearch(e.target.value)}
            placeholder={`ابحث بين ${ownerIndex.length} شخصية...`}
            className="w-full mb-2 px-2 py-1 text-xs rounded border border-border bg-background"
          />
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {filteredOwners.map(({ owner, count }) => (
              <button
                key={owner}
                onClick={() => setFilterRisenOwner(filterRisenOwner === owner ? null : owner)}
                className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                  filterRisenOwner === owner ? "border-primary bg-primary/10" : "border-border/50 bg-background hover:border-primary/30"
                }`}
              >
                {owner} <span className="text-muted-foreground">({count})</span>
              </button>
            ))}
            {filteredOwners.length === 0 && (
              <span className="text-xs text-muted-foreground">لا توجد شخصية مطابقة</span>
            )}
          </div>
        </div>
      )}
      {sectionPanels.map(({ id, index }) => {
        const meta = risenCategories.find((c) => c.id === id);
        const title = meta ? `${meta.emoji} ${meta.label}` : id;
        return (
          <div key={id} className="p-3 rounded-lg border border-border/50 bg-card/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-display font-bold">تصفح أقسام {title}</span>
              {filterRisenSection?.category === id && (
                <button onClick={() => setFilterRisenSection(null)} className="text-xs text-destructive hover:text-destructive/80">
                  مسح ✕
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {index.map(({ prefix, count }) => {
                const isActive = filterRisenSection?.category === id && filterRisenSection.prefix === prefix;
                return (
                  <button
                    key={prefix}
                    onClick={() => setFilterRisenSection(isActive ? null : { category: id, prefix })}
                    className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                      isActive ? "border-primary bg-primary/10" : "border-border/50 bg-background hover:border-primary/30"
                    }`}
                    title={prefix}
                  >
                    {prefix} <span className="text-muted-foreground">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {showItems && (
        <div className="p-3 rounded-lg border border-border/50 bg-card/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-display font-bold">تصفية الأغراض حسب النوع</span>
            {filterRisenItemPrefix && (
              <button onClick={() => setFilterRisenItemPrefix(null)} className="text-xs text-destructive hover:text-destructive/80">
                مسح ✕
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {itemPrefixIndex.map(({ prefix, label, count }) => (
              <button
                key={prefix}
                onClick={() => setFilterRisenItemPrefix(filterRisenItemPrefix === prefix ? null : prefix)}
                className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                  filterRisenItemPrefix === prefix ? "border-primary bg-primary/10" : "border-border/50 bg-background hover:border-primary/30"
                }`}
                title={prefix}
              >
                {label} <span className="text-muted-foreground">({count})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RisenSubFilters;
