import React from "react";
import { FILE_CATEGORIES, BDAT_CATEGORIES, DR_CATEGORIES } from "./types";
import {
  AlertTriangle, Wrench, Loader2, Sparkles, RefreshCw,
  Monitor, Swords, Users, Skull, ScrollText, MapPin, BookOpen,
  Gem, Shield, Lightbulb, Backpack, FolderOpen,
  Home, Settings, MonitorSmartphone, Pause, Sword, Target, ShieldCheck,
  Shirt, FlaskConical, Utensils, Key, BookText, Map, Drama, MessageCircle,
  Gamepad2, MessageSquare, SlidersHorizontal, Zap, Tent, Clapperboard,
  ShoppingCart, BarChart3,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  Monitor, Swords, Users, Skull, ScrollText, MapPin, BookOpen,
  Sparkles, Gem, Shield, Lightbulb, Backpack, FolderOpen,
  Home, Settings, MonitorSmartphone, Pause, Sword, Target, ShieldCheck,
  Shirt, FlaskConical, Utensils, Key, BookText, Map, Drama, MessageCircle,
  Gamepad2, MessageSquare, Wrench, SlidersHorizontal, Zap, Tent, Clapperboard,
  ShoppingCart, BarChart3,
};

interface CategoryProgressProps {
  categoryProgress: Record<string, { total: number; translated: number }>;
  filterCategory: string[];
  setFilterCategory: (cat: string[]) => void;
  damagedTagsCount?: number;
  onFilterDamagedTags?: () => void;
  isDamagedTagsActive?: boolean;
  onFixDamagedTags?: () => void;
  isFixing?: boolean;
  onLocalFixDamagedTags?: () => void;
  onRedistributeTags?: () => void;
  tagsCount?: number;
  isBdat?: boolean;
  isDanganronpa?: boolean;
}

