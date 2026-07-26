/**
 * Bridge between the Mother 3 script engine (m3-script.ts) and the shared
 * translation editor (`/editor`). Turns the ROM's decoded script lines into
 * `ExtractedEntry[]` the editor understands, and rebuilds a patched ROM from
 * the editor's translations.
 *
 * Entry identity: msbtFile = `bank_<N>`, index = line index within the bank.
 * Only lines that contain real translatable text become entries (control-only
 * lines like `[F103]0` are skipped from the UI but always preserved on build —
 * rebuildBank re-emits every original line whose index the user didn't edit).
 *
 * Byte budget: Mother 3's space limit is per *bank* (its whole region), not per
 * line, so per-entry maxBytes is left generous and the real limit is enforced
 * at build time (rebuildBank reports the exact overflow per bank).
 */

import type { ExtractedEntry } from "@/components/editor/types";
import {
  parseBankTable,
  parseBankRegion,
  rebuildBank,
  applyRebuild,
  type M3Bank,
} from "./m3-script";
import { M3_ARABIC_FONT_B64, M3_ARABIC_WIDTHS_B64, M3_FONT_OFFSET, M3_WIDTHS_OFFSET } from "./m3-arabic-font";
import { applyRtlPatch, flipGlyphsInPlace } from "./m3-rtl-patch";
import { NAMES_TABLES, parseNamesTable, rebuildNamesTable, applyNamesRebuild } from "./m3-names-table";
import { MENU_TABLES, parseMenuTable, rebuildMenuTable, applyMenuRebuild } from "./m3-menu-table";

/** IndexedDB key holding the loaded Mother 3 ROM bytes for the build step. */
export const MOTHER3_BUFFER_KEY = "mother3SourceBuffer";
export const MOTHER3_SOURCE_GAME = "mother3";

/**
 * Largest plausible script-bank region. The real banks top out at ~159 KB; the
 * bank table also contains one bogus entry (index ~1001) whose region wrongly
 * spans ~12 MB to the ROM end and decodes to ~43k lines of pure noise. Skipping
 * any region above this cap drops that junk (≈1.7k fake entries) before it ever
 * reaches the editor, and keeps the build from decoding megabytes of garbage.
 */
const MAX_BANK_REGION = 0x40000;

const LETTER = /[A-Za-z]/;

/** A line is worth showing in the editor only if it has at least one real
 *  letter once its control-code / raw-byte tokens are stripped (lone digits/
 *  0x0X bytes are control arguments, not translatable text). */
function isTranslatable(text: string): boolean {
  const stripped = text.replace(/\[[0-9A-Fa-f]{2,4}\]/g, "").replace(/\{[0-9A-Fa-f]{2}\}/g, "");
  return LETTER.test(stripped);
}

function preview(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 57) + "…" : t;
}

export interface Mother3ExtractResult {
  entries: ExtractedEntry[];
  bankCount: number;
  lineCount: number;
}

/** Decode the whole main script into editor entries. */
export function extractMother3Entries(rom: Uint8Array): Mother3ExtractResult {
  const regions = parseBankTable(rom).filter(
    (r) => r.end - r.start > 2 && r.end - r.start <= MAX_BANK_REGION
  );
  const entries: ExtractedEntry[] = [];
  let lineCount = 0;
  let usedBanks = 0;
  // Dedup: the same line appears verbatim across many banks (≈89% duplicates).
  // Show each unique text once; the build applies its translation to every copy.
  const seen = new Set<string>();
  for (const region of regions) {
    const bank = parseBankRegion(rom, region);
    if (!bank || bank.lines.length === 0) continue;
    let bankHasText = false;
    for (const line of bank.lines) {
      lineCount++;
      if (!isTranslatable(line.text)) continue;
      bankHasText = true;
      if (seen.has(line.text)) continue;
      seen.add(line.text);
      entries.push({
        msbtFile: `bank_${bank.index}`,
        index: line.index,
        label: preview(line.text),
        original: line.text,
        maxBytes: 0x7fff, // real limit is per-bank, enforced at build
      });
    }
    if (bankHasText) usedBanks++;
  }

  // Non-script text tables (item names, etc.) — flat, unobfuscated, no dedup
  // needed (each is already a short, mostly-unique list).
  for (const spec of NAMES_TABLES) {
    for (const entry of parseNamesTable(rom, spec)) {
      if (!isTranslatable(entry.text)) continue;
      entries.push({
        msbtFile: spec.id,
        index: entry.index,
        label: preview(entry.text),
        original: entry.text,
        maxBytes: 0x7fff, // real limit is per-table, enforced at build
      });
    }
  }

  // Menu text tables (variable-length, real pointer table — see m3-menu-table.ts).
  // Entries with no decoded text (a handful of naming-screen keyboard-symbol
  // rows with glyph codes not worth mapping) are skipped, same as untranslatable ones.
  for (const spec of MENU_TABLES) {
    const table = parseMenuTable(rom, spec);
    if (!table) continue;
    for (const entry of table.entries) {
      if (entry.text == null || !isTranslatable(entry.text)) continue;
      entries.push({
        msbtFile: spec.id,
        index: entry.index,
        label: preview(entry.text),
        original: entry.text,
        maxBytes: 0x7fff, // real limit is per-table, enforced at build
      });
    }
  }

  return { entries, bankCount: usedBanks, lineCount };
}

