import type { ExtractedEntry, FileCategory } from "@/components/editor/types";

/**
 * Golden Sun's 10,722 strings are one flat, Huffman-linked table (see
 * `goldensun-rom.ts`) with no per-purpose file split the way Inazuma's
 * separate `evet`/`mcht`/`unitbase.STR` archives give it categories for
 * free. Splitting this table into "dialogue" / "menus" / "item names" would
 * need the decomp's own symbol map cross-referenced against string ids,
 * which hasn't been done yet -- so, honestly, everything sits in one
 * category for now rather than a guessed split that could be wrong.
 */
export const GOLDENSUN_CATEGORIES: FileCategory[] = [
  { id: "gs-text", label: "كل النصوص", emoji: "📜", icon: "ScrollText", color: "text-amber-400" },
];

export function categorizeGoldenSunEntry(_entry: ExtractedEntry): string {
  return "gs-text";
}
