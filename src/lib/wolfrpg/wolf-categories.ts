/**
 * Wolfenstein RPG category classification — mirrors mp-categories.ts:
 * deterministic, derived purely from an entry's msbtFile.
 *
 * The index file names nothing: it has banks and numbered sections. So each
 * section was named by reading what it actually holds in the shipped files,
 * not by guessing — bank 0 keeps the game-wide text (items, UI, help) and
 * bank 1 holds one section per map, each opening with that map's own name.
 *
 * Two sections are marked as not-for-translation, because translating them
 * would break something rather than localise it:
 *   - the locale marker (`English` / `en`), which the engine matches on;
 *   - the French copy of the collectible books, which is not English source.
 */

import { parseWolfEntryFile } from "./wolf-editor-bridge";

export interface WolfCategory {
  id: string;
  label: string;
  emoji: string;
}

interface WolfCategoryEntry {
  msbtFile: string;
}

/** `bank/section` -> what that section was measured to contain. */
const SECTIONS: Record<string, { label: string; emoji: string }> = {
  "0/0": { label: "الكتب والمقتنيات", emoji: "📖" },
  "0/1": { label: "تلميحات التفاعل", emoji: "💡" },
  "0/2": { label: "الأسلحة والأغراض", emoji: "🔫" },
  "0/3": { label: "صنّاع اللعبة وكيفية اللعب", emoji: "📜" },
  "0/4": { label: "الألقاب والإنجازات", emoji: "🏅" },
  "0/5": { label: "الواجهة والإحصاءات", emoji: "🖥️" },
  "0/6": { label: "المساعدة والتذكيرات", emoji: "❓" },
  "1/0": { label: "سراديب الموتى", emoji: "🗺️" },
  "1/1": { label: "الظلام", emoji: "🗺️" },
  "1/2": { label: "المجمّع", emoji: "🗺️" },
  "1/3": { label: "الطريق", emoji: "🗺️" },
  "1/4": { label: "بادربورن", emoji: "🗺️" },
  "1/5": { label: "المجاري", emoji: "🗺️" },
  "1/6": { label: "الحصن", emoji: "🗺️" },
  "1/7": { label: "هاربنجر", emoji: "🗺️" },
  "1/8": { label: "خريطة الاختبار", emoji: "🧪" },
  "1/9": { label: "علامة اللغة — لا تُترجم", emoji: "🚫" },
  "1/10": { label: "نسخة فرنسية من الكتب", emoji: "🇫🇷" },
};

export function categorizeWolfSection(msbtFile: string): WolfCategory {
  const parsed = parseWolfEntryFile(msbtFile);
  if (!parsed) return { id: `wolf-${msbtFile}`, label: msbtFile, emoji: "📁" };
  const id = `wolf-b${parsed.bank}-s${parsed.section}`;
  const known = SECTIONS[`${parsed.bank}/${parsed.section}`];
  // A section this build does not know keeps its numbers rather than borrowing
  // a name that might be wrong.
  return known
    ? { id, ...known }
    : { id, label: `الملف ${parsed.bank} — القسم ${parsed.section + 1}`, emoji: "📄" };
}

export function categorizeWolfEntry(entry: WolfCategoryEntry): string {
  return categorizeWolfSection(entry.msbtFile).id;
}

/** Build the list of categories actually present in the loaded entries. */
export function buildWolfCategories(entries: WolfCategoryEntry[]): WolfCategory[] {
  const seen = new Map<string, WolfCategory>();
  for (const e of entries) {
    const cat = categorizeWolfSection(e.msbtFile);
    if (!seen.has(cat.id)) seen.set(cat.id, cat);
  }
  return Array.from(seen.values());
}
