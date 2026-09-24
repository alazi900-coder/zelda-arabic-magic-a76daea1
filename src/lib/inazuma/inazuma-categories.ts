import type { ExtractedEntry, FileCategory } from "@/components/editor/types";

/**
 * The five places this cartridge keeps text, as the editor's filter shows
 * them. They are the file the line came from, not a guess at its subject:
 * `evet` is the event script (story cutscenes), `mcht` the match script
 * (in-game commentary and player banter during football matches -- "mcht"
 * is short for "match", not "menu"; 88% of its lines end in punctuation
 * like dialogue does, and its content is lines like "Hey, spikeyhead!
 * We'll show you how to play our way."), `unitbase.STR` the fixed-slot
 * table of player descriptions, `item.STR` the item shop's descriptions,
 * `command.STR` the special-move names shown on the tactics screen,
 * `movie` the subtitles of the cutscene videos, and the fixed-field tables
 * of inazuma-rom.ts: player names (full and short, and again in the scouting
 * search), item and move names, the in-game blog, the mini-games'
 * instructions, the short titles and names (clubs, pitches and the movie
 * list among them), the friendship events, the match rules and win
 * conditions, and the menus' and system messages built into the ARM9.
 */
export const INAZUMA_CATEGORIES: FileCategory[] = [
  { id: "iz-dialogue", label: "حوارات القصة", emoji: "…", icon: "MessageCircle", color: "text-violet-400" },
  { id: "iz-match", label: "تعليقات المباراة", emoji: "⚽", icon: "Volleyball", color: "text-sky-400" },
  { id: "iz-players", label: "أوصاف اللاعبين", emoji: "✦", icon: "Users", color: "text-emerald-400" },
  { id: "iz-items", label: "أوصاف الأغراض", emoji: "🎒", icon: "Backpack", color: "text-amber-400" },
  { id: "iz-commands", label: "أسماء المهارات", emoji: "★", icon: "Sparkles", color: "text-rose-400" },
  { id: "iz-movie", label: "ترجمات المشاهد السينمائية", emoji: "🎬", icon: "Film", color: "text-orange-400" },
  { id: "iz-names", label: "أسماء اللاعبين", emoji: "👤", icon: "Users", color: "text-teal-400" },
  { id: "iz-search", label: "أسماء شاشة البحث عن اللاعبين", emoji: "🔎", icon: "Target", color: "text-cyan-400" },
  { id: "iz-itemnames", label: "أسماء الأغراض والحركات", emoji: "💎", icon: "Gem", color: "text-yellow-400" },
  { id: "iz-blog", label: "رسائل المدوّنة", emoji: "📝", icon: "BookText", color: "text-pink-400" },
  { id: "iz-minigames", label: "شرح الألعاب المصغّرة", emoji: "🎮", icon: "Gamepad2", color: "text-lime-400" },
  { id: "iz-titles", label: "ألقاب ومدارس وأماكن وصيحات", emoji: "🏷️", icon: "MapPin", color: "text-indigo-400" },
  { id: "iz-events", label: "أحداث العلاقات", emoji: "🤝", icon: "Users", color: "text-fuchsia-400" },
  { id: "iz-rules", label: "قواعد وشروط المباريات", emoji: "📋", icon: "ScrollText", color: "text-red-400" },
  { id: "iz-system", label: "رسائل القوائم والنظام", emoji: "⚙️", icon: "Settings", color: "text-slate-400" },
  { id: "iz-other", label: "نصوص أخرى", emoji: "•", icon: "FileText", color: "text-zinc-400" },
];

/** The sources added with the fixed-field tables, by exact name. */
const FIELD_CATEGORY: Record<string, string> = {
  pname: "iz-names",
  pshort: "iz-names",
  skey: "iz-search",
  sname: "iz-search",
  iname: "iz-itemnames",
  blogt: "iz-blog",
  blogp: "iz-blog",
  blogr: "iz-blog",
  games: "iz-minigames",
  rpgtitle: "iz-titles",
  teamtitle: "iz-titles",
  school: "iz-titles",
  mapname: "iz-titles",
  shout: "iz-titles",
  club: "iz-titles",
  pitch: "iz-titles",
  movienum: "iz-titles",
  movietitle: "iz-titles",
  event: "iz-events",
  clear: "iz-rules",
  rule: "iz-rules",
  sys: "iz-system",
};

export function categorizeInazumaEntry(entry: ExtractedEntry): string {
  const file = entry.msbtFile;
  if (file.startsWith("inazuma/evet")) return "iz-dialogue";
  if (file.startsWith("inazuma/mcht")) return "iz-match";
  if (file.startsWith("inazuma/unitbase")) return "iz-players";
  if (file.startsWith("inazuma/item")) return "iz-items";
  if (file.startsWith("inazuma/command")) return "iz-commands";
  if (file.startsWith("inazuma/movie")) return "iz-movie";
  return FIELD_CATEGORY[file.replace(/^inazuma\//, "")] ?? "iz-other";
}
