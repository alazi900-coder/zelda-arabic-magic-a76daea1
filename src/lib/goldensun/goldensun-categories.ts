import type { ExtractedEntry, FileCategory } from "@/components/editor/types";

/**
 * Golden Sun's 10,722 strings are one flat, Huffman-linked table (see
 * `goldensun-rom.ts`) with no per-purpose file split the way Inazuma's
 * separate `evet`/`mcht`/`unitbase.STR` archives give it categories for
 * free, and the decomp hasn't decompiled enough of its ~1,600 map files yet
 * to cross-reference which string id belongs to which game system (a check
 * against every map file that already calls a literal id found only 31 of
 * 10,722, i.e. 0.3% -- not enough to split on).
 *
 * So this splits on what every entry's own bytes already show: which
 * control codes it carries and how long it is. Each rule is mechanical and
 * inspectable, not a guess at what the line is "for":
 *   - a `\x12` (party member name), `\x15` (move name) or `\x16` (a number)
 *     only appears in battle/shop text the engine fills in at runtime;
 *   - a line ending `\x1e` is a yes/no prompt (Func_8018038's own flag for it);
 *   - a box-ending `\x02` combined with a mid-box line break `\x03`, or
 *     just length, reads as a spoken line;
 *   - anything short with no line break reads as a name or menu word;
 *   - everything else (item/ability descriptions, HUD labels with other
 *     codes) is left in its own bucket rather than forced into one above.
 */
export const GOLDENSUN_CATEGORIES: FileCategory[] = [
  { id: "gs-dialogue", label: "حوار", emoji: "💬", icon: "MessageCircle", color: "text-violet-400" },
  { id: "gs-battle", label: "رسائل القتال والمتجر", emoji: "⚔️", icon: "Swords", color: "text-rose-400" },
  { id: "gs-prompt", label: "أسئلة نعم/لا", emoji: "❓", icon: "HelpCircle", color: "text-sky-400" },
  { id: "gs-short", label: "أسماء وكلمات قصيرة", emoji: "🏷️", icon: "Tag", color: "text-emerald-400" },
  { id: "gs-other", label: "نصوص أخرى", emoji: "•", icon: "FileText", color: "text-zinc-400" },
];

const CODE_RE = /\\x([0-9a-f]{2})/gi;

export function categorizeGoldenSunEntry(entry: ExtractedEntry): string {
  const text = entry.original;
  const codes = new Set<number>();
  let m: RegExpExecArray | null;
  CODE_RE.lastIndex = 0;
  while ((m = CODE_RE.exec(text))) codes.add(parseInt(m[1], 16));
  const visibleLen = text.replace(CODE_RE, "").length;

  if (codes.has(0x12) || codes.has(0x15) || codes.has(0x16)) return "gs-battle";
  if (codes.has(0x1e)) return "gs-prompt";
  if (codes.has(0x02) && (codes.has(0x03) || visibleLen > 18)) return "gs-dialogue";
  if (visibleLen <= 20 && !codes.has(0x03)) return "gs-short";
  return "gs-other";
}
