/**
 * Mother 3 category classification — mirrors src/lib/risen/categories.ts:
 * deterministic, based purely on an entry's msbtFile prefix (bank_N for
 * dialogue, names_<table> for the flat name tables), never character-name
 * guessing. An unrecognized names_* table gets its own category (labeled
 * with its own id) rather than a generic "other" bucket, so a newly wired
 * table is filterable immediately without touching this file.
 */

export interface Mother3Category {
  id: string;
  label: string;
  emoji: string;
}

interface Mother3CategoryEntry {
  msbtFile: string;
}

const KNOWN_TABLE_CATEGORIES: Record<string, Mother3Category> = {
  names_itemnames: { id: "mother3-items", label: "أسماء الأغراض", emoji: "🎒" },
  names_statuses: { id: "mother3-statuses", label: "أسماء الحالات", emoji: "🩹" },
  names_psinames: { id: "mother3-psi", label: "قوى PSI", emoji: "✨" },
};

const DIALOGUE_CATEGORY: Mother3Category = { id: "mother3-dialogue", label: "الحوارات", emoji: "💬" };

/** Categorize one entry's table (Level 1, same granularity as Risen). */
export function categorizeMother3Table(msbtFile: string): Mother3Category {
  if (/^bank_\d+$/.test(msbtFile)) return DIALOGUE_CATEGORY;
  const known = KNOWN_TABLE_CATEGORIES[msbtFile];
  if (known) return known;
  return { id: `mother3-${msbtFile}`, label: msbtFile, emoji: "📁" };
}

export function categorizeMother3Entry(entry: Mother3CategoryEntry): string {
  return categorizeMother3Table(entry.msbtFile).id;
}

/** Build the list of categories actually present in the loaded entries. */
export function buildMother3Categories(entries: Mother3CategoryEntry[]): Mother3Category[] {
  const seen = new Map<string, Mother3Category>();
  for (const e of entries) {
    const cat = categorizeMother3Table(e.msbtFile);
    if (!seen.has(cat.id)) seen.set(cat.id, cat);
  }
  return Array.from(seen.values());
}
