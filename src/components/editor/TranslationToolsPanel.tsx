import React, { useState, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, X, Sparkles, Copy, RotateCcw, Loader2, Bookmark, Clock, ArrowLeftRight } from "lucide-react";
import { EditorState, ExtractedEntry, categorizeFile, categorizeBdatTable, categorizeDanganronpaFile } from "@/components/editor/types";

import { toast } from "@/hooks/use-toast";

interface TranslationToolsPanelProps {
  state: EditorState;
  currentEntry: ExtractedEntry | null;
  currentTranslation: string;
  onApplyTranslation: (key: string, value: string) => void;
}

// Translation history stored in localStorage
const HISTORY_KEY = "translation-history-v1";

interface HistoryEntry {
  value: string;
  timestamp: number;
}

function loadHistory(): Record<string, HistoryEntry[]> {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveHistory(history: Record<string, HistoryEntry[]>) {
  try {
    // Keep only last 1000 entries to prevent storage bloat
    const keys = Object.keys(history);
    if (keys.length > 1000) {
      const sorted = keys.sort((a, b) => {
        const aLast = history[a]?.[0]?.timestamp || 0;
        const bLast = history[b]?.[0]?.timestamp || 0;
        return bLast - aLast;
      });
      const trimmed: Record<string, HistoryEntry[]> = {};
      for (const k of sorted.slice(0, 1000)) trimmed[k] = history[k];
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      return;
    }
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch { }
}

export function addToHistory(key: string, value: string) {
  if (!value?.trim()) return;
  const history = loadHistory();
  if (!history[key]) history[key] = [];
  // Don't add duplicate of latest
  if (history[key][0]?.value === value) return;
  history[key].unshift({ value, timestamp: Date.now() });
  // Keep max 10 versions per entry
  history[key] = history[key].slice(0, 10);
  saveHistory(history);
}

export default function TranslationToolsPanel({ state, currentEntry, currentTranslation, onApplyTranslation }: TranslationToolsPanelProps) {
  const isEnabled = (_id: string) => true;
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Back translation state
  const [backTranslation, setBackTranslation] = useState<string | null>(null);
  const [backTranslating, setBackTranslating] = useState(false);

  // Style translation state
  const [styleResult, setStyleResult] = useState<string | null>(null);
  const [styleTranslating, setStyleTranslating] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string>("formal");

  // History state
  const [showHistory, setShowHistory] = useState(false);

  const currentKey = currentEntry ? `${currentEntry.msbtFile}:${currentEntry.index}` : null;

  // Duplicate detection
  const duplicates = useMemo(() => {
    if (!isEnabled("duplicate_detect") || !state) return null;
    const groups: Record<string, { keys: string[]; entries: ExtractedEntry[] }> = {};
    for (const entry of state.entries) {
      const norm = entry.original.trim().toLowerCase();
      if (!norm || norm.length < 5) continue;
      if (!groups[norm]) groups[norm] = { keys: [], entries: [] };
      const key = `${entry.msbtFile}:${entry.index}`;
      groups[norm].keys.push(key);
      groups[norm].entries.push(entry);
    }
    const dupes = Object.entries(groups).filter(([, g]) => g.keys.length > 1);
    const untranslatedDupes = dupes.filter(([, g]) => {
      // At least one translated, at least one not
      const hasTranslated = g.keys.some(k => state.translations[k]?.trim());
      const hasUntranslated = g.keys.some(k => !state.translations[k]?.trim());
      return hasTranslated && hasUntranslated;
    });
    return { total: dupes.length, actionable: untranslatedDupes.length, groups: untranslatedDupes };
  }, [state?.entries, state?.translations, isEnabled]);

  // Priority categories
  const priorityStats = useMemo(() => {
    if (!isEnabled("priority_translate") || !state) return null;
    const priorityOrder = ["bdat-title-menu", "bdat-menu", "main-menu", "settings", "hud", "pause-menu"];
    const stats: { category: string; label: string; total: number; translated: number }[] = [];
    for (const cat of priorityOrder) {
      const entries = state.entries.filter(e => {
        const isBdat = /^.+?\\\\[\\d+\\]\\\\./.test(e.label);
        const sourceFile = e.msbtFile.startsWith('bdat-bin:') ? e.msbtFile.split(':')[1] : e.msbtFile.startsWith('bdat:') ? e.msbtFile.slice(5) : undefined;
        const isDr = !isBdat && e.msbtFile.includes(':') && !e.msbtFile.startsWith('bdat');
        const c = isBdat ? categorizeBdatTable(e.label, sourceFile) : isDr ? categorizeDanganronpaFile(e.msbtFile) : categorizeFile(e.msbtFile);
        return c === cat;
      });
      if (entries.length === 0) continue;
      const translated = entries.filter(e => state.translations[`${e.msbtFile}:${e.index}`]?.trim()).length;
      const catLabels: Record<string, string> = {
        "bdat-title-menu": "🏠 القائمة الرئيسية",
        "bdat-menu": "🖥️ القوائم والواجهة",
        "main-menu": "🏠 القائمة الرئيسية",
        "settings": "⚙️ الإعدادات",
        "hud": "🖥️ واجهة اللعب",
        "pause-menu": "⏸️ قائمة الإيقاف",
      };
      stats.push({ category: cat, label: catLabels[cat] || cat, total: entries.length, translated });
    }
    return stats;
  }, [state?.entries, state?.translations, isEnabled]);

  // History for current entry
  const historyEntries = useMemo(() => {
    if (!isEnabled("translation_history") || !currentKey) return [];
    const history = loadHistory();
    return history[currentKey] || [];
  }, [currentKey, isEnabled, currentTranslation]); // re-check when translation changes

  // Back translate handler
  const handleBackTranslate = useCallback(async () => {
    if (!currentTranslation?.trim()) return;
    setBackTranslating(true);
    setBackTranslation(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/translation-tools`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: currentTranslation, style: 'back-translate' }),
      });
      if (response.status === 429) {
        toast({ title: "⚠️ حد الطلبات", description: "تم تجاوز حد الطلبات، حاول لاحقاً", variant: "destructive" });
        return;
      }
      if (response.status === 402) {
        toast({ title: "⚠️ رصيد غير كافٍ", description: "يرجى إضافة رصيد للذكاء الاصطناعي", variant: "destructive" });
        return;
      }
      if (!response.ok) throw new Error(`Error ${response.status}`);
      const data = await response.json();
      setBackTranslation(data.result || 'لا توجد نتيجة');
    } catch (err) {
      console.error('Back translate error:', err);
      toast({ title: "❌ فشل الترجمة العكسية", variant: "destructive" });
    } finally {
      setBackTranslating(false);
    }
  }, [currentTranslation]);

  // Style translate handler
  const handleStyleTranslate = useCallback(async () => {
    if (!currentEntry?.original?.trim()) return;
    setStyleTranslating(true);
    setStyleResult(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const response = await fetch(`${supabaseUrl}/functions/v1/translation-tools`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseKey}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: currentEntry.original, style: selectedStyle }),
      });
      if (response.status === 429 || response.status === 402) {
        toast({ title: "⚠️ خطأ", description: response.status === 429 ? "حد الطلبات" : "رصيد غير كافٍ", variant: "destructive" });
        return;
      }
      if (!response.ok) throw new Error(`Error ${response.status}`);
      const data = await response.json();
      setStyleResult(data.result || '');
    } catch (err) {
      console.error('Style translate error:', err);
      toast({ title: "❌ فشلت الترجمة", variant: "destructive" });
    } finally {
      setStyleTranslating(false);
    }
  }, [currentEntry, selectedStyle]);

  // Apply duplicates
  const handleApplyDuplicates = useCallback(() => {
    if (!duplicates || !state) return;
    let applied = 0;
    for (const [, group] of duplicates.groups) {
      const translatedKey = group.keys.find(k => state.translations[k]?.trim());
      if (!translatedKey) continue;
      const translation = state.translations[translatedKey];
      for (const k of group.keys) {
        if (!state.translations[k]?.trim()) {
          onApplyTranslation(k, translation);
          applied++;
        }
      }
    }
    toast({ title: `✅ تم نسخ ${applied} ترجمة من النصوص المكررة` });
  }, [duplicates, state, onApplyTranslation]);

  // Check if any translation tool is enabled
  const anyEnabled = ["back_translate", "duplicate_detect", "style_translate", "translation_history", "priority_translate", "context_translate"].some(id => isEnabled(id));
  if (!anyEnabled || dismissed) return null;

  return (
    <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardContent className="p-3">
          <CollapsibleTrigger className="flex items-center justify-between w-full text-right">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="font-display font-bold text-sm">أدوات الترجمة المتقدمة</span>
              {duplicates && duplicates.actionable > 0 && (
                <Badge variant="secondary" className="text-xs">{duplicates.actionable} مكرر</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={(e) => { e.stopPropagation(); setDismissed(true); }}>
                <X className="w-3 h-3" />
              </Button>
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-3 space-y-3">

            {/* === Duplicate Detection === */}
            {isEnabled("duplicate_detect") && duplicates && (
              <div className="bg-background/50 rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-display font-bold flex items-center gap-1">
                    <Copy className="w-3 h-3" /> كشف النصوص المكررة
                  </span>
                  <Badge variant="outline" className="text-xs">{duplicates.total} مجموعة مكررة</Badge>
                </div>
                {duplicates.actionable > 0 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-body">
                      {duplicates.actionable} مجموعة يمكن نسخ ترجمتها تلقائياً
                    </span>
                    <Button size="sm" variant="secondary" className="text-xs h-7" onClick={handleApplyDuplicates}>
                      <Copy className="w-3 h-3 ml-1" /> نسخ الكل
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">لا توجد مكررات تحتاج نسخ ترجمة</p>
                )}
              </div>
            )}

            {/* === Priority Translation === */}
            {isEnabled("priority_translate") && priorityStats && priorityStats.length > 0 && (
              <div className="bg-background/50 rounded p-3 space-y-2">
                <span className="text-xs font-display font-bold flex items-center gap-1">
                  <Bookmark className="w-3 h-3" /> ترجمة حسب الأولوية
                </span>
                <p className="text-xs text-muted-foreground font-body">ابدأ بترجمة القوائم الرئيسية أولاً:</p>
                <div className="space-y-1">
                  {priorityStats.map(p => (
                    <div key={p.category} className="flex items-center justify-between text-xs">
                      <span className="font-body">{p.label}</span>
                      <span className={`font-mono ${p.translated === p.total ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {p.translated}/{p.total} ({Math.round(p.translated / p.total * 100)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* === Entry-specific tools (only when an entry is selected) === */}
            {currentEntry && currentKey && (
              <>
                {/* Back Translation */}
                {isEnabled("back_translate") && currentTranslation?.trim() && (
                  <div className="bg-background/50 rounded p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-display font-bold flex items-center gap-1">
                        <ArrowLeftRight className="w-3 h-3" /> ترجمة عكسية (عربي ← إنجليزي)
                      </span>
                      <Button size="sm" variant="secondary" className="text-xs h-7" onClick={handleBackTranslate} disabled={backTranslating}>
                        {backTranslating ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowLeftRight className="w-3 h-3" />}
                        {backTranslating ? 'جاري...' : 'تحقق'}
                      </Button>
                    </div>
                    {backTranslation && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-primary/5 rounded p-2 font-body" dir="ltr">
                          <span className="text-[10px] text-muted-foreground block mb-0.5">الأصل:</span>
                          {currentEntry.original.slice(0, 150)}
                        </div>
                        <div className="bg-amber-500/10 rounded p-2 font-body" dir="ltr">
                          <span className="text-[10px] text-muted-foreground block mb-0.5">الترجمة العكسية:</span>
                          {backTranslation.slice(0, 150)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Style Translation */}
                {isEnabled("style_translate") && (
                  <div className="bg-background/50 rounded p-3 space-y-2">
                    <span className="text-xs font-display font-bold flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> ترجمة بأسلوب محدد
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {[
                        { id: 'formal', label: '📜 رسمي' },
                        { id: 'informal', label: '💬 عامي' },
                        { id: 'poetic', label: '✨ شعري' },
                        { id: 'gaming', label: '🎮 ألعاب' },
                      ].map(s => (
                        <Button
                          key={s.id}
                          size="sm"
                          variant={selectedStyle === s.id ? 'default' : 'outline'}
                          className="text-xs h-6"
                          onClick={() => setSelectedStyle(s.id)}
                        >
                          {s.label}
                        </Button>
                      ))}
                      <Button size="sm" variant="secondary" className="text-xs h-7" onClick={handleStyleTranslate} disabled={styleTranslating}>
                        {styleTranslating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        ترجم
                      </Button>
                    </div>
                    {styleResult && (
                      <div className="bg-amber-500/10 rounded p-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-muted-foreground">النتيجة:</span>
                          <Button size="sm" variant="ghost" className="text-xs h-5 text-emerald-400" onClick={() => {
                            if (currentKey) {
                              onApplyTranslation(currentKey, styleResult);
                              toast({ title: "✅ تم تطبيق الترجمة" });
                            }
                          }}>
                            تطبيق ✓
                          </Button>
                        </div>
                        <p className="text-xs font-body" dir="rtl">{styleResult}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Translation History */}
                {isEnabled("translation_history") && historyEntries.length > 0 && (
                  <div className="bg-background/50 rounded p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-display font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3" /> تاريخ الترجمات ({historyEntries.length})
                      </span>
                      <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => setShowHistory(!showHistory)}>
                        {showHistory ? 'إخفاء' : 'عرض'}
                      </Button>
                    </div>
                    {showHistory && (
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {historyEntries.map((h, i) => (
                          <div key={i} className="flex items-center justify-between bg-background/40 rounded p-1.5 text-xs">
                            <div className="flex-1 font-body truncate" dir="rtl">{h.value}</div>
                            <div className="flex items-center gap-1 shrink-0 mr-2">
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(h.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <Button size="sm" variant="ghost" className="text-xs h-5" onClick={() => {
                                if (currentKey) onApplyTranslation(currentKey, h.value);
                              }}>
                                <RotateCcw className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* No entry selected hint */}
            {!currentEntry && (
              <p className="text-xs text-muted-foreground text-center py-2 font-body">
                اختر نصاً من القائمة لاستخدام أدوات الترجمة العكسية والأسلوب والتاريخ
              </p>
            )}
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}
