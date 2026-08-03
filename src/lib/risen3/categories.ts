/**
 * Risen 3 category classification.
 *
 * The compiled `localization.p00` (GAR5/STB v5) stores only a 32-bit DJB2 hash
 * per row — the original string ID and the source `.csv` it came from are NOT
 * in the file. They are recovered from the public key map shipped with
 * `lianzifu` (nicodex/lianzifu, `bin/lianzifu-unpack.risen3.csv`), copied to
 * `public/risen3-string-keys.txt` as `hash|prefix:ID` lines. That map covers
 * 100% of the rows in the retail file, so every entry gets a real ID and a
 * deterministic category (no heuristics, no catch-all bucket).
 *
 * The category is baked into each entry at extraction time (`risen3Cat`), so
 * the editor never needs the map again after the file is processed.
 */

import type { FileCategory } from "@/components/editor/types";

export const RISEN3_KEY_MAP_URL = "/risen3-string-keys.txt";

/** loc.ini prefix -> editor category. Prefixes come from the lianzifu map. */
const PREFIX_CATEGORIES: Record<string, FileCategory> = {
  info: { id: "risen3-dialogue", label: "الحوارات", emoji: "💬" },
  infodesc: { id: "risen3-dialogue-options", label: "خيارات الحوار", emoji: "🗒️" },
  svm: { id: "risen3-svm", label: "العبارات الصوتية", emoji: "🗣️" },
  item: { id: "risen3-items", label: "الأغراض والأسلحة", emoji: "⚔️" },
  quest: { id: "risen3-quests", label: "المهام", emoji: "📜" },
  hud3: { id: "risen3-ui", label: "القوائم والواجهة", emoji: "🖥️" },
  gui_prototype: { id: "risen3-ui", label: "القوائم والواجهة", emoji: "🖥️" },
  focus: { id: "risen3-focus", label: "أسماء الأهداف", emoji: "🎯" },
  focus_unique: { id: "risen3-focus-unique", label: "أسماء فريدة", emoji: "🌟" },
  skills: { id: "risen3-skills", label: "المهارات", emoji: "🎓" },
  document: { id: "risen3-documents", label: "الوثائق والكتب", emoji: "📖" },
  storyprints: { id: "risen3-storyprints", label: "مطبوعات القصة", emoji: "📰" },
  cutscene: { id: "risen3-cutscenes", label: "المشاهد السينمائية", emoji: "🎬" },
  mapinfo: { id: "risen3-mapinfo", label: "معلومات الخريطة", emoji: "🗺️" },
  TUT: { id: "risen3-tutorial", label: "الدروس التعليمية", emoji: "🎯" },
  ACH: { id: "risen3-achievements", label: "الإنجازات", emoji: "🏆" },
  silverlink: { id: "risen3-silverlink", label: "SilverLink", emoji: "🔗" },
  cons: { id: "risen3-system", label: "نصوص النظام", emoji: "🧰" },
  default: { id: "risen3-general", label: "نصوص عامة", emoji: "📋" },
};

/** Category used when the row's hash isn't in the key map (patch/DLC strings). */
export const RISEN3_UNKNOWN_CATEGORY: FileCategory = {
  id: "risen3-unknown",
  label: "غير مصنّف",
  emoji: "❓",
};

export function categorizeRisen3Prefix(prefix: string): FileCategory {
  return PREFIX_CATEGORIES[prefix] || PREFIX_CATEGORIES[prefix.toLowerCase()] || RISEN3_UNKNOWN_CATEGORY;
}

/** All categories, in the order the filter cards should appear. */
const CATEGORY_ORDER: FileCategory[] = (() => {
  const seen = new Map<string, FileCategory>();
  for (const cat of Object.values(PREFIX_CATEGORIES)) if (!seen.has(cat.id)) seen.set(cat.id, cat);
  seen.set(RISEN3_UNKNOWN_CATEGORY.id, RISEN3_UNKNOWN_CATEGORY);
  return Array.from(seen.values());
})();

export function risen3CategoryById(id: string): FileCategory | undefined {
  return CATEGORY_ORDER.find((c) => c.id === id);
}

/** Categories actually present among the loaded entries, in canonical order. */
export function buildRisen3Categories(entries: Array<{ risen3Cat?: string }>): FileCategory[] {
  const present = new Set<string>();
  for (const e of entries) if (e.risen3Cat) present.add(e.risen3Cat);
  return CATEGORY_ORDER.filter((c) => present.has(c.id));
}

export interface Risen3KeyInfo {
  /** loc.ini prefix (source csv), e.g. "info", "item". */
  prefix: string;
  /** Original string ID, e.g. "Info_NPC_Something". */
  id: string;
}

/** hash (8 lowercase hex chars, no 0x) -> key info. */
export type Risen3KeyMap = Map<string, Risen3KeyInfo>;

let cachedMap: Risen3KeyMap | null = null;
let inflight: Promise<Risen3KeyMap> | null = null;

export function parseRisen3KeyMap(text: string): Risen3KeyMap {
  const map: Risen3KeyMap = new Map();
  for (const rawLine of text.replace(/^\uFEFF/, "").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const bar = line.indexOf("|");
    if (bar === -1) continue;
    const hash = line.slice(0, bar).toLowerCase();
    const rest = line.slice(bar + 1);
    const colon = rest.indexOf(":");
    const prefix = colon === -1 ? "default" : rest.slice(0, colon);
    const id = colon === -1 ? rest : rest.slice(colon + 1);
    map.set(hash, { prefix, id });
  }
  return map;
}

/**
 * Fetch (once) the bundled key map. Returns an empty map on failure — callers
 * fall back to hash labels and the "غير مصنّف" category instead of failing the
 * whole extraction.
 */
export async function loadRisen3KeyMap(): Promise<Risen3KeyMap> {
  if (cachedMap) return cachedMap;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(RISEN3_KEY_MAP_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cachedMap = parseRisen3KeyMap(await res.text());
    } catch (err) {
      console.warn("[risen3] failed to load string-key map:", err);
      cachedMap = new Map();
    }
    inflight = null;
    return cachedMap;
  })();
  return inflight;
}
