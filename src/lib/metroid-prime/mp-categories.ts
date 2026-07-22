/**
 * Metroid Prime Remastered category classification — mirrors
 * src/lib/mother3/categories.ts: deterministic, based purely on an entry's
 * msbtFile (the MSBT asset's real name, e.g. "TEXT_Subtitles"), never
 * character-name guessing. An unrecognized asset name gets its own category
 * (labeled with its own id) rather than a generic "other" bucket, so a newly
 * discovered asset is filterable immediately without touching this file.
 */

export interface MetroidPrimeCategory {
  id: string;
  label: string;
  emoji: string;
}

interface MetroidPrimeCategoryEntry {
  msbtFile: string;
}

const KNOWN_ASSET_CATEGORIES: Record<string, MetroidPrimeCategory> = {
  TEXT_Subtitles: { id: "mp-subtitles", label: "ترجمة المشاهد", emoji: "🎬" },
  TEXT_Pickups: { id: "mp-pickups", label: "عناصر الالتقاط", emoji: "🎒" },
  TEXT_TutorialText: { id: "mp-tutorial", label: "النصائح والتعليمات", emoji: "💡" },
  TEXT_InGame: { id: "mp-ingame", label: "نصوص اللعب المباشر", emoji: "🎮" },
  "TEXT_Ship-S": { id: "mp-ship", label: "نظام السفينة", emoji: "🚀" },
  "TEXT_Ship-S_Credits": { id: "mp-credits", label: "قائمة صناع اللعبة", emoji: "📜" },
  TEXT_RHSsystem: { id: "mp-rhs", label: "نظام اليد اليمنى (RHS)", emoji: "⚙️" },
  TEXT_WorldNames: { id: "mp-worldnames", label: "أسماء العوالم", emoji: "🌍" },
  TEXT_MPT_FrontEnd: { id: "mp-frontend", label: "الواجهة الرئيسية", emoji: "🏠" },
};

const SCANS_CATEGORY: MetroidPrimeCategory = { id: "mp-scans", label: "نصوص المسح (Scan Visor)", emoji: "🔍" };
const AREA_NAMES_CATEGORY: MetroidPrimeCategory = { id: "mp-areanames", label: "أسماء المناطق", emoji: "🗺️" };

/** Categorize one entry's MSBT asset (Level 1, same granularity as Mother 3/Risen). */
export function categorizeMetroidPrimeTable(msbtFile: string): MetroidPrimeCategory {
  const known = KNOWN_ASSET_CATEGORIES[msbtFile];
  if (known) return known;
  if (/^TEXT_Scans/.test(msbtFile)) return SCANS_CATEGORY;
  if (/AreaNames$/.test(msbtFile)) return AREA_NAMES_CATEGORY;
  return { id: `mp-${msbtFile}`, label: msbtFile, emoji: "📁" };
}

export function categorizeMetroidPrimeEntry(entry: MetroidPrimeCategoryEntry): string {
  return categorizeMetroidPrimeTable(entry.msbtFile).id;
}

/** Build the list of categories actually present in the loaded entries. */
export function buildMetroidPrimeCategories(entries: MetroidPrimeCategoryEntry[]): MetroidPrimeCategory[] {
  const seen = new Map<string, MetroidPrimeCategory>();
  for (const e of entries) {
    const cat = categorizeMetroidPrimeTable(e.msbtFile);
    if (!seen.has(cat.id)) seen.set(cat.id, cat);
  }
  return Array.from(seen.values());
}
