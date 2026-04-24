/**
 * Lightweight per-key translation history stored in localStorage.
 * Used for versioning / undo across editor sessions.
 */
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
  } catch { /* ignore quota */ }
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

export function getHistory(key: string): HistoryEntry[] {
  const history = loadHistory();
  return history[key] || [];
}
