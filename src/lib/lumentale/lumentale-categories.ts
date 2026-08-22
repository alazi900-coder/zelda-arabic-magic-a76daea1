/**
 * LumenTale category cards mirror the source-table classifier.  Their ids are
 * deliberately stable because saved prompt overrides are keyed by category id.
 */
import type { ExtractedEntry, FileCategory } from "@/components/editor/types";

const LUMENTALE_CATEGORIES: FileCategory[] = [
  { id: "lumentale-dialogue", label: "الحوارات والذكريات", emoji: "💬" },
  { id: "lumentale-names", label: "الأسماء وAnimon", emoji: "✦" },
  { id: "lumentale-lore", label: "السجلّ والوصف القصصي", emoji: "📖" },
  { id: "lumentale-items", label: "العناصر والمعدات", emoji: "🎒" },
  { id: "lumentale-ui", label: "الواجهة والتعليمات", emoji: "⚙️" },
  { id: "lumentale-general", label: "نصوص عامة", emoji: "📝" },
];

export function categorizeLumenTaleEntry(entry: ExtractedEntry): string {
  return entry.risen3Cat?.startsWith("lumentale-") ? entry.risen3Cat : "lumentale-general";
}

export function lumentaleCategories(entries: ExtractedEntry[]): FileCategory[] {
  const present = new Set(entries.map(categorizeLumenTaleEntry));
  return LUMENTALE_CATEGORIES.filter((category) => present.has(category.id));
}
