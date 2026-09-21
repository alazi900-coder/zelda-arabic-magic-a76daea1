import type { ExtractedEntry, FileCategory } from "@/components/editor/types";

/**
 * The three places this cartridge keeps text, as the editor's filter shows
 * them. They are the file the line came from, not a guess at its subject:
 * `evet` is the event script (story cutscenes), `mcht` the match script
 * (in-game commentary and player banter during football matches -- "mcht"
 * is short for "match", not "menu"; 88% of its lines end in punctuation
 * like dialogue does, and its content is lines like "Hey, spikeyhead!
 * We'll show you how to play our way."), and `unitbase.STR` the fixed-slot
 * table of player descriptions. None of the three holds menu or item text:
 * that lives in `item.STR` and `command.STR`, which this cartridge's
 * extraction does not read yet.
 */
export const INAZUMA_CATEGORIES: FileCategory[] = [
  { id: "iz-dialogue", label: "حوارات القصة", emoji: "…", icon: "MessageCircle", color: "text-violet-400" },
  { id: "iz-match", label: "تعليقات المباراة", emoji: "⚽", icon: "Volleyball", color: "text-sky-400" },
  { id: "iz-players", label: "أوصاف اللاعبين", emoji: "✦", icon: "Users", color: "text-emerald-400" },
  { id: "iz-other", label: "نصوص أخرى", emoji: "•", icon: "FileText", color: "text-zinc-400" },
];

export function categorizeInazumaEntry(entry: ExtractedEntry): string {
  const file = entry.msbtFile;
  if (file.startsWith("inazuma/evet")) return "iz-dialogue";
  if (file.startsWith("inazuma/mcht")) return "iz-match";
  if (file.startsWith("inazuma/unitbase")) return "iz-players";
  return "iz-other";
}
