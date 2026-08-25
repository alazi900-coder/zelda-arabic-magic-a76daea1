/** GTA IV editor category cards.
 * Design: table names are primary evidence; English wording is used only to
 * place entries in an obvious editor section when the table is the generic MAIN.
 */
import type { ExtractedEntry, FileCategory } from "@/components/editor/types";

export type GtaIvCategory = FileCategory;

export const GTAIV_CATEGORIES: GtaIvCategory[] = [
  { id: "gtaiv-menus", label: "القوائم والواجهة", emoji: "▤", icon: "Monitor", color: "text-sky-400" },
  { id: "gtaiv-controls", label: "التحكم والأوامر", emoji: "⌘", icon: "Gamepad2", color: "text-emerald-400" },
  { id: "gtaiv-gameplay", label: "اللعب والعالم", emoji: "◉", icon: "Crosshair", color: "text-lime-400" },
  { id: "gtaiv-missions", label: "المهام", emoji: "◆", icon: "Target", color: "text-amber-400" },
  { id: "gtaiv-dialogue", label: "الحوارات والمشاهد", emoji: "…", icon: "MessageCircle", color: "text-violet-400" },
  { id: "gtaiv-system", label: "النظام والحفظ", emoji: "⚙", icon: "Settings", color: "text-rose-400" },
  { id: "gtaiv-items", label: "العناصر والمركبات", emoji: "◈", icon: "Backpack", color: "text-orange-400" },
  { id: "gtaiv-media", label: "الراديو والإعلام", emoji: "♪", icon: "Clapperboard", color: "text-cyan-400" },
  { id: "gtaiv-credits", label: "الاعتمادات والأسماء", emoji: "✦", icon: "BadgeInfo", color: "text-fuchsia-400" },
  { id: "gtaiv-content", label: "نصوص العالم والمتفرقات", emoji: "◌", icon: "LibraryBig", color: "text-indigo-400" },
  { id: "gtaiv-internal", label: "معرّفات داخلية", emoji: "#", icon: "Code2", color: "text-slate-400" },
];

export const isGtaIvEntry = (entry: ExtractedEntry) => entry.msbtFile.startsWith("gtaiv/");

function isGtaIvInternalIdentifier(value: string): boolean {
  /**
   * These are cross-reference labels and timing/code payloads observed in the
   * English GXT, for example FM2_BE, GM3_A_NA and 200020. Plain visible words
   * such as REVERSE deliberately remain outside this rule.
   */
  return /^(?:[0-9]{1,}|[A-Z]{1,8}(?:[_-][A-Z0-9_]+|[0-9][A-Z0-9_]*))$/.test(value.trim());
}

export function categorizeGtaIvEntry(entry: ExtractedEntry): string {
  const table = entry.msbtFile.slice("gtaiv/".length).toLowerCase();
  const original = entry.original.trim();
  const text = original.toLowerCase();
  const haystack = `${table} ${text}`;

  // Table names are the strongest evidence. CREDIT is a single credits table;
  // the 28,449 *AUD tables are cut-scene / subtitle resources. Their content
  // often happens to contain words like vehicle or weapon, but it is dialogue.
  if (table === "credit") return "gtaiv-credits";
  if (isGtaIvInternalIdentifier(original)) return "gtaiv-internal";
  if (table.endsWith("aud") || /^~z~.+/i.test(original)) return "gtaiv-dialogue";

  if (/menu|pause|frontend|hud|map|brief|stat|setting|option/.test(haystack)) return "gtaiv-menus";
  if (/control|button|press|hold|brake|steer|aim|weapon wheel|keyboard|mouse/.test(haystack)) return "gtaiv-controls";
  if (/mission|objective|task|complete|failed|checkpoint|target/.test(haystack)) return "gtaiv-missions";
  if (/dialog|subtitle|phone|call|text message|contact|conversation/.test(haystack)) return "gtaiv-dialogue";
  if (/save|load|error|warning|network|connection|disc|storage|system/.test(haystack)) return "gtaiv-system";
  if (/weapon|vehicle|car|bike|clothes|shop|item|ammo|health|armour/.test(haystack)) return "gtaiv-items";
  if (/radio|music|station|tv|internet|website|news|media/.test(haystack)) return "gtaiv-media";
  if (table === "main") return "gtaiv-gameplay";
  return "gtaiv-content";
}
