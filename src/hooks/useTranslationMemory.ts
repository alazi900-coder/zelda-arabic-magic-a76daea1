import { useMemo, useCallback } from "react";
import type { EditorState } from "@/components/editor/types";

export interface TMSuggestion {
  key: string;
  original: string;
  translation: string;
  similarity: number;
}

/** Tokenize a string into lowercase words */
function tokenize(text: string): Set<string> {
  const words = new Set<string>();
  for (const w of text.toLowerCase().replace(/[^\w\s\u0600-\u06FF]/g, ' ').split(/\s+/)) {
    if (w.length > 1) words.add(w);
  }
  return words;
}

/** Jaccard similarity between two word sets (0-100) */
function wordSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : Math.round((intersection / union) * 100);
}

/**
 * Hook that provides a function to find similar translations from existing TM.
 * Returns a stable lookup function that takes an entry key + original text
 * and returns up to 3 similar previously-translated entries.
 */
export function useTranslationMemory(state: EditorState | null) {
  // Pre-build token index for all translated entries
  const tmIndex = useMemo(() => {
    if (!state?.entries) return [];
    const index: { key: string; original: string; translation: string; tokens: Set<string> }[] = [];
    for (const entry of state.entries) {
      const key = `${entry.msbtFile}:${entry.index}`;
      const tr = state.translations[key];
      if (tr?.trim()) {
        index.push({ key, original: entry.original, translation: tr, tokens: tokenize(entry.original) });
      }
    }
    return index;
  }, [state?.entries, state?.translations]);

  const findSimilar = useCallback((entryKey: string, original: string, minSimilarity = 40): TMSuggestion[] => {
    if (!original?.trim() || tmIndex.length === 0) return [];
    const queryTokens = tokenize(original);
    if (queryTokens.size === 0) return [];

    const results: TMSuggestion[] = [];
    for (const item of tmIndex) {
      if (item.key === entryKey) continue; // skip self
      const sim = wordSimilarity(queryTokens, item.tokens);
      if (sim >= minSimilarity && sim < 100) {
        results.push({ key: item.key, original: item.original, translation: item.translation, similarity: sim });
      }
    }
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, 3);
  }, [tmIndex]);

  return { findSimilar };
}
