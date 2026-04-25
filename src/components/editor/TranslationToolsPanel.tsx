import { useMemo, useCallback, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Copy, AlertTriangle, Languages, Wrench, ChevronDown, ChevronRight } from "lucide-react";
import type { EditorState } from "@/components/editor/types";
import { detectLiteralTranslation, analyzeLiteralTranslation } from "@/components/editor/TranslationProgressDashboard";
import { toast } from "@/hooks/use-toast";

interface TranslationToolsPanelProps {
  state: EditorState;
  currentEntry: null;
  currentTranslation: string;
  onApplyTranslation: (key: string, value: string) => void;
}

export default function TranslationToolsPanel({ state, onApplyTranslation }: TranslationToolsPanelProps) {
  const [tab, setTab] = useState<"duplicates" | "literal">("duplicates");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // Sensitivity slider for literal-translation detection (0.20 - 0.80, default 0.40)
  const [literalThreshold, setLiteralThreshold] = useState<number>(0.4);

  // ---- Duplicate detection (English text repeated, only some translated) ----
  const duplicates = useMemo(() => {
    if (!state) return { actionable: [] as Array<{ english: string; keys: string[]; translated: string }>, total: 0 };
    const groups: Record<string, { english: string; keys: string[]; translated: string | null }> = {};
    for (const entry of state.entries) {
      const norm = entry.original.trim().toLowerCase();
      if (!norm || norm.length < 5) continue;
      const k = `${entry.msbtFile}:${entry.index}`;
      if (!groups[norm]) groups[norm] = { english: entry.original.trim(), keys: [], translated: null };
      groups[norm].keys.push(k);
      if (state.translations[k]?.trim()) groups[norm].translated = state.translations[k];
    }
    const actionable = Object.values(groups)
      .filter(g => g.keys.length > 1 && g.translated && g.keys.some(k => !state.translations[k]?.trim()))
      .map(g => ({ english: g.english, keys: g.keys, translated: g.translated! }));
    const total = Object.values(groups).filter(g => g.keys.length > 1).length;
    return { actionable, total };
  }, [state?.entries, state?.translations]);

  // ---- Literal-translation detection (uses configurable threshold) ----
  const literals = useMemo(() => {
    if (!state) return [] as Array<{ key: string; english: string; arabic: string }>;
    const out: Array<{ key: string; english: string; arabic: string }> = [];
    for (const entry of state.entries) {
      const k = `${entry.msbtFile}:${entry.index}`;
      const tr = state.translations[k]?.trim();
      if (!tr) continue;
      if (detectLiteralTranslation(entry.original, tr, literalThreshold)) {
        out.push({ key: k, english: entry.original, arabic: tr });
      }
    }
    return out;
  }, [state?.entries, state?.translations, literalThreshold]);

  // ---- Apply all duplicates at once ----
  const handleApplyAllDuplicates = useCallback(() => {
    let applied = 0;
    for (const g of duplicates.actionable) {
      for (const k of g.keys) {
        if (!state.translations[k]?.trim()) {
          onApplyTranslation(k, g.translated);
          applied++;
        }
      }
    }
    toast({ title: `✅ تم نسخ ${applied} ترجمة من النصوص المكررة` });
  }, [duplicates, state, onApplyTranslation]);

  const handleApplySingleDuplicate = useCallback((g: { keys: string[]; translated: string }) => {
    let applied = 0;
    for (const k of g.keys) {
      if (!state.translations[k]?.trim()) {
        onApplyTranslation(k, g.translated);
        applied++;
      }
    }
    toast({ title: `✅ تم نسخ ${applied} ترجمة` });
  }, [state, onApplyTranslation]);

  const handleClearLiteral = useCallback((key: string) => {
    onApplyTranslation(key, "");
    toast({ title: "🗑️ تم مسح الترجمة الحرفية — أعد الترجمة" });
  }, [onApplyTranslation]);

  const totalIssues = duplicates.actionable.length + literals.length;
  // Hide only when there's nothing to show AND no translated entries to scan
  const hasAnyTranslation = state && Object.values(state.translations || {}).some(v => v?.trim());
  if (totalIssues === 0 && !hasAnyTranslation) return null;

  return (
    <Card className="border-border/50">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-semibold">أدوات الترجمة المتقدمة</span>
          <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-mono">{totalIssues}</span>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "duplicates" | "literal")} className="w-full">
          <TabsList className="grid grid-cols-2 h-8">
            <TabsTrigger value="duplicates" className="text-[11px] gap-1">
              <Copy className="w-3 h-3" />
              مكررة
              {duplicates.actionable.length > 0 && (
                <span className="text-[9px] bg-accent/20 text-accent px-1 rounded">{duplicates.actionable.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="literal" className="text-[11px] gap-1">
              <Languages className="w-3 h-3" />
              حرفية
              {literals.length > 0 && (
                <span className="text-[9px] bg-destructive/20 text-destructive px-1 rounded">{literals.length}</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* DUPLICATES TAB */}
          <TabsContent value="duplicates" className="mt-2 space-y-1.5">
            {duplicates.actionable.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">لا توجد نصوص مكررة قابلة للنسخ</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {duplicates.actionable.length} مجموعة قابلة للنسخ ({duplicates.total} مكرر إجمالاً)
                  </span>
                  <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={handleApplyAllDuplicates}>
                    <Copy className="w-3 h-3 ml-1" /> نسخ الكل
                  </Button>
                </div>
                <div className="space-y-1 max-h-[260px] overflow-y-auto">
                  {duplicates.actionable.slice(0, 30).map((g) => {
                    const isExpanded = expandedKey === g.english;
                    const missing = g.keys.filter(k => !state.translations[k]?.trim()).length;
                    return (
                      <div key={g.english} className="border border-border/30 rounded overflow-hidden">
                        <button
                          className="w-full flex items-center gap-1.5 p-1.5 text-right hover:bg-muted/30"
                          onClick={() => setExpandedKey(isExpanded ? null : g.english)}
                        >
                          {isExpanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                          <span className="flex-1 text-[11px] font-mono truncate" dir="ltr">{g.english}</span>
                          <span className="text-[9px] text-accent shrink-0">+{missing}</span>
                        </button>
                        {isExpanded && (
                          <div className="px-2 pb-1.5 space-y-1 border-t border-border/30 bg-muted/10">
                            <div className="text-[11px] font-body py-1" dir="rtl">{g.translated}</div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-6 text-[10px]"
                              onClick={() => handleApplySingleDuplicate(g)}
                            >
                              نسخ على {missing} إدخال
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>

          {/* LITERAL TAB */}
          <TabsContent value="literal" className="mt-2 space-y-1.5">
            {/* Sensitivity slider — controls englishRatioThreshold */}
            <div className="flex items-center gap-2 px-1 py-1 rounded bg-muted/20">
              <span className="text-[10px] text-muted-foreground shrink-0">حساسية:</span>
              <Slider
                value={[literalThreshold]}
                onValueChange={(v) => setLiteralThreshold(v[0])}
                min={0.2}
                max={0.8}
                step={0.05}
                className="flex-1"
              />
              <span className="text-[10px] font-mono text-primary shrink-0 w-10 text-center">
                {Math.round(literalThreshold * 100)}%
              </span>
            </div>
            {literals.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">لا توجد ترجمات حرفية مشبوهة</p>
            ) : (
              <>
                <div className="flex items-center gap-1.5 text-[11px] text-destructive">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{literals.length} ترجمة تحتوي كلمات إنجليزية كثيرة (&gt;{Math.round(literalThreshold * 100)}%)</span>
                </div>
                <div className="space-y-1 max-h-[260px] overflow-y-auto">
                  {literals.slice(0, 30).map((l) => (
                    <div key={l.key} className="border border-destructive/20 rounded p-1.5 bg-destructive/5 space-y-1">
                      <div className="text-[10px] font-mono text-muted-foreground truncate" dir="ltr">{l.english}</div>
                      <div className="text-[11px] font-body" dir="rtl">{l.arabic}</div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full h-6 text-[10px] text-destructive hover:bg-destructive/10"
                        onClick={() => handleClearLiteral(l.key)}
                      >
                        مسح وإعادة الترجمة
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Re-export for backwards compatibility — actual implementation moved to translation-history.ts
export { addToHistory } from "@/lib/translation-history";
