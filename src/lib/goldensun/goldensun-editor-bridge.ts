import type { ExtractedEntry } from "@/components/editor/types";
import { extractGoldenSunEntries, buildGoldenSunStringTable, looksLikeGoldenSunRom, GoldenSunEntry } from "./goldensun-rom";
import { applyGoldenSunEnginePatch } from "./goldensun-engine-patch";

export const GOLDENSUN_SOURCE_GAME = "goldensun";
export const GOLDENSUN_BUFFER_KEY = "goldensunRomBuffer";
export const GOLDENSUN_FILE_RE = /^goldensun\//;

export { looksLikeGoldenSunRom };

function toExtractedEntry(e: GoldenSunEntry): ExtractedEntry {
  // maxBytes 0: the real limit is on the COMPRESSED size of the whole
  // rebuilt table (see buildGoldenSunStringTable), which depends on every
  // other line too and can't be checked per entry -- 0 turns off the
  // per-line "too long" flag instead of giving a false one.
  return { msbtFile: e.msbtFile, index: e.index, label: e.original.slice(0, 60), original: e.original, maxBytes: 0 };
}

export function extractGoldenSunEditorEntries(rom: Uint8Array): ExtractedEntry[] {
  return extractGoldenSunEntries(rom).map(toExtractedEntry);
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
 * Builds the translated ROM: rewrites the string table with `translations`
 * substituted in, raises the character limit, and overlays the Arabic font
 * -- everything except right-to-left display, which is not wired in yet
 * (see goldensun-engine-patch.ts). The result reads left-to-right until
 * that lands.
 */
export function buildGoldenSunRom(rom: Uint8Array, translations: Record<string, string>): Uint8Array {
  const entries = extractGoldenSunEntries(rom);
  const withText = buildGoldenSunStringTable(rom, entries, translations);
  return applyGoldenSunEnginePatch(withText);
}
