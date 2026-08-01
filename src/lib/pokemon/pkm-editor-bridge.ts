/**
 * Bridge between a Pokémon Ruby Destiny ROM and the shared translation editor.
 *
 * Entry identity is the line's offset in the ROM, because that is the only
 * thing the game gives us — there is no index to number lines by. `msbtFile`
 * is fixed to `pkm_rom` so the editor's per-file grouping stays out of the way
 * and the categories in pkm-categories.ts do the sorting instead.
 *
 * The editor holds normal logical Arabic. Shaping into presentation forms, the
 * right-to-left reversal and the mapping onto the font's slots all happen here
 * at build time — the same split the other games use.
 */

import type { ExtractedEntry } from "@/components/editor/types";
import { scanPkmStrings, applyPkmTranslations, canRelocatePkmString, markPointedTables, pkmLineLimit, type PkmString } from "./pkm-rom";
import { applyPkmArabicFont, hasPkmArabicFont } from "./pkm-font";
import { indexPkmPointers } from "./pkm-pointers";
import { pkmEntryFile } from "./pkm-categories";

export const PKM_BUFFER_KEY = "pokemonSourceBuffer";
export const PKM_SOURCE_GAME = "pokemon";
export { PKM_ENTRY_FILE, pkmEntryFile } from "./pkm-categories";

/** A ROM byte holds a line only if the file is a 16 MB GBA image. */
export function looksLikePkmRom(rom: Uint8Array): boolean {
  return rom.length >= 0x800000 && rom.length <= 0x2000000;
}

function preview(text: string): string {
  const t = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

export interface PkmExtractResult {
  entries: ExtractedEntry[];
  strings: PkmString[];
  /** Total bytes those lines occupy, for showing how much of the ROM is text. */
  textBytes: number;
}

/**
 * How long a relocated line may be.
 *
 * Once a line lives in free space its length is bounded by what the engine
 * will hold, not by the ROM, and that buffer's size was not measured — so this
 * is a deliberate ceiling rather than a limit read off the game. 250 bytes is
 * roughly five times the two-line box and far under any plausible buffer,
 * which keeps a runaway translation from being the thing that breaks a save.
 */
export const PKM_RELOCATED_LIMIT = 250;

export function extractPkmEntries(rom: Uint8Array): PkmExtractResult {
  const strings = scanPkmStrings(rom);
  // A line the game reaches through a pointer can be moved somewhere roomier
  // at build time, so its slot is not its limit. One that is found by index —
  // every name in a fixed-stride list — keeps the slot it was born in.
  const pointers = indexPkmPointers(rom);
  // A list whose entries are reached by pointer can have its entries moved one
  // by one; one the game counts through by index cannot.
  markPointedTables(strings, pointers);
  const entries: ExtractedEntry[] = strings.map((s) => ({
    msbtFile: pkmEntryFile(s.table?.kind),
    index: s.offset,
    label: preview(s.text),
    original: s.text,
    // Dialogue that can be moved has the ROM's limit lifted entirely; a short
    // line that can be moved reaches the measured floor; anything the game
    // finds by index keeps its slot.
    maxBytes: canRelocatePkmString(s, pointers)
      ? PKM_RELOCATED_LIMIT
      : pointers.to(s.offset).length > 0
      ? pkmLineLimit(s, pointers)
      : s.capacity - 1,
  }));
  return { entries, strings, textBytes: strings.reduce((n, s) => n + s.capacity, 0) };
}

/**
 * Carries saved translations onto a freshly scanned set of entries.
 *
 * Re-opening the same ROM must never cost the translator their work, and it
 * did: the key is `<file>:<offset>`, and when the lists were renamed —
 * `pkm_t11` became `pkm_species`, and a wider stride ceiling moved thousands
 * of lines out of `pkm_rom` — every one of those keys stopped matching, so
 * the translations were dropped without a word.
 *
 * The offset is the identity, so that is what is matched on. A key that still
 * agrees exactly wins, which keeps two entries at the same offset (there are
 * none, but nothing here relies on that) from stealing each other's text.
 */
export function restorePkmTranslations(
  entries: ExtractedEntry[],
  saved: Record<string, string>
): Record<string, string> {
  const byOffset = new Map<string, string>();
  for (const [key, value] of Object.entries(saved)) {
    if (!value) continue;
    const m = PKM_KEY_RE.exec(key);
    if (m) byOffset.set(m[1], value);
  }
  const out: Record<string, string> = {};
  for (const entry of entries) {
    const key = `${entry.msbtFile}:${entry.index}`;
    const value = saved[key] || byOffset.get(String(entry.index));
    if (value) out[key] = value;
  }
  return out;
}

export interface PkmBuildOk {
  rom: Uint8Array;
  translatedLines: number;
  tooLong: { offset: number; needed: number; capacity: number; text: string }[];
  /** Lines refused because a `{FD:xx}` tag went missing or was added. */
  brokenTags: { offset: number; missing: string[]; extra: string[]; text: string }[];
  /** Lines moved into free space because they outgrew their slot. */
  relocated: number;
  /** Free bytes left in the ROM after the move. */
  freeSpaceLeft: number;
  unmapped: string[];
  fontApplied: boolean;
}
export interface PkmBuildError {
  error: string;
}

/**
 * The offset in `<entry file>:<offset>`, for any name this tool has ever used.
 *
 * A line's identity is where it sits in the ROM; the file name in front of it
 * only says which list it belongs to, and that name changed when the lists
 * were given their real names. Reading the offset out of whatever name is
 * there keeps a session translated under the old naming buildable — matching
 * the exact name instead dropped those lines silently, which is worse than
 * refusing them.
 */
const PKM_KEY_RE = /^pkm_[a-z0-9]+:(\d+)$/;

/**
 * Rebuilds a translated ROM. `translations` is keyed `<entry file>:<offset>`.
 *
 * The Arabic font is written unless the ROM already carries it, because a ROM
 * with Arabic bytes and the original Latin glyphs prints nothing readable —
 * that mistake cost several rounds before it was understood.
 */
export function buildPkmRom(
  rom: Uint8Array,
  translations: Record<string, string>,
  options: { relocate?: boolean } = {}
): PkmBuildOk | PkmBuildError {
  if (!looksLikePkmRom(rom)) {
    return { error: "الملف لا يبدو روم GBA — تحقّق من أنك رفعت ملف ‎.gba‎ الصحيح" };
  }

  const { strings } = extractPkmEntries(rom);
  const byOffset: Record<string, string> = {};
  for (const [key, value] of Object.entries(translations)) {
    const m = PKM_KEY_RE.exec(key);
    if (m) byOffset[m[1]] = value;
  }

  const written = applyPkmTranslations(rom, strings, byOffset, { relocate: options.relocate });
  if (written.written === 0 && written.tooLong.length === 0) {
    return { error: "لا توجد ترجمات محفوظة لبنائها" };
  }

  let out = written.rom;
  const fontApplied = !hasPkmArabicFont(out);
  if (fontApplied) {
    try {
      out = applyPkmArabicFont(out);
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  return {
    rom: out,
    translatedLines: written.written,
    tooLong: written.tooLong,
    relocated: written.relocated.length,
    freeSpaceLeft: written.freeSpaceLeft,
    unmapped: written.unmapped,
    fontApplied,
  };
}
