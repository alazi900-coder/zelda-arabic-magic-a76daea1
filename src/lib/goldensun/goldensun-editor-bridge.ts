import type { ExtractedEntry } from "@/components/editor/types";
import {
  extractGoldenSunEntries,
  buildGoldenSunStringTable,
  detectGoldenSunLayout,
  looksLikeGoldenSunRom,
  GoldenSunEntry,
  GoldenSunLayout,
} from "./goldensun-rom";
import { applyGoldenSunEnginePatch } from "./goldensun-engine-patch";

export const GOLDENSUN_SOURCE_GAME = "goldensun";
export const GOLDENSUN_BUFFER_KEY = "goldensunRomBuffer";
export const GOLDENSUN_FILE_RE = /^goldensun\//;

export { looksLikeGoldenSunRom, detectGoldenSunLayout };
export type { GoldenSunLayout };

export const GOLDENSUN_UNKNOWN_ROM_MESSAGE =
  "روم Golden Sun غير معروف — طبّق رقعة GoldenSun-AR-RTL-FONT.ups على الروم الأمريكي الأصلي ثم ارفعه";

function toExtractedEntry(e: GoldenSunEntry): ExtractedEntry {
  // maxBytes 0: the real limit is on the COMPRESSED size of the whole
  // rebuilt table (see buildGoldenSunStringTable), which depends on every
  // other line too and can't be checked per entry -- 0 turns off the
  // per-line "too long" flag instead of giving a false one.
  return { msbtFile: e.msbtFile, index: e.index, label: e.original.slice(0, 60), original: e.original, maxBytes: 0 };
}

export function extractGoldenSunEditorEntries(rom: Uint8Array, layout: GoldenSunLayout): ExtractedEntry[] {
  return extractGoldenSunEntries(rom, layout).map(toExtractedEntry);
}

/** Restores previously-saved translations for entries that still exist (same file + index) after a fresh extraction. */
export function restoreGoldenSunTranslations(
  entries: ExtractedEntry[],
  existing: Record<string, string>
): Record<string, string> {
  const restored: Record<string, string> = {};
  for (const e of entries) {
    const key = `${e.msbtFile}:${e.index}`;
    if (existing[key]) restored[key] = existing[key];
  }
  return restored;
}

/**
 * Builds the translated ROM by rewriting the string table with
 * `translations`. A ROM with the RTL+font patch already has the Arabic
 * font and right-to-left engine, so only the text changes and `rtl` is
 * true. An untouched ROM also gets the character limit raised and the
 * font overlaid, but reads left-to-right (`rtl` false).
 */
/**
 * The space's advance width (the first u16 of font cell 0x20): 6px suits the
 * Latin letters, but next to Arabic letters of ~5px it opens a gap wider than
 * a letter between words. The font sits at 0x32224 in the untouched ROM and
 * at 0x32410 once the RTL+font patch relinked it.
 */
const GOLDENSUN_SPACE_WIDTH = 3;
function setGoldenSunSpaceWidth(rom: Uint8Array, layout: GoldenSunLayout) {
  const off = layout.id === "rtl" ? 0x32410 : 0x32224;
  rom[off] = GOLDENSUN_SPACE_WIDTH;
  rom[off + 1] = 0;
}

export function buildGoldenSunRom(rom: Uint8Array, translations: Record<string, string>): { rom: Uint8Array; rtl: boolean } {
  const layout = detectGoldenSunLayout(rom);
  if (!layout) throw new Error(GOLDENSUN_UNKNOWN_ROM_MESSAGE);
  const entries = extractGoldenSunEntries(rom, layout);
  const withText = buildGoldenSunStringTable(rom, entries, translations, layout);
  setGoldenSunSpaceWidth(withText, layout);
  if (layout.id === "rtl") return { rom: withText, rtl: true };
  return { rom: applyGoldenSunEnginePatch(withText), rtl: false };
}
