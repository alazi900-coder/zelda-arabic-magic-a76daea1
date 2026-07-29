/**
 * Grouping Pokémon Ruby Destiny's lines for the editor.
 *
 * The ROM names nothing, so the first version sorted lines by what the text
 * looked like — length, punctuation. That is guesswork: "POTION" and "SNOW
 * SOFT" read exactly alike, and a translator filtering to "names" got a mix.
 *
 * The real signal is in the file. Gen 3 keeps its lists — species, moves,
 * items, trainers — in arrays of equal-sized slots, so those lines sit an exact
 * distance apart, while dialogue is packed end to end at whatever length each
 * line happens to be. pkm-rom.ts measures that spacing, then names each list by
 * the entries at its head: a list holding Bulbasaur and Charmander is the
 * species list, whatever else is in it. This file only reads the result.
 *
 * Lists nothing recognised — the hack's own trainer names, its decorations —
 * keep the kind `list`, and only those fall back to reading the text. That
 * fallback is a guess and is used nowhere else.
 */

/** What a fixed-stride list turned out to hold. `list` = measured, unnamed. */
export type PkmListKind = "species" | "moves" | "items" | "people" | "list";

/**
 * `pkm_rom` for a free-standing line, `pkm_<kind>` for a list entry.
 *
 * `pkm_t<stride>` is the older naming, from when a line carried the slot size
 * of its list rather than what the list held. Sessions saved then are still on
 * disk, and refusing to recognise them would drop those lines out of the
 * Pokémon paths entirely — no category cards, no diagnostics, and the wrong
 * translation prompt.
 */
export const PKM_FILE_RE = /^pkm_(?:rom|species|moves|items|people|list|t\d+)$/;

export const PKM_ENTRY_FILE = "pkm_rom";

/**
 * The entry's file name carries the one thing the editor cannot re-derive.
 *
 * Which list a line belongs to is measured while scanning the ROM. The editor
 * stores entries and reloads them later, so the fact has to travel inside a
 * field that survives the round trip.
 */
export function pkmEntryFile(kind?: PkmListKind): string {
  return kind ? `pkm_${kind}` : PKM_ENTRY_FILE;
}

export function pkmKindOf(msbtFile: string): PkmListKind | null {
  const m = /^pkm_(species|moves|items|people|list)$/.exec(msbtFile);
  return m ? (m[1] as PkmListKind) : null;
}

export interface PkmCategory {
  id: string;
  label: string;
  emoji: string;
}

interface PkmCategoryEntry {
  msbtFile: string;
  original: string;
}

const CATEGORIES: Record<string, PkmCategory> = {
  "pkm-dialogue": { id: "pkm-dialogue", label: "حوار", emoji: "💬" },
  "pkm-species": { id: "pkm-species", label: "أسماء بوكيمون", emoji: "🐾" },
  "pkm-items": { id: "pkm-items", label: "أغراض وأدوات", emoji: "🎒" },
  "pkm-moves": { id: "pkm-moves", label: "مهارات وقدرات", emoji: "⚔️" },
  "pkm-places": { id: "pkm-places", label: "أماكن وشخصيات", emoji: "📍" },
  "pkm-ui": { id: "pkm-ui", label: "قوائم وأزرار", emoji: "🖥️" },
};

/** Fixed display order, so the filter cards never shuffle between loads. */
const ORDER = ["pkm-dialogue", "pkm-species", "pkm-items", "pkm-moves", "pkm-places", "pkm-ui"];

const KIND_CATEGORY: Record<Exclude<PkmListKind, "list">, string> = {
  species: "pkm-species",
  items: "pkm-items",
  moves: "pkm-moves",
  people: "pkm-places",
};

const SENTENCE_END = /[.!?…]\s*$/;
const HAS_TAG = /\{[0-9a-fA-F]{2}\}|\{FD:[0-9a-fA-F]{2}\}/;

export function categorizePkmLine(text: string, kind: PkmListKind | null): PkmCategory {
  // A named list decides on its own. It is a fact about the file, so it beats
  // anything the text might suggest — "Exp. Share" ends like a sentence and is
  // still an item.
  if (kind && kind !== "list") return CATEGORIES[KIND_CATEGORY[kind]];
  // Everything else: a line that breaks, carries a substituted value or closes
  // a sentence is speech; a short single word is a place or a person; the rest
  // is what the interface says.
  if (text.includes("\n") || HAS_TAG.test(text) || SENTENCE_END.test(text)) {
    return CATEGORIES["pkm-dialogue"];
  }
  if (text.length <= 14 && !/\s/.test(text)) return CATEGORIES["pkm-places"];
  return CATEGORIES["pkm-ui"];
}

export function categorizePkmEntry(entry: PkmCategoryEntry): string {
  return categorizePkmLine(entry.original, pkmKindOf(entry.msbtFile)).id;
}

/** The categories actually present in the loaded entries, in a fixed order. */
export function buildPkmCategories(entries: PkmCategoryEntry[]): PkmCategory[] {
  const present = new Set(entries.map((e) => categorizePkmEntry(e)));
  return ORDER.filter((id) => present.has(id)).map((id) => CATEGORIES[id]);
}
