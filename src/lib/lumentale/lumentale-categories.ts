/**
 * LumenTale category cards mirror the source-table classifier. Their ids stay
 * stable because saved prompt overrides are keyed by category id.
 */
import type { ExtractedEntry, FileCategory } from "@/components/editor/types";

export type LumenTaleCategory = FileCategory;
type LumenTaleEntry = Pick<ExtractedEntry, "msbtFile" | "label" | "risen3Cat">;

export const LUMENTALE_CATEGORIES: LumenTaleCategory[] = [
  { id: "lumentale-menu", label: "القوائم والواجهة", emoji: "🧭", icon: "Monitor", color: "text-sky-400" },
  { id: "lumentale-skills", label: "المهارات والقدرات", emoji: "⚔️", icon: "Swords", color: "text-violet-400" },
  { id: "lumentale-battle", label: "القتال", emoji: "🛡️", icon: "Shield", color: "text-red-400" },
  { id: "lumentale-quests", label: "المهام والأهداف", emoji: "🎯", icon: "Target", color: "text-amber-400" },
  { id: "lumentale-dialogue", label: "الحوارات والمشاهد", emoji: "💬", icon: "MessageCircle", color: "text-emerald-400" },
  { id: "lumentale-names", label: "الشخصيات والأسماء", emoji: "👤", icon: "Users", color: "text-cyan-400" },
  { id: "lumentale-items", label: "العناصر والمخزون", emoji: "🎒", icon: "Backpack", color: "text-orange-400" },
  { id: "lumentale-lore", label: "السجل والوصف", emoji: "📖", icon: "BookOpen", color: "text-fuchsia-400" },
  { id: "lumentale-system", label: "النظام والتعليمات", emoji: "⚙️", icon: "Settings", color: "text-slate-400" },
  { id: "lumentale-general", label: "نصوص عامة", emoji: "📄", icon: "FolderOpen", color: "text-muted-foreground" },
];

const TABLE_RULES: Array<[RegExp, string]> = [
  [/(?:SKILL|ABILITY|ART|SPELL|TALENT|PASSIVE|TECHNIQUE)/, "lumentale-skills"],
  [/(?:BATTLE|COMBAT|ENEMY|MONSTER|STATUS|DAMAGE|BUFF|DEBUFF|ELEMENT)/, "lumentale-battle"],
  [/(?:QUEST|MISSION|OBJECTIVE|TASK)/, "lumentale-quests"],
  [/(?:DIALOG|STORY|CUTSCENE|SCENARIO|CONVERSATION|MEMORY)/, "lumentale-dialogue"],
  [/(?:ANIMON.*NAME|CHARACTER|CHARA|NPC|SPEAKER|PERSON)/, "lumentale-names"],
  [/(?:ITEM|INVENTORY|EQUIP|WEAPON|ARMOR|SHOP|CURRENCY|RECIPE|CONSUMABLE)/, "lumentale-items"],
  [/(?:DESCRIPTION|LORE|JOURNAL|CODEX|ARCHIVE|HISTORY|PROFILE|BIO)/, "lumentale-lore"],
  [/(?:SYSTEM|TUTORIAL|HELP)/, "lumentale-system"],
  [/(?:MENU|UI|SETTINGS|OPTION|BUTTON|INPUT|KEYBOARD|CONTROLLER)/, "lumentale-menu"],
];

export function categorizeLumenTaleEntry(entry: LumenTaleEntry): string {
  const source = `${entry.msbtFile} ${entry.label}`.toUpperCase();
  for (const [rule, category] of TABLE_RULES) {
    if (rule.test(source)) return category;
  }
  return entry.risen3Cat?.startsWith("lumentale-") && entry.risen3Cat !== "lumentale-general"
    ? entry.risen3Cat
    : "lumentale-general";
}

export function buildLumenTaleCategories(entries: LumenTaleEntry[]): LumenTaleCategory[] {
  const present = new Set(entries.filter((entry) => entry.msbtFile.startsWith("lumentale/")).map(categorizeLumenTaleEntry));
  return LUMENTALE_CATEGORIES.filter((category) => present.has(category.id));
}

/** Compatibility export for earlier callers. */
export const lumentaleCategories = buildLumenTaleCategories;
