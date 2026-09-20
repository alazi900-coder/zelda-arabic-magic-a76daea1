import type { ExtractedEntry, FileCategory } from "@/components/editor/types";

/**
 * 9th Dawn Remake's own export already names each row's section — 35 of
 * them, measured on the 3,704-entry file — so unlike Crashlands this never
 * has to guess a bucket from an id string. Every section below is mapped by
 * name; the fallback exists only as a safety net if a future export adds one
 * this list does not yet know.
 */
export const NINTHDAWN_CATEGORIES: FileCategory[] = [
  { id: "nd-dialogue", label: "الحوار والأدب", emoji: "…", icon: "MessageCircle", color: "text-violet-400" },
  { id: "nd-quests", label: "المهام والأهداف", emoji: "✓", icon: "ListChecks", color: "text-emerald-400" },
  { id: "nd-items", label: "العناصر والمكافآت والصناعة", emoji: "◈", icon: "Package", color: "text-amber-400" },
  { id: "nd-combat", label: "المهارات والقتال", emoji: "✦", icon: "Swords", color: "text-rose-400" },
  { id: "nd-world", label: "الشخصيات والمخلوقات والأماكن", emoji: "◆", icon: "Users", color: "text-cyan-400" },
  { id: "nd-cardgame", label: "لعبة الورق", emoji: "♦", icon: "Layers", color: "text-fuchsia-400" },
  { id: "nd-menu", label: "القوائم والواجهة والنظام", emoji: "▤", icon: "Monitor", color: "text-sky-400" },
  { id: "nd-other", label: "نصوص أخرى", emoji: "•", icon: "FileText", color: "text-zinc-400" },
];

const SECTION_TO_CATEGORY: Record<string, string> = {
  Dialogue: "nd-dialogue",
  Literature: "nd-dialogue",
  Quest: "nd-quests",
  DB_Item_Names: "nd-items",
  DB_Item_Types: "nd-items",
  DB_VS_Item: "nd-items",
  DB_Rewards: "nd-items",
  DB_CG_Relic: "nd-items",
  Crafting: "nd-items",
  Crafting_RecipeType: "nd-items",
  DB_Ability: "nd-combat",
  DB_Skills: "nd-combat",
  DB_StatusEffect: "nd-combat",
  Buffs: "nd-combat",
  DB_Attribute: "nd-combat",
  DB_Element: "nd-combat",
  DB_EquipSlots: "nd-combat",
  DB_Character: "nd-world",
  DB_Entity: "nd-world",
  DB_Places: "nd-world",
  DB_CG_Entity: "nd-world",
  DB_VS_Entity: "nd-world",
  Survivor: "nd-world",
  CardGame: "nd-cardgame",
  CardGame_Actions: "nd-cardgame",
  DB_CG_Status: "nd-cardgame",
  DB_CG_Map: "nd-cardgame",
  Generic: "nd-menu",
  MainMenu: "nd-menu",
  PlayerMenu: "nd-menu",
  Network: "nd-menu",
  Errors: "nd-menu",
  Actions: "nd-menu",
  Interact: "nd-menu",
  Death: "nd-menu",
};

export function categorizeNinthDawnEntry(entry: ExtractedEntry): string {
  return SECTION_TO_CATEGORY[entry.ninthDawnSection ?? ""] ?? "nd-other";
}
