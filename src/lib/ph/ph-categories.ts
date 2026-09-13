/**
 * Editor category cards for Phantom Hourglass.
 *
 * Each BMG file's own name is the evidence — matched against the game's own
 * course/area names in `docs/courses.md` of the zeldaret/ph decompilation
 * (e.g. `kojima` = small island, `torii` = Cannon Island, `kaitei` = Temple
 * of the Ocean King) — not something inferred from the English wording.
 */
import type { ExtractedEntry, FileCategory } from "@/components/editor/types";

export const PH_FILE_PREFIX = "ph/English/Message/";

export const PH_CATEGORIES: FileCategory[] = [
  { id: "ph-system", label: "النظام والقوائم", emoji: "⚙️", icon: "Settings", color: "text-slate-400" },
  { id: "ph-battle", label: "القتال والزعماء", emoji: "⚔️", icon: "Sword", color: "text-red-400" },
  { id: "ph-cutscenes", label: "المشاهد السينمائية", emoji: "🎬", icon: "Clapperboard", color: "text-cyan-400" },
  { id: "ph-credits", label: "الاعتمادات", emoji: "✦", icon: "BadgeInfo", color: "text-fuchsia-400" },
  { id: "ph-sea", label: "البحر والسفينة", emoji: "🌊", icon: "Ship", color: "text-blue-400" },
  { id: "ph-islands", label: "الجزر", emoji: "🏝️", icon: "MapPin", color: "text-emerald-400" },
  { id: "ph-temples", label: "المعابد والزنازين", emoji: "🗝️", icon: "Castle", color: "text-amber-400" },
  { id: "ph-misc", label: "متفرقات", emoji: "◌", icon: "LibraryBig", color: "text-indigo-400" },
];

export const isPhEntry = (entry: ExtractedEntry) => entry.msbtFile.startsWith(PH_FILE_PREFIX);

const SYSTEM = /^(?:system|mainselect|main_isl)$/;
const BATTLE = /^(?:battle|battleCommon|bossLast1|bossLast3)$/;
const SEA = /^(?:sea|ship)$/;
const ISLANDS = /^(?:kojima1|kojima2|kojima3|kojima5|torii|hidari|myou)$/;
const TEMPLES = /^(?:flame|frost|wind|power|wisdom|wisdom_dngn|brave|ghost|kaitei|kaitei_F|sennin)$/;

export function categorizePhEntry(entry: ExtractedEntry): string {
  const archive = entry.msbtFile.slice(PH_FILE_PREFIX.length).replace(/\.bmg$/, "");

  if (SYSTEM.test(archive)) return "ph-system";
  if (BATTLE.test(archive)) return "ph-battle";
  if (archive === "demo") return "ph-cutscenes";
  if (archive === "staff") return "ph-credits";
  if (SEA.test(archive)) return "ph-sea";
  if (ISLANDS.test(archive)) return "ph-islands";
  if (TEMPLES.test(archive)) return "ph-temples";
  return "ph-misc";
}
