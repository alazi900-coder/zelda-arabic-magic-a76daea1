/**
 * Deterministic Risen 1 category classification — built entirely from the
 * file's own structure (table names from FileInfoHdr, the Owner field, ID
 * prefixes). No character-name guessing: that approach left 84% of entries
 * (19,608 / 23,329) in a catch-all "other" bucket on a real strings.pak.
 *
 * Level 1 (primary categories) = source table, 100% deterministic.
 * Level 2a = Owner field, sub-filtering within the dialogue category.
 * Level 2b = ID prefix (up to the 3rd "_" segment), sub-filtering within items.
 *
 * Everything here is computed from the entries actually present at load time,
 * so it works unmodified on the old 3-table format, the new 17-table format,
 * or any future variant — an unmapped table gets its own category labeled
 * with its raw name, never lumped into a generic bucket.
 */

import type { FileCategory } from "@/components/editor/types";

/** Same shape as the shared FileCategory (icon/color stay unset — dynamic categories render via emoji). */
export type RisenCategory = FileCategory;

interface RisenCategoryEntry {
  msbtFile: string;
}

const KNOWN_TABLE_CATEGORIES: Array<{ id: string; label: string; emoji: string; tables: string[] }> = [
  { id: "risen-dialogue", label: "الحوارات", emoji: "💬", tables: ["infos.tab"] },
  { id: "risen-items", label: "الأغراض والأسلحة", emoji: "⚔️", tables: ["items.tab"] },
  { id: "risen-quests", label: "المهام", emoji: "📜", tables: ["quests.tab"] },
  { id: "risen-skills", label: "المهارات", emoji: "🎓", tables: ["skills.tab"] },
  { id: "risen-documents", label: "الوثائق والكتب", emoji: "📖", tables: ["documents.tab"] },
  { id: "risen-ui", label: "القوائم والواجهة", emoji: "🖥️", tables: ["hud.tab", "hud2.tab", "x360.tab"] },
  { id: "risen-tutorial", label: "الدروس التعليمية", emoji: "🎯", tables: ["tutorial.tab", "tutorial_c.tab"] },
  {
    id: "risen-general", label: "نصوص عامة", emoji: "📋",
    tables: ["strings.tab", "npcinfo.tab", "focus.tab", "focus_unique.tab", "storyprints.tab", "achievements.tab"],
  },
  { id: "risen-combat-comments", label: "تعليقات القتال", emoji: "🗣️", tables: ["svms.tab"] },
];

const TABLE_TO_CATEGORY = new Map<string, RisenCategory>();
for (const cat of KNOWN_TABLE_CATEGORIES) {
  for (const t of cat.tables) TABLE_TO_CATEGORY.set(t.toLowerCase(), { id: cat.id, label: cat.label, emoji: cat.emoji });
}

/** The Risen table an entry's msbtFile refers to (strips the ":stagedir" suffix, if any). */
export function risenTableFromMsbtFile(msbtFile: string): string {
  return msbtFile.endsWith(":stagedir") ? msbtFile.slice(0, -":stagedir".length) : msbtFile;
}

/**
 * Categorize by table name (Level 1). Unknown tables get their own category —
 * id derived from the table name, label = the raw table name — never a
 * generic "other" bucket.
 */
export function categorizeRisenTable(tableName: string): RisenCategory {
  const known = TABLE_TO_CATEGORY.get(tableName.toLowerCase());
  if (known) return known;
  return { id: `risen-table-${tableName.toLowerCase()}`, label: tableName, emoji: "📁" };
}

export function categorizeRisenEntry(entry: RisenCategoryEntry): string {
  return categorizeRisenTable(risenTableFromMsbtFile(entry.msbtFile)).id;
}

/** Build the list of categories actually present in the loaded entries (Level 1). */
export function buildRisenCategories(entries: RisenCategoryEntry[]): RisenCategory[] {
  const seen = new Map<string, RisenCategory>();
  for (const e of entries) {
    const cat = categorizeRisenTable(risenTableFromMsbtFile(e.msbtFile));
    if (!seen.has(cat.id)) seen.set(cat.id, cat);
  }
  return Array.from(seen.values());
}

// ============================================================================
// Level 2a — Owner sub-filter (within الحوارات / infos.tab)
// ============================================================================

export const NO_OWNER_LABEL = "بدون شخصية";

export interface OwnerCount {
  owner: string;
  count: number;
}

/** Build a descending-by-count list of distinct Owner values among dialogue entries. */
export function buildOwnerIndex(entries: Array<RisenCategoryEntry & { risenOwner?: string }>): OwnerCount[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (categorizeRisenEntry(e) !== "risen-dialogue") continue;
    const owner = e.risenOwner?.trim() || NO_OWNER_LABEL;
    counts.set(owner, (counts.get(owner) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner));
}

// ============================================================================
// Level 2b — Item ID-prefix sub-filter (within الأغراض / items.tab)
// ============================================================================

/** Known ID-prefix segments mapped to a friendly Arabic label. Checked against
 * every "_"-separated segment of the prefix, in order — first match wins. */
const ITEM_SEGMENT_LABELS: Record<string, string> = {
  "1H": "أسلحة يد واحدة",
  "2H": "أسلحة يد اثنتين",
  Armor: "دروع وملابس",
  BodyPart: "دروع وملابس",
  Bow: "أقواس",
  Crossbow: "أقواس",
  Ring: "حُلي",
  Amulet: "حُلي",
  Potion: "جرعات ونباتات",
  Plant: "جرعات ونباتات",
  Mushroom: "جرعات ونباتات",
  Gold: "متفرقات",
  Key: "متفرقات",
};

/** The item ID up to its 3rd "_"-separated segment, e.g. "ITEMDESC_It_1H_Sword" -> "ITEMDESC_It_1H". */
export function getItemIdPrefix(id: string): string {
  return id.split("_").slice(0, 3).join("_");
}

export function labelForItemPrefix(prefix: string): string {
  for (const segment of prefix.split("_")) {
    if (ITEM_SEGMENT_LABELS[segment]) return ITEM_SEGMENT_LABELS[segment];
  }
  return prefix;
}

export interface ItemPrefixCount {
  prefix: string;
  label: string;
  count: number;
}

/** Build a descending-by-count list of ID prefixes among item entries. `label` holds the raw ID (per the extractor). */
export function buildItemPrefixIndex(entries: Array<RisenCategoryEntry & { label: string }>): ItemPrefixCount[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (categorizeRisenEntry(e) !== "risen-items") continue;
    const prefix = getItemIdPrefix(e.label);
    counts.set(prefix, (counts.get(prefix) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([prefix, count]) => ({ prefix, label: labelForItemPrefix(prefix), count }))
    .sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix));
}
