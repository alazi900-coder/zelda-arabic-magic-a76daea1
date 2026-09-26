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
 * The space, in dialogue windows, is both 5px wide AND stretched further to
 * justify each line to the box's full width -- next to Arabic letters of
 * ~5px that opened gaps wider than a letter between every word. Same three
 * spots, same bytes, in the untouched ROM and the RTL+font patch (verified
 * against both): line measurement never moved when the patch's own new
 * functions were appended after it.
 */
function setGoldenSunSpaceWidth(rom: Uint8Array) {
  // DrawText_orig: `mov r1, #5; mov r9, r1; cmp r7, #0x20` -- the width actually drawn for 0x20.
  const drawAt = 0x18d50;
  if (rom[drawAt + 1] === 0x21 && rom[drawAt + 2] === 0x89 && rom[drawAt + 3] === 0x46 && rom[drawAt + 4] === 0x20 && rom[drawAt + 5] === 0x2f) {
    rom[drawAt] = 3;
  }
  // Func_8018850 (line-width measurement, used for wrapping and box sizing): `add r1, #5`.
  const measureAt = 0x188a2;
  if (rom[measureAt] === 0x05 && rom[measureAt + 1] === 0x31) {
    rom[measureAt] = 3;
  }
  // Same function, further down: `cmp r3, #1; bhi .L18a08` decides whether to stretch this
  // line's spaces to fill the box. Forcing the branch to fall through (a thumb nop, `mov r8, r8`)
  // takes the same path as "only one word" always -- extra width 0, no stretch.
  const justifyAt = 0x189e2;
  if (rom[justifyAt] === 0x01 && rom[justifyAt + 1] === 0x2b && rom[justifyAt + 2] === 0x10 && rom[justifyAt + 3] === 0xd8) {
    rom[justifyAt + 2] = 0xc0;
    rom[justifyAt + 3] = 0x46;
  }
}

/**
 * Builds the translated ROM by rewriting the string table with
 * `translations`. A ROM with the RTL+font patch already has the Arabic
 * font and right-to-left engine, so only the text changes and `rtl` is
 * true. An untouched ROM also gets the character limit raised and the
 * font overlaid, but reads left-to-right (`rtl` false).
 */
export function buildGoldenSunRom(rom: Uint8Array, translations: Record<string, string>): { rom: Uint8Array; rtl: boolean } {
  const layout = detectGoldenSunLayout(rom);
  if (!layout) throw new Error(GOLDENSUN_UNKNOWN_ROM_MESSAGE);
  const entries = extractGoldenSunEntries(rom, layout);
  const withText = buildGoldenSunStringTable(rom, entries, translations, layout);
  setGoldenSunSpaceWidth(withText);
  if (layout.id === "rtl") return { rom: withText, rtl: true };
  return { rom: applyGoldenSunEnginePatch(withText), rtl: false };
}
