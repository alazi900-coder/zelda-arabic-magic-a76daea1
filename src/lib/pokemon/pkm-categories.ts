/**
 * Grouping Pokémon Ruby Destiny's lines for the editor.
 *
 * The ROM names nothing: lines are found by reading the bytes, so there is no
 * table that says "these are the item names". Rather than invent labels that
 * might be wrong, the grouping uses only what each line demonstrably is:
 *
 *   حوار      it breaks a line, substitutes a value, or ends in sentence
 *             punctuation — all things only spoken text does here;
 *   أسماء     short, no punctuation, no spaces: the shape of an item, move or
 *             place name;
 *   واجهة     everything else — menu labels, prompts, short notices.
 *
 * A translator working a category therefore knows what the rows have in common,
 * which is the point of the grouping, without being told a provenance nobody
 * measured.
 */

export interface PkmCategory {
  id: string;
  label: string;
  emoji: string;
}

interface PkmCategoryEntry {
  original: string;
}

const CATEGORIES: Record<string, PkmCategory> = {
  "pkm-dialogue": { id: "pkm-dialogue", label: "حوار", emoji: "💬" },
  "pkm-names": { id: "pkm-names", label: "أسماء وأغراض", emoji: "🏷️" },
  "pkm-ui": { id: "pkm-ui", label: "واجهة وقوائم", emoji: "🖥️" },
};

const SENTENCE_END = /[.!?…]\s*$/;

export function categorizePkmText(text: string): PkmCategory {
  if (text.includes("\n") || text.includes("{FD:") || SENTENCE_END.test(text)) {
    return CATEGORIES["pkm-dialogue"];
  }
  if (text.length <= 14 && !/\s/.test(text)) {
    return CATEGORIES["pkm-names"];
  }
  return CATEGORIES["pkm-ui"];
}

export function categorizePkmEntry(entry: PkmCategoryEntry): string {
  return categorizePkmText(entry.original).id;
}

/** The categories actually present in the loaded entries, in a fixed order. */
export function buildPkmCategories(entries: PkmCategoryEntry[]): PkmCategory[] {
  const present = new Set(entries.map((e) => categorizePkmText(e.original).id));
  return Object.values(CATEGORIES).filter((c) => present.has(c.id));
}
