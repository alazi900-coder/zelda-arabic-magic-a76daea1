/** GTA IV editor category cards.
 * Design: table names are primary evidence; English wording is used only to
 * place entries in an obvious editor section when the table is the generic MAIN.
 */
import type { ExtractedEntry, FileCategory } from "@/components/editor/types";

export type GtaIvCategory = FileCategory;

export const GTAIV_CATEGORIES: GtaIvCategory[] = [
  { id: "gtaiv-menus", label: "القوائم والواجهة", emoji: "▤", icon: "Monitor", color: "text-sky-400" },
  { id: "gtaiv-controls", label: "اللعب والتحكم", emoji: "⌘", icon: "Gamepad2", color: "text-emerald-400" },
  { id: "gtaiv-missions", label: "المهام", emoji: "◆", icon: "Target", color: "text-amber-400" },
  { id: "gtaiv-dialogue", label: "الحوارات والهواتف", emoji: "…", icon: "MessageCircle", color: "text-violet-400" },
  { id: "gtaiv-system", label: "النظام والحفظ", emoji: "⚙", icon: "Settings", color: "text-rose-400" },
  { id: "gtaiv-items", label: "العناصر والمركبات", emoji: "◈", icon: "Backpack", color: "text-orange-400" },
  { id: "gtaiv-media", label: "الراديو والإعلام", emoji: "♪", icon: "Clapperboard", color: "text-cyan-400" },
];

export const isGtaIvEntry = (entry: ExtractedEntry) => entry.msbtFile.startsWith("gtaiv/");

export function categorizeGtaIvEntry(entry: ExtractedEntry): string {
  const table = entry.msbtFile.slice("gtaiv/".length).toLowerCase();
  const text = entry.original.toLowerCase();
  const haystack = `${table} ${text}`;
  if (/menu|pause|frontend|hud|map|brief|stat|setting|option/.test(haystack)) return "gtaiv-menus";
  if (/control|button|press|hold|brake|steer|aim|weapon wheel|keyboard|mouse/.test(haystack)) return "gtaiv-controls";
  if (/mission|objective|task|complete|failed|checkpoint|target/.test(haystack)) return "gtaiv-missions";
  if (/dialog|subtitle|phone|call|text message|contact|conversation/.test(haystack)) return "gtaiv-dialogue";
  if (/save|load|error|warning|network|connection|disc|storage|system/.test(haystack)) return "gtaiv-system";
  if (/weapon|vehicle|car|bike|clothes|shop|item|ammo|health|armour/.test(haystack)) return "gtaiv-items";
  if (/radio|music|station|tv|internet|website|news|media/.test(haystack)) return "gtaiv-media";
  return "other";
}
