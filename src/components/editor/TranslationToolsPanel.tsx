import { useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { EditorState } from "@/components/editor/types";
import { toast } from "@/hooks/use-toast";

interface TranslationToolsPanelProps {
  state: EditorState;
  currentEntry: null;
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
  if (history[key][0]?.value === value) return;
  history[key].unshift({ value, timestamp: Date.now() });
  history[key] = history[key].slice(0, 10);
  saveHistory(history);
}

export default function TranslationToolsPanel({ state, onApplyTranslation }: TranslationToolsPanelProps) {
  const duplicates = useMemo(() => {
    if (!state) return null;
    const groups: Record<string, { keys: string[]; translated: string | null }> = {};
    for (const entry of state.entries) {
      const norm = entry.original.trim().toLowerCase();
      if (!norm || norm.length < 5) continue;
      const key = `${entry.msbtFile}:${entry.index}`;
      if (!groups[norm]) groups[norm] = { keys: [], translated: null };
      groups[norm].keys.push(key);
      if (state.translations[key]?.trim()) groups[norm].translated = state.translations[key];
    }
    const actionable = Object.values(groups).filter(
      g => g.keys.length > 1 && g.translated && g.keys.some(k => !state.translations[k]?.trim())
    );
    return { total: Object.values(groups).filter(g => g.keys.length > 1).length, actionable };
  }, [state?.entries, state?.translations]);

  const handleApplyDuplicates = useCallback(() => {
    if (!duplicates || !state) return;
    let applied = 0;
    for (const group of duplicates.actionable) {
      if (!group.translated) continue;
      for (const k of group.keys) {
        if (!state.translations[k]?.trim()) {
          onApplyTranslation(k, group.translated);
          applied++;
        }
      }
    }
    toast({ title: `✅ تم نسخ ${applied} ترجمة من النصوص المكررة` });
  }, [duplicates, state, onApplyTranslation]);

  if (!duplicates || duplicates.actionable.length === 0) return null;

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardContent className="p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Copy className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-display">
            {duplicates.actionable.length} نص مكرر يمكن نسخ ترجمته تلقائياً
          </span>
          <span className="text-xs text-muted-foreground">({duplicates.total} مجموعة)</span>
        </div>
        <Button size="sm" variant="secondary" className="text-xs h-7 shrink-0" onClick={handleApplyDuplicates}>
          <Copy className="w-3 h-3 ml-1" /> نسخ الكل
        </Button>
      </CardContent>
    </Card>
  );
}
