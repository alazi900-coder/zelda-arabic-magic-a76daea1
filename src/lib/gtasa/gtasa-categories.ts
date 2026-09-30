import type { ExtractedEntry, FileCategory } from "@/components/editor/types";

/**
 * The export gives each line its table (`MAIN`, `RIOT4`, `HEIST9`…), 127 of
 * them. `MAIN` holds 5,943 lines of menus, names, help text and street talk;
 * every other table is one mission's on-screen objectives and subtitles. The
 * split below is measured on the 17,165-entry export, not guessed.
 *
 * The table is the only thing the export says about a line, so inside `MAIN`
 * the bucket comes from the text itself (length, a button token, sentence
 * punctuation) — a heuristic, and it can put an odd line in a neighbouring
 * bucket. Nothing depends on the bucket except which filter shows the line.
 */
export const GTASA_CATEGORIES: FileCategory[] = [
  { id: "sa-missions", label: "أهداف المهام", emoji: "✓", icon: "ListChecks", color: "text-emerald-400" },
  { id: "sa-dialogue", label: "حوارات المهام", emoji: "…", icon: "MessageCircle", color: "text-orange-400" },
  { id: "sa-help", label: "المساعدة والأزرار", emoji: "?", icon: "ScrollText", color: "text-sky-400" },
  { id: "sa-messages", label: "رسائل وجمل قصيرة", emoji: "❝", icon: "Drama", color: "text-amber-400" },
  { id: "sa-names", label: "أسماء وقوائم", emoji: "◆", icon: "Users", color: "text-rose-400" },
  { id: "sa-gambling", label: "الكازينو والمراهنة", emoji: "♠", icon: "Swords", color: "text-fuchsia-400" },
  { id: "sa-internal", label: "مفاتيح وأرقام داخلية", emoji: "▣", icon: "Monitor", color: "text-slate-400" },
  { id: "sa-other", label: "نصوص أخرى", emoji: "•", icon: "FileText", color: "text-zinc-400" },
];

const PREFIX = "gtasa/";
const GAMBLING_WORDS = /\b(wager|blackjack|roulette|poker|slot machine|lottery|casino|bet)\b/i;

export function gtaSaTable(msbtFile: string): string {
  return msbtFile.startsWith(PREFIX) ? msbtFile.slice(PREFIX.length) : "";
}

export function categorizeGtaSaEntry(entry: Pick<ExtractedEntry, "msbtFile" | "original">): string {
  const table = gtaSaTable(entry.msbtFile);
  const text = entry.original;
  // `STEAL_4`, `HEIST3a`, `3`, `~1~%`: a key or a bare value, nothing to translate.
  if (/^[A-Z0-9_]+[a-z]?$/.test(text) || !/[A-Za-z]/.test(text.replace(/~[^~\n]*~/g, ""))) return "sa-internal";
  if (table.startsWith("CASIN") || GAMBLING_WORDS.test(text)) return "sa-gambling";
  if (table !== "MAIN") return text.includes("~") ? "sa-missions" : "sa-dialogue";
  if (text.includes("~widget_") || text.length > 60) return "sa-help";
  if (/[.!?,:;]/.test(text) || text.length > 28) return "sa-messages";
  return "sa-names";
}
