import type { FileCategory } from "@/components/editor/types";

/**
 * Fran Bow's own export already names each row's category in Arabic — 6 of
 * them, measured on the 7,280-entry file — so unlike 9th Dawn Remake this
 * never has to guess a bucket from a context string. The label here is the
 * export's own Arabic text verbatim; ARABIC_TO_ID below is only how the
 * editor's msbtFile-based filtering (built for byte-format games) tells the
 * six apart.
 */
export const FRANBOW_CATEGORIES: FileCategory[] = [
  { id: "fb-dialogue", label: "الحوارات والسرد", emoji: "…", icon: "MessageCircle", color: "text-violet-400" },
  { id: "fb-examine", label: "فحص الأشياء والتفاعل", emoji: "◈", icon: "Search", color: "text-amber-400" },
  { id: "fb-system", label: "النظام والحفظ", emoji: "◆", icon: "Save", color: "text-cyan-400" },
  { id: "fb-ui", label: "الواجهات والأزرار", emoji: "▤", icon: "Monitor", color: "text-sky-400" },
  { id: "fb-settings", label: "الإعدادات", emoji: "⚙", icon: "Settings", color: "text-emerald-400" },
  { id: "fb-menu", label: "القائمة الرئيسية", emoji: "•", icon: "ListChecks", color: "text-fuchsia-400" },
];

export const FRANBOW_ARABIC_TO_ID: Record<string, string> = Object.fromEntries(
  FRANBOW_CATEGORIES.map((c) => [c.label, c.id])
);

export function franBowCategoryId(categoryAr: string): string {
  return FRANBOW_ARABIC_TO_ID[categoryAr] ?? "fb-dialogue";
}

/** The category id is already the msbtFile's second segment (`franbow/<id>/<n>`) — set once at import, read back here. */
export function categorizeFranBowEntry(entry: { msbtFile: string }): string {
  return entry.msbtFile.split("/")[1] ?? "fb-dialogue";
}
