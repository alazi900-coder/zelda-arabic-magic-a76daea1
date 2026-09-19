import type { ExtractedEntry, FileCategory } from "@/components/editor/types";
import { isSteinsGateTranslatable } from "./steinsgate-tags";
export type SteinsGateCategory = FileCategory;

export const STEINSGATE_CATEGORIES: FileCategory[] = [
  { id: "sg-main-menu", label: "القوائم الرئيسية", emoji: "▤", icon: "Monitor", color: "text-sky-400" },
  { id: "sg-system", label: "النظام والحفظ", emoji: "⚙", icon: "Settings", color: "text-slate-400" },
  { id: "sg-dialogue", label: "حوارات القصة", emoji: "…", icon: "MessageCircle", color: "text-violet-400" },
  { id: "sg-phone", label: "الهاتف والرسائل", emoji: "☎", icon: "MessageSquare", color: "text-cyan-400" },
  { id: "sg-tips", label: "المصطلحات والتلميحات", emoji: "◈", icon: "BookOpen", color: "text-amber-400" },
  { id: "sg-endings", label: "النهايات والسجل", emoji: "✦", icon: "Clapperboard", color: "text-rose-400" },
  { id: "sg-internal", label: "معرّفات تقنية", emoji: "#", icon: "Code2", color: "text-zinc-400" },
];

export const isSteinsGateEntry = (entry: Pick<ExtractedEntry, "msbtFile">) => entry.msbtFile.startsWith("steinsgate/");

export function categorizeSteinsGateEntry(entry: ExtractedEntry): string {
  const file = entry.msbtFile.slice("steinsgate/".length).toUpperCase();
  const text = entry.original.trim();
  if (!isSteinsGateTranslatable(entry.msbtFile, text)) return "sg-internal";
  if (/^(?:DMENU|MAIN|DBG|CLRFLG)/.test(file)) {
    if (/CLRFLG/.test(file)) return "sg-endings";
    return "sg-main-menu";
  }
  if (/^(?:DATA|INIT|SHORTCUT)/.test(file)) return "sg-system";
  if (/DICT/.test(file)) return "sg-tips";
  if (/^(?:MAIL|PHONE|TIPS)/.test(file)) return "sg-phone";
  if (/^SG\d{2}_/.test(file)) return "sg-dialogue";
  return "sg-system";
}
