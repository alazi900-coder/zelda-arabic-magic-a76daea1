/**
 * Bridge between an Inazuma Eleven cartridge and the shared translation editor.
 *
 * Reading gives the editor one row per translatable line; building writes the
 * translations back, patches the Arabic glyphs into the three NFTR fonts, and
 * hands back a playable `.nds`.
 *
 * Two things are refused rather than written half-right:
 *  • a line that lost one of the engine's own VALUE tokens (`\f`, `%1F`, `%d`,
 *    `%s`) -- the missing one is a blank or a wrong box the player cannot
 *    explain. Losing a `\n` is not refused: it is a wrapping problem, the
 *    same as in every other game here, not a hole in the sentence.
 *  • a fixed-slot description longer than the 128 bytes its slot holds
 *
 * A forced build (`{ force: true }`) writes those lines anyway, each the least
 * damaging way it can: the lost token is simply absent, a character the font
 * cannot draw is dropped, and an overlong line loses words off its end until
 * it fits -- never bytes past its slot, which are the next line's.
 *
 * The engine stores its line break as the two characters `\` and `n`, not as
 * a real newline byte -- but the editor converts at exactly this module's
 * boundary (`extractInazumaEntries` in, `buildInazumaRom` out) so every tool
 * elsewhere in the editor (line counting, the line-rebalance button, the
 * deep-scan split warning) sees an ordinary real newline, the same as it
 * would for any other game. `\f`, the page break, is left as its literal two
 * characters throughout: it marks a whole new dialogue box, not a wrap point,
 * so the shared line tools must not treat it as one.
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

/** ROM's literal `\n` (the two characters `\` and `n`) → a real editor newline. */
function toEditorText(text: string): string {
  return text.replace(/\\n/g, "\n");
}

/** Reverses `toEditorText`: a real newline → the ROM's literal `\n`. */
function toRomText(text: string): string {
  return text.replace(/\n/g, "\\n");
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
      original: toEditorText(row.text),
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
 * reads of the same ROM, so re-opening a cartridge never drops work. A
 * translation saved before the editor held this cartridge's line break as a
 * real newline -- typed by hand, or inserted by the old repair button -- may
 * still carry the literal `\n`; `toEditorText` is a no-op on anything that
 * does not, so this is safe to run over every saved line unconditionally.
 */
export function restoreInazumaTranslations(
  entries: ExtractedEntry[],
  saved: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of entries) {
    const key = `${e.msbtFile}:${e.index}`;
    if (saved[key] !== undefined) out[key] = toEditorText(saved[key]);
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
  /** Forced build only: lines written although an engine token went missing. */
  forcedTags: string[];
  /** Forced build only: lines that lost words off their end to fit their slot. */
  cut: string[];
}

export interface InazumaBuildOptions {
  /** Write every translated line, repaired as far as it can be, instead of refusing it. */
  force?: boolean;
}

export interface InazumaLineResult {
  /** The bytes to write, or null when the line is refused and keeps its English. */
  encoded: string | null;
  brokenTag: boolean;
  tooLong: boolean;
  /** Presentation forms the font has no drawing for. */
  missing: string[];
  /** Words taken off the end so the line fits its slot (forced build only). */
  cutWords: number;
}

function encodeLine(translation: string): { text: string; missing: string[] } {
  return encodeInazumaArabicText(processArabicText(translation));
}

/**
 * One translated line, checked and encoded -- or, in a forced build, repaired.
 *
 * An overlong line is cut in its logical order, before shaping reverses it for
 * this engine: cutting the encoded bytes instead would take the words off the
 * start of the Arabic sentence, not its end. Words come off one at a time, the
 * `\n` between lines counting as a word gap, so what is left is still whole
 * words.
 */
export function prepareInazumaLine(
  original: string,
  translation: string,
  limit: number | undefined,
  force = false
): InazumaLineResult {
  const brokenTag = !validateInazumaTags(original, translation).valid;
  const first = encodeLine(translation);
  const fits = (t: string) => limit === undefined || t.length + 1 <= limit;

  if (!force) {
    const refusal = { encoded: null, brokenTag, missing: first.missing, cutWords: 0 };
    if (brokenTag || first.missing.length > 0) return { ...refusal, tooLong: false };
    if (!fits(first.text)) return { ...refusal, tooLong: true };
    return { encoded: first.text, brokenTag, tooLong: false, missing: first.missing, cutWords: 0 };
  }

  // Shortening can change which form the new last letter takes, so every
  // re-encode may name a form the first one did not.
  const absent = new Set(first.missing);
  const drop = (t: string) => [...t].filter((ch) => !absent.has(ch)).join("");
  let text = drop(first.text);
  let cutWords = 0;
  const parts = translation.split(/(\s+|\\n)/);
  while (!fits(text) && parts.length > 1) {
    parts.pop(); // the last word
    parts.pop(); // and the gap before it
    cutWords++;
    const next = encodeLine(parts.join(""));
    for (const ch of next.missing) absent.add(ch);
    text = drop(next.text);
  }
  const missing = [...absent];
  if (!fits(text) || text.trim() === "") return { encoded: null, brokenTag, tooLong: true, missing, cutWords: 0 };
  return { encoded: text, brokenTag, tooLong: false, missing, cutWords };
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
  translations: Record<string, string>,
  options: InazumaBuildOptions = {}
): InazumaBuildResult {
  const rows = readInazumaText(rom);
  const brokenTags: string[] = [];
  const tooLong: string[] = [];
  const missing = new Set<string>();
  const forcedTags: string[] = [];
  const cut: string[] = [];
  let translatedLines = 0;

  const edited = rows.map((row) => {
    const key = `${entryFile(row)}:${entryIndex(row)}`;
    const editorTranslation = translations[key];
    if (!editorTranslation || !editorTranslation.trim()) return row;
    if (!isInazumaTranslatable(row.text)) return row;

    // The editor holds this line break as a real newline; the cartridge wants
    // its own literal `\` + `n`, which is what `row.text` (read fresh from the
    // ROM, never converted) is about to be checked and written against.
    const translation = toRomText(editorTranslation);

    // A token the engine fills in is not decoration: losing one leaves a hole
    // in the sentence with nothing on screen to explain it. A missing `\n` is
    // not one of these any more -- it is a wrapping problem the same as in
    // every other game, not refused here, just reported to the translator by
    // the deep-scan panel.
    const line = prepareInazumaLine(row.text, translation, row.limit, options.force);
    for (const ch of line.missing) missing.add(ch);
    if (line.encoded === null) {
      (line.tooLong ? tooLong : brokenTags).push(key);
      return row;
    }
    if (line.brokenTag) forcedTags.push(key);
    if (line.cutWords > 0) cut.push(key);
    const encoded = line.encoded;

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
    forcedTags,
    cut,
  };
}
