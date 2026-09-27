import type { FileCategory } from "@/components/editor/types";

/**
 * The export names 30 categories of its own (`Dialogues`, `StateSpeeches`,
 * `CharacterBios`…). Seven filters group them by what the player sees; the
 * counts in the comments are the 7,990-entry export's.
 */
export const TWOM_CATEGORIES: FileCategory[] = [
  { id: "tw-dialogue", label: "الحوارات", emoji: "…", icon: "MessageCircle", color: "text-orange-400" },
  { id: "tw-speech", label: "كلام الشخصيات", emoji: "❝", icon: "Drama", color: "text-amber-400" },
  { id: "tw-characters", label: "الشخصيات والسير", emoji: "●", icon: "Users", color: "text-rose-400" },
  { id: "tw-logs", label: "السجلات والراديو", emoji: "▤", icon: "ScrollText", color: "text-sky-400" },
  { id: "tw-places", label: "الأماكن والزيارات", emoji: "⌂", icon: "MapPin", color: "text-emerald-400" },
  { id: "tw-items", label: "العناصر", emoji: "◆", icon: "Swords", color: "text-yellow-400" },
  { id: "tw-ui", label: "الواجهة والقوائم", emoji: "▣", icon: "Monitor", color: "text-slate-400" },
];

const GROUPS: Record<string, string[]> = {
  "tw-dialogue": ["Dialogues", "NPCSpeeches", "DwellerNPCSpeeches", "Traders", "SpecialSpeeches"], // 2426
  "tw-speech": ["StateSpeeches", "SpeechesCasual", "SpeechesItems", "SpeechesTemporaryBlockade", "TakingCareOf"], // 3088
  "tw-characters": ["CharacterBios", "CharacterParameters", "CharacterSkills", "Names"], // 812
  "tw-logs": ["DailyLog", "EndLog", "Radio", "Events", "GameFlow"], // 599
  "tw-places": ["LocationsTexts", "LocationDescriptions", "VisitDescriptions"], // 323
  "tw-items": ["Items"], // 227
  "tw-ui": ["UI", "Gamepad", "DLC", "Credits", "E3", "TEST", "DEBUGTEXT"], // 515
};

const SOURCE_TO_ID: Record<string, string> = Object.fromEntries(
  Object.entries(GROUPS).flatMap(([id, sources]) => sources.map((s) => [s, id]))
);

/** Any category a future export adds lands in the UI filter rather than disappearing. */
export function twomCategoryId(sourceCategory: string): string {
  return SOURCE_TO_ID[sourceCategory] ?? "tw-ui";
}

/** The category id is the msbtFile's second segment (`twom/<id>/<n>`) — set once at import, read back here. */
export function categorizeTwomEntry(entry: { msbtFile: string }): string {
  return entry.msbtFile.split("/")[1] ?? "tw-ui";
}
