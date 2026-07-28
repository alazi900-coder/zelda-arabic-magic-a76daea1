/**
 * Wolfenstein RPG category classification — mirrors mp-categories.ts:
 * deterministic, derived purely from an entry's msbtFile.
 *
 * The game's index file names nothing: it has banks and numbered sections and
 * that is all. So a section is labelled by its number rather than by a guess
 * at its contents — a wrong label costs a translator more than a plain one.
 */

import { parseWolfEntryFile } from "./wolf-editor-bridge";

export interface WolfCategory {
  id: string;
  label: string;
  emoji: string;
}

interface WolfCategoryEntry {
  msbtFile: string;
}

export function categorizeWolfSection(msbtFile: string): WolfCategory {
  const parsed = parseWolfEntryFile(msbtFile);
  if (!parsed) return { id: `wolf-${msbtFile}`, label: msbtFile, emoji: "📁" };
  return {
    id: `wolf-b${parsed.bank}-s${parsed.section}`,
    label: `الملف ${parsed.bank} — القسم ${parsed.section + 1}`,
    emoji: "📄",
  };
}

export function categorizeWolfEntry(entry: WolfCategoryEntry): string {
  return categorizeWolfSection(entry.msbtFile).id;
}

/** Build the list of categories actually present in the loaded entries. */
export function buildWolfCategories(entries: WolfCategoryEntry[]): WolfCategory[] {
  const seen = new Map<string, WolfCategory>();
  for (const e of entries) {
    const cat = categorizeWolfSection(e.msbtFile);
    if (!seen.has(cat.id)) seen.set(cat.id, cat);
  }
  return Array.from(seen.values());
}