const CategoryProgress: React.FC<CategoryProgressProps> = ({ categoryProgress, filterCategory, setFilterCategory, damagedTagsCount = 0, onFilterDamagedTags, isDamagedTagsActive, onFixDamagedTags, isFixing, onLocalFixDamagedTags, onRedistributeTags, tagsCount = 0, isBdat = false, isDanganronpa = false }) => {
  const categories = isDanganronpa ? DR_CATEGORIES : isBdat ? BDAT_CATEGORIES : FILE_CATEGORIES;
  const activeCats = categories.filter(cat => categoryProgress[cat.id]);
  if (activeCats.length === 0 && !categoryProgress['other']) return null;

  // Overall stats
  const allKeys = [...activeCats.map(c => c.id), ...(categoryProgress['other'] ? ['other'] : [])];
  const totalAll = allKeys.reduce((s, k) => s + (categoryProgress[k]?.total || 0), 0);
  const translatedAll = allKeys.reduce((s, k) => s + (categoryProgress[k]?.translated || 0), 0);
  const overallPct = totalAll > 0 ? Math.round((translatedAll / totalAll) * 100) : 0;

  const pctColor = (pct: number) =>
    pct === 100 ? 'text-emerald-400' : pct >= 75 ? 'text-sky-400' : pct >= 50 ? 'text-amber-400' : pct >= 25 ? 'text-orange-400' : 'text-red-400';
  const barColor = (pct: number) =>
    pct === 100 ? 'bg-emerald-500' : pct >= 75 ? 'bg-sky-500' : pct >= 50 ? 'bg-amber-500' : pct >= 25 ? 'bg-orange-500' : 'bg-red-500';

  return (
    <div>
      {/* Overall progress summary */}
      <div className="mb-4 p-3 rounded-lg border border-border/50 bg-card/50">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-display font-bold">إجمالي التقدم</span>
          <span className={`text-lg font-mono font-bold ${pctColor(overallPct)}`}>{overallPct}%</span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-secondary overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${barColor(overallPct)}`} style={{ width: `${overallPct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 text-left font-mono" dir="ltr">{translatedAll.toLocaleString()} / {totalAll.toLocaleString()}</p>
      </div>
      {filterCategory.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-body">
            {filterCategory.length} فئة محددة
          </span>
          <button
            onClick={() => setFilterCategory([])}
            className="text-xs text-destructive hover:text-destructive/80 font-display"
          >
            مسح الكل ✕
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-6">
      {/* Damaged tags warning card */}
      {damagedTagsCount > 0 && (
        <div
          className={`p-2 rounded-lg border text-xs text-right transition-colors ${
            isDamagedTagsActive
              ? 'border-destructive bg-destructive/10'
              : 'border-destructive/40 bg-destructive/5 hover:border-destructive/60'
          }`}
        >
          <button onClick={onFilterDamagedTags} className="w-full text-right">
            <div className="flex items-center justify-between mb-1">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="font-mono text-destructive font-bold">{damagedTagsCount}</span>
            </div>
            <p className="font-display font-bold truncate text-destructive">رموز تالفة ⚠️</p>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onLocalFixDamagedTags?.(); }}
            className="mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-destructive/20 hover:bg-destructive/30 text-destructive font-bold text-[11px] transition-colors"
          >
            <Wrench className="w-3 h-3" />
            🔧 إصلاح محلي (بدون AI)
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onFixDamagedTags?.(); }}
            disabled={isFixing}
            className="mt-1 w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground text-[10px] transition-colors disabled:opacity-50"
          >
            {isFixing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {isFixing ? 'جارٍ الإصلاح...' : 'إعادة ترجمة بالـ AI'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRedistributeTags?.(); }}
            className="mt-1 w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-bold text-[10px] transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            إعادة توزيع الرموز
          </button>
        </div>
      )}
      {/* Redistribute tags card — shows when tags exist but no damaged ones */}
      {damagedTagsCount === 0 && tagsCount > 0 && (
        <div className="p-2 rounded-lg border border-amber-500/40 bg-amber-500/5 text-xs text-right">
          <div className="flex items-center justify-between mb-1">
            <RefreshCw className="w-4 h-4 text-amber-400" />
            <span className="font-mono text-amber-400 font-bold">{tagsCount}</span>
          </div>
          <p className="font-display font-bold truncate text-amber-400">نصوص برموز تقنية</p>
          <button
            onClick={onRedistributeTags}
            className="mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-bold text-[11px] transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            إعادة توزيع الرموز
          </button>
        </div>
      )}
      {categories.filter(cat => categoryProgress[cat.id]).map(cat => {
        const prog = categoryProgress[cat.id];
        const pct = prog.total > 0 ? Math.round((prog.translated / prog.total) * 100) : 0;
        return (
          <button
            key={cat.id}
            onClick={() => setFilterCategory(
              filterCategory.includes(cat.id)
                ? filterCategory.filter(c => c !== cat.id)
                : [...filterCategory, cat.id]
            )}
            className={`p-2 rounded-lg border text-xs text-right transition-colors ${
              filterCategory.includes(cat.id)
                ? 'border-primary bg-primary/10'
                : 'border-border/50 bg-card/50 hover:border-primary/30'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              {cat.icon && ICON_MAP[cat.icon] ? (
                React.createElement(ICON_MAP[cat.icon], { className: `w-4 h-4 ${cat.color || 'text-muted-foreground'}` })
              ) : (
                <span>{cat.emoji}</span>
              )}
              <span className={`font-mono font-bold text-xs ${pctColor(pct)}`}>{pct}%</span>
            </div>
            <p className="font-display font-bold truncate text-[11px]">{cat.label}</p>
            <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden mt-1">
              <div className={`h-full rounded-full transition-all duration-500 ${barColor(pct)}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-muted-foreground mt-1 font-mono text-[10px]">{prog.translated}/{prog.total}</p>
          </button>
        );
      })}
      {categoryProgress['other'] && (
        <button
          onClick={() => setFilterCategory(
            filterCategory.includes("other")
              ? filterCategory.filter(c => c !== "other")
              : [...filterCategory, "other"]
          )}
          className={`p-2 rounded-lg border text-xs text-right transition-colors ${
            filterCategory.includes("other")
              ? 'border-primary bg-primary/10'
              : 'border-border/50 bg-card/50 hover:border-primary/30'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <FolderOpen className="w-4 h-4 text-muted-foreground" />
            <span className={`font-mono font-bold text-xs ${pctColor(categoryProgress['other'].total > 0 ? Math.round((categoryProgress['other'].translated / categoryProgress['other'].total) * 100) : 0)}`}>
              {categoryProgress['other'].total > 0 ? Math.round((categoryProgress['other'].translated / categoryProgress['other'].total) * 100) : 0}%
            </span>
          </div>
          <p className="font-display font-bold truncate text-[11px]">أخرى</p>
          <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden mt-1">
            <div className={`h-full rounded-full transition-all duration-500 ${barColor(categoryProgress['other'].total > 0 ? Math.round((categoryProgress['other'].translated / categoryProgress['other'].total) * 100) : 0)}`} style={{ width: `${categoryProgress['other'].total > 0 ? (categoryProgress['other'].translated / categoryProgress['other'].total) * 100 : 0}%` }} />
          </div>
          <p className="text-muted-foreground mt-1 font-mono text-[10px]">{categoryProgress['other'].translated}/{categoryProgress['other'].total}</p>
        </button>
      )}
      </div>
    </div>
  );
};

export default CategoryProgress;