export interface Mother3BuildOk {
  rom: Uint8Array;
  translatedLines: number;
  changedBanks: number;
  /** number of banks/tables whose edits were dropped because they overflowed (force build only) */
  skippedForOverflow?: number;
  /** number of individual lines/entries kept as ORIGINAL because their translation
   *  contained characters the game font can't encode (force build only — no
   *  characters are dropped from the translation; the whole edit is skipped) */
  skippedForEncoding?: number;
}
export interface Mother3BuildError {
  error: string;
  /** per-bank overflow details when a translated bank exceeds its region */
  overflows: { bank: number; overflowBy: number }[];
  /** true when at least one bank failed because the text contained characters
   *  the ROM font can't encode yet (e.g. Arabic before font insertion) */
  hasEncodingError?: boolean;
}

const KEY_RE = /^bank_(\d+)$/;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Insert the Arabic font (glyph-flipped for the RTL renderer) + widths and the
 *  RTL rendering patch into a ROM copy. */
function installArabicFontAndRtl(rom: Uint8Array): void {
  const font = b64ToBytes(M3_ARABIC_FONT_B64);
  const widths = b64ToBytes(M3_ARABIC_WIDTHS_B64);
  flipGlyphsInPlace(font, widths);
  rom.set(font, M3_FONT_OFFSET);
  rom.set(widths, M3_WIDTHS_OFFSET);
  applyRtlPatch(rom);
}

/**
 * Rebuild a patched, Arabic ROM from the editor's translations. Each translation
 * is applied to EVERY line that shares its original text (the editor dedups, so
 * one entry stands for all its duplicate copies across banks). The Arabic font
 * and RTL render patch are always installed. Banks with no edits keep their
 * bytes; unchanged font/patch bytes are still written so the ROM renders Arabic.
 *
 * `translations` is keyed `bank_<N>:<lineIndex>` -> Arabic text.
 */
