import type { ExtractedEntry, FileCategory } from "@/components/editor/types";

export const CRASHLANDS_CATEGORIES: FileCategory[] = [
  { id: "cl-menu", label: "القوائم والواجهة", emoji: "▤", icon: "Monitor", color: "text-sky-400" },
  { id: "cl-dialogue", label: "حوارات القصة", emoji: "…", icon: "MessageCircle", color: "text-violet-400" },
  { id: "cl-quests", label: "المهام والأهداف", emoji: "✓", icon: "ListChecks", color: "text-emerald-400" },
  { id: "cl-items", label: "العناصر والوصفات", emoji: "◈", icon: "Package", color: "text-amber-400" },
  { id: "cl-creatures", label: "المخلوقات والقتال", emoji: "✦", icon: "Swords", color: "text-rose-400" },
  { id: "cl-system", label: "النظام والحساب", emoji: "⚙", icon: "Settings", color: "text-slate-400" },
  { id: "cl-other", label: "نصوص أخرى", emoji: "•", icon: "FileText", color: "text-zinc-400" },
];

export function categorizeCrashlandsEntry(entry: ExtractedEntry): string {
  const id = `${entry.crashlandsId ?? entry.label} ${entry.crashlandsSection ?? ""}`.toLowerCase();
  if (entry.crashlandsSection === "account_cloud" || /account|cloud|login|save|settings|system/.test(id)) return "cl-system";
  if (entry.crashlandsSection === "campaign" && /:(?:17|20|22)\//.test(id)) return "cl-quests";
  if (entry.crashlandsSection === "campaign") return "cl-dialogue";
  if (/tags\/(?:in|id|itn|recipe|craft)|item|loot|weapon|armor/.test(id)) return "cl-items";
  if (/tags\/(?:cn|ccn|stat|statd|statn)|creature|combat|enemy|damage/.test(id)) return "cl-creatures";
  if (/tags\/ui|menu|button|option|tutorial/.test(id) || entry.crashlandsSection === "UI") return "cl-menu";
  return "cl-other";
}
