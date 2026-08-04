/**
 * Grouping DragonSword Awakening's lines for the translator.
 *
 * The pak names its four tables, so the grouping is the table and nothing
 * else — no guessing from what the text looks like, which is the mistake the
 * Pokémon tool had to undo. A table this file does not recognise keeps its own
 * id as its category, so a pak with a fifth table is filterable the day it
 * turns up rather than falling into an "other" bucket.
 *
 * The names are the file names, and they do not describe the contents: the
 * shipped `StringQuestData_fr.table` is the 4.6 MB one holding the scenes, and
 * `StringData_fr.table` holds the reminiscences. The labels below say what is
 * really inside each, measured by reading them.
 */

const NAMES: Record<string, string> = {
  ds_stringdata: "الذكريات ورسائل النظام",
  ds_stringquestdata: "المشاهد والحوار",
  ds_stringreminiscencedata: "أسماء وعناوين",
  ds_stringscenedata: "المهامّ",
};

/** Every category a set of entries falls into, in a stable order. */
export function dsCategories(files: string[]): { id: string; label: string }[] {
  return [...new Set(files)]
    .sort()
    .map((id) => ({ id, label: NAMES[id] ?? id.replace(/^ds_/, "") }));
}

/** What to call one table on screen. */
export function dsCategoryLabel(file: string): string {
  return NAMES[file] ?? file.replace(/^ds_/, "");
}

/** True for an entry file this game owns. */
export const DS_FILE_RE = /^ds_[a-z0-9]+$/;