export function buildMother3Rom(
  rom: Uint8Array,
  translations: Record<string, string>,
  opts: { force?: boolean } = {}
): Mother3BuildOk | Mother3BuildError {
  const force = !!opts.force;
  // 1) Resolve each translated representative to its original text, then map
  //    original-text -> Arabic so every duplicate line gets the same translation.
  const regions = parseBankTable(rom).filter(
    (r) => r.end - r.start > 2 && r.end - r.start <= MAX_BANK_REGION
  );
  const parsedBanks = regions
    .map((r) => parseBankRegion(rom, r))
    .filter((b): b is M3Bank => b != null && b.lines.length > 0);

  const originalByKey = new Map<string, string>();
  for (const bank of parsedBanks) {
    for (const line of bank.lines) originalByKey.set(`bank_${bank.index}:${line.index}`, line.text);
  }

  const translationByOriginal = new Map<string, string>();
  for (const [key, value] of Object.entries(translations)) {
    if (value == null || value === "") continue;
    const orig = originalByKey.get(key);
    if (orig != null) translationByOriginal.set(orig, value);
  }

  let out = new Uint8Array(rom); // work on a copy; always produce an Arabic ROM
  const overflows: { bank: number; overflowBy: number }[] = [];
  let encodingFailure = false;
  let encodingMsg = "";
  let translatedLines = 0;
  let changedBanks = 0;
  let skippedForOverflow = 0;
  let skippedForEncoding = 0;

  for (const bank of parsedBanks) {
    const edits = new Map<number, string>();
    for (const line of bank.lines) {
      const ar = translationByOriginal.get(line.text);
      if (ar != null) {
        edits.set(line.index, ar);
        translatedLines++;
      }
    }
    if (edits.size === 0) continue;
    const res = rebuildBank(out, bank, edits, { lossy: force });
    if ("error" in res) {
      if (res.overflowBy == null) {
        encodingFailure = true;
        encodingMsg = res.error;
      } else if (force) {
        // force: skip this bank's edits, keep original English, continue build
        overflows.push({ bank: bank.index, overflowBy: res.overflowBy });
        skippedForOverflow++;
      } else {
        overflows.push({ bank: bank.index, overflowBy: res.overflowBy });
      }
      continue;
    }
    out = applyRebuild(out, res) as Uint8Array<ArrayBuffer>;
    if (res.skippedEncoding) skippedForEncoding += res.skippedEncoding;
    changedBanks++;
  }

  // 2) Same pass for the flat, unobfuscated text tables (item names, etc.),
  //    keyed `<tableId>:<index>` directly (no dedup — each entry stands alone).
  for (const spec of NAMES_TABLES) {
    const tableEntries = parseNamesTable(out, spec);
    if (tableEntries.length === 0) continue;
    const edits = new Map<number, string>();
    for (const entry of tableEntries) {
      const value = translations[`${spec.id}:${entry.index}`];
      if (value != null && value !== "") {
        edits.set(entry.index, value);
        translatedLines++;
      }
    }
    if (edits.size === 0) continue;
    const res = rebuildNamesTable(out, spec, tableEntries, edits, { lossy: force });
    if ("error" in res) {
      if (res.overflowBy == null) {
        encodingFailure = true;
        encodingMsg = res.error;
      } else if (force) {
        overflows.push({ bank: -1, overflowBy: res.overflowBy });
        skippedForOverflow++;
      } else {
        overflows.push({ bank: -1, overflowBy: res.overflowBy });
      }
      continue;
    }
    out = applyNamesRebuild(out, res) as Uint8Array<ArrayBuffer>;
    changedBanks++;
  }

  // 3) Same pass for menu text tables (variable-length, real pointer table).
  for (const spec of MENU_TABLES) {
    const table = parseMenuTable(out, spec);
    if (!table || table.entries.length === 0) continue;
    const edits = new Map<number, string>();
    for (const entry of table.entries) {
      const value = translations[`${spec.id}:${entry.index}`];
      if (value != null && value !== "") {
        edits.set(entry.index, value);
        translatedLines++;
      }
    }
    if (edits.size === 0) continue;
    const res = rebuildMenuTable(out, table, edits, { lossy: force });
    if ("error" in res) {
      if (res.overflowBy == null) {
        encodingFailure = true;
        encodingMsg = res.error;
      } else if (force) {
        overflows.push({ bank: -1, overflowBy: res.overflowBy });
        skippedForOverflow++;
      } else {
        overflows.push({ bank: -1, overflowBy: res.overflowBy });
      }
      continue;
    }
    out = applyMenuRebuild(out, res) as Uint8Array<ArrayBuffer>;
    changedBanks++;
  }

  if (encodingFailure && !force) {
    return {
      error: `تعذّر ترميز بعض النص: ${encodingMsg}`,
      overflows,
      hasEncodingError: true,
    };
  }
  if (overflows.length > 0 && !force) {
    return {
      error: `${overflows.length} بنك تجاوز مساحته بعد الترجمة — قصّر النص في هذه البنوك`,
      overflows,
    };
  }

  installArabicFontAndRtl(out);
  return { rom: out, translatedLines, changedBanks, skippedForOverflow };
}

