import type { ExtractedEntry, FileCategory } from "@/components/editor/types";

/**
 * The three places this cartridge keeps text, as the editor's filter shows
 * them. They are the file the line came from, not a guess at its subject:
 * `evet` is the event script, `mcht` the menu/system script, and
 * `unitbase.STR` the fixed-slot table of player descriptions.
 */
export const INAZUMA_CATEGORIES: FileCategory[] = [
  { id: "iz-dialogue", label: "حوارات القصة", emoji: "…", icon: "MessageCircle", color: "text-violet-400" },
  { id: "iz-menu", label: "القوائم والنظام", emoji: "▤", icon: "Monitor", color: "text-sky-400" },
  { id: "iz-players", label: "أوصاف اللاعبين", emoji: "✦", icon: "Users", color: "text-emerald-400" },
  { id: "iz-other", label: "نصوص أخرى", emoji: "•", icon: "FileText", color: "text-zinc-400" },
];

export function categorizeInazumaEntry(entry: ExtractedEntry): string {
  const file = entry.msbtFile;
  if (file.startsWith("inazuma/evet")) return "iz-dialogue";
  if (file.startsWith("inazuma/mcht")) return "iz-menu";
  if (file.startsWith("inazuma/unitbase")) return "iz-players";
  return "iz-other";
}
