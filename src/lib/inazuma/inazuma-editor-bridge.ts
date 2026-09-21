/**
 * Bridge between an Inazuma Eleven cartridge and the shared translation editor.
 *
 * Reading gives the editor one row per translatable line; building writes the
 * translations back, patches the Arabic glyphs into the three NFTR fonts, and
 * hands back a playable `.nds`.
 *
 * Two things are refused rather than written half-right:
 *  • a line that lost one of the engine's own tokens (`\n`, `\f`, `%1F`, `%d`,
 *    `%s`) -- the missing one is a blank or a run-on the player cannot explain
 *  • a fixed-slot description longer than the 128 bytes its slot holds
 *
 * The editor holds ordinary logical Arabic. Shaping into the presentation
 * forms the patched font carries, and reversing into the visual order this
 * engine draws in, both happen here at build time.
 */
import { findNdsFile, writeNdsFile } from "@/lib/nds/nds-rom";
import { processArabicText } from "@/lib/arabic-processing";
import type { ExtractedEntry } from "@/components/editor/types";
import { readInazumaText, writeInazumaText, type InazumaTextRow } from "./inazuma-rom";
import { patchInazumaFont12, patchInazumaFont8, encodeInazumaArabicText } from "./inazuma-arabic-font";
import { isInazumaTranslatable, validateInazumaTags } from "./inazuma-tags";

export const INAZUMA_BUFFER_KEY = "inazumaSourceBuffer";
export const INAZUMA_SOURCE_GAME = "inazuma";
export const INAZUMA_FILE_PREFIX = "inazuma/";
export const INAZUMA_FILE_RE = /^inazuma\//;

/** The two 11x12 fonts and the one 7x8 font every screen draws from. */
const FONT12_PATHS = ["data_iz/font/FONT12.NFTR", "data_iz/font/FONT12N.NFTR"];
const FONT8_PATH = "data_iz/font/FONT8.NFTR";

export function looksLikeInazumaRom(rom: Uint8Array): boolean {
  return findNdsFile(rom, "data_iz/script/en/evet.pkh") !== null;
}

/** `inazuma/<source>/<entry>:<key>` -- stable across reads of the same ROM. */
function entryFile(row: InazumaTextRow): string {
  return `${INAZUMA_FILE_PREFIX}${row.source}`;
}

function entryIndex(row: InazumaTextRow): number {
  // `key` is -1 for a fixed slot, which is addressed by its slot number alone.
  return row.key < 0 ? row.entry : row.entry * 100000 + row.key;
}

function preview(text: string): string {
  const t = text.replace(/\\n|\\f/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

export interface InazumaExtractResult {
  entries: ExtractedEntry[];
  /** Lines left out because they are untranslated Japanese, not English. */
  japanese: number;
  total: number;
}

export function extractInazumaEntries(rom: Uint8Array): InazumaExtractResult {
  const rows = readInazumaText(rom);
  const entries: ExtractedEntry[] = [];
  let japanese = 0;

  for (const row of rows) {
    if (!isInazumaTranslatable(row.text)) {
      if (row.text.trim().length > 0) japanese++;
      continue;
    }
    entries.push({
      msbtFile: entryFile(row),
      index: entryIndex(row),
      label: preview(row.text),
      original: row.text,
      // A fixed slot is bounded by its own 128 bytes; a packed line is not,
      // because its archive is rebuilt around whatever it now holds.
      ...(row.limit !== undefined ? { maxBytes: row.limit - 1 } : {}),
    });
  }

  return { entries, japanese, total: rows.length };
}

/**
 * Carries saved translations onto a freshly read set of entries.
 *
 * A line's identity is its file and its index, and neither moves between
 * reads of the same ROM, so re-opening a cartridge never drops work.
 */
export function restoreInazumaTranslations(
  entries: ExtractedEntry[],
  saved: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of entries) {
    const key = `${e.msbtFile}:${e.index}`;
    if (saved[key] !== undefined) out[key] = saved[key];
  }
  return out;
}

export interface InazumaBuildResult {
  rom: Uint8Array;
  translatedLines: number;
  /** Lines refused because an engine token went missing. */
  brokenTags: string[];
  /** Lines refused because they exceed their fixed slot. */
  tooLong: string[];
  /** Presentation forms with no glyph in the patched font, named once each. */
  missingGlyphs: string[];
  warnings: string[];
}

/** Patches the Arabic glyphs into all three fonts, leaving every other glyph as it was. */
export function patchInazumaFonts(rom: Uint8Array): Uint8Array {
  let out = rom;
  for (const path of FONT12_PATHS) {
    const file = findNdsFile(out, path);
    if (!file) throw new Error(`الروم لا يحتوي على ${path}`);
    out = writeNdsFile(out, file, patchInazumaFont12(out.subarray(file.start, file.end)));
  }
  const font8 = findNdsFile(out, FONT8_PATH);
  if (!font8) throw new Error(`الروم لا يحتوي على ${FONT8_PATH}`);
  out = writeNdsFile(out, font8, patchInazumaFont8(out.subarray(font8.start, font8.end)));
  return out;
}

export function buildInazumaRom(
  rom: Uint8Array,
  translations: Record<string, string>
): InazumaBuildResult {
  const rows = readInazumaText(rom);
  const brokenTags: string[] = [];
  const tooLong: string[] = [];
  const missing = new Set<string>();
  let translatedLines = 0;

  const edited = rows.map((row) => {
    const key = `${entryFile(row)}:${entryIndex(row)}`;
    const translation = translations[key];
    if (!translation || !translation.trim()) return row;
    if (!isInazumaTranslatable(row.text)) return row;

    // A token the engine fills in is not decoration: losing one leaves a hole
    // in the sentence with nothing on screen to explain it.
    const check = validateInazumaTags(row.text, translation);
    if (!check.valid) {
      brokenTags.push(key);
      return row;
    }

    const { text: encoded, missing: absent } = encodeInazumaArabicText(processArabicText(translation));
    for (const ch of absent) missing.add(ch);
    if (absent.length > 0) {
      brokenTags.push(key);
      return row;
    }

    if (row.limit !== undefined && encoded.length + 1 > row.limit) {
      tooLong.push(key);
      return row;
    }

    translatedLines++;
    return { ...row, text: encoded };
  });

  const written = writeInazumaText(patchInazumaFonts(rom), edited);
  return {
    rom: written.rom,
    translatedLines,
    brokenTags,
    tooLong,
    missingGlyphs: [...missing],
    warnings: written.warnings,
  };
}
