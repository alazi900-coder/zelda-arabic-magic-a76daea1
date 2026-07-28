/**
 * Bridge between the Wolfenstein RPG string table (wolf-strings.ts) and the
 * shared translation editor (`/editor`). Turns every string in the shipped
 * banks into an `ExtractedEntry`, and rebuilds a translated `.ipa` from the
 * editor's translations.
 *
 * Entry identity: msbtFile = `wolf_b<bank>_s<section>`, index = the string's
 * position inside that section. Both come straight from the index file, so a
 * key stays valid for any copy of the game.
 *
 * The editor holds normal logical Arabic. The shaping into presentation forms,
 * the right-to-left reversal and the mapping onto the font's slots all happen
 * here at build time (wolf-charmap.ts) — the same split the other games use,
 * so what the translator reads is always plain Arabic.
 */

import type { ExtractedEntry } from "@/components/editor/types";
import {
  parseWolfStrings,
  buildWolfStrings,
  listWolfEntries,
  applyWolfEntries,
  type WolfStringTable,
} from "./wolf-strings";
import { encodeArabicForWolf } from "./wolf-charmap";
import { openIpa, readPackagesFile, replaceIpaEntries } from "./wolf-ipa";

export const WOLF_BUFFER_KEY = "wolfensteinSourceBuffer";
export const WOLF_FONTS_KEY = "wolfensteinArabicFonts";
export const WOLF_SOURCE_GAME = "wolfenstein";

/** The banks that ship in the iOS build; 2..7 point at absent language files. */
const BANKS = [0, 1];

export const WOLF_FONT_FILES = [
  "Font.bmp",
  "Font_16p_Dark.bmp",
  "Font_16p_Light.bmp",
  "Font_18p_Light.bmp",
  "WarFont.bmp",
] as const;

export function wolfEntryFile(bank: number, section: number): string {
  return `wolf_b${bank}_s${section}`;
}

/** `wolf_b0_s3` -> { bank: 0, section: 3 }, or null for anything else. */
export function parseWolfEntryFile(file: string): { bank: number; section: number } | null {
  const m = /^wolf_b(\d+)_s(\d+)$/.exec(file);
  return m ? { bank: Number(m[1]), section: Number(m[2]) } : null;
}

const LETTER = /\p{L}/u;
/** `|` is the engine's line break and `%01` a runtime value, neither is text. */
const NON_TEXT = /\||%\d*/g;

/**
 * A string is worth translating only if something remains once the engine's
 * own markup is stripped. That leaves out the many entries holding nothing but
 * a placeholder or a separator, which would otherwise pad the editor with rows
 * a translator must skip one by one.
 */
export function isTranslatable(text: string): boolean {
  return LETTER.test(text.replace(NON_TEXT, ""));
}

function preview(text: string): string {
  const t = text.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 57) + "…" : t;
}

export interface WolfExtractResult {
  entries: ExtractedEntry[];
  /** Every string in the banks, translatable or not. */
  totalStrings: number;
  sectionCount: number;
}

async function readTable(ipaBytes: Uint8Array): Promise<WolfStringTable> {
  const ipa = await openIpa(ipaBytes);
  const idx = await readPackagesFile(ipa, "strings.idx");
  const banks = new Map<number, Uint8Array>();
  for (const b of BANKS) {
    banks.set(b, await readPackagesFile(ipa, `strings0${b}.bin`));
  }
  return parseWolfStrings(idx, banks);
}

export async function extractWolfEntries(ipaBytes: Uint8Array): Promise<WolfExtractResult> {
  const table = await readTable(ipaBytes);
  const all = listWolfEntries(table);
  const entries: ExtractedEntry[] = [];
  const sections = new Set<string>();
  for (const e of all) {
    sections.add(`${e.bank}/${e.section}`);
    if (!isTranslatable(e.text)) continue;
    entries.push({
      msbtFile: wolfEntryFile(e.bank, e.section),
      index: e.index,
      label: preview(e.text),
      original: e.text,
      // No per-string limit exists: strings are NUL-terminated and the file is
      // rebuilt around them. The real ceiling is the 64 KiB bank, checked once
      // at build time where the whole bank is known.
      maxBytes: 0x7fff,
    });
  }
  return { entries, totalStrings: all.length, sectionCount: sections.size };
}

export interface WolfBuildOk {
  ipa: Uint8Array;
  translatedLines: number;
  /** Characters with no slot in the 144-cell font, for reporting. */
  unmapped: string[];
  bankUsage: { bank: number; bytes: number; limit: number }[];
  fontsIncluded: number;
}
export interface WolfBuildError {
  error: string;
}

/**
 * Rebuild a translated `.ipa`. `translations` is keyed `<msbtFile>:<index>`.
 *
 * `fonts` are the Arabic font bitmaps made by the font tool. They are optional
 * only so that a text-only rebuild is possible; without them the game draws
 * Arabic bytes with its original Latin glyphs and nothing is readable, so the
 * caller is expected to warn.
 */
export async function buildWolfIpa(
  ipaBytes: Uint8Array,
  translations: Record<string, string>,
  fonts?: Record<string, Uint8Array>
): Promise<WolfBuildOk | WolfBuildError> {
  let table: WolfStringTable;
  try {
    table = await readTable(ipaBytes);
  } catch (err) {
    return { error: `تعذّرت قراءة نصوص اللعبة: ${(err as Error).message}` };
  }

  const unmapped = new Set<string>();
  let translatedLines = 0;
  const edited = listWolfEntries(table).map((e) => {
    const value = translations[`${wolfEntryFile(e.bank, e.section)}:${e.index}`];
    if (!value) return e;
    const encoded = encodeArabicForWolf(value);
    encoded.unmapped.forEach((c) => unmapped.add(c));
    translatedLines++;
    return { ...e, text: encoded.text };
  });
  if (translatedLines === 0) {
    return { error: "لا توجد ترجمات محفوظة لبنائها" };
  }

  let rebuilt: ReturnType<typeof buildWolfStrings>;
  try {
    rebuilt = buildWolfStrings(applyWolfEntries(table, edited));
  } catch (err) {
    return { error: (err as Error).message };
  }

  const replacements = new Map<string, Uint8Array>();
  replacements.set("strings.idx", rebuilt.idx);
  for (const [bank, bytes] of rebuilt.banks) {
    replacements.set(`strings0${bank}.bin`, bytes);
  }
  let fontsIncluded = 0;
  for (const name of WOLF_FONT_FILES) {
    const data = fonts?.[name];
    if (data) {
      replacements.set(name, data);
      fontsIncluded++;
    }
  }

  let ipa: Uint8Array;
  try {
    ipa = await replaceIpaEntries(ipaBytes, replacements);
  } catch (err) {
    return { error: `تعذّر بناء ملف .ipa: ${(err as Error).message}` };
  }

  return {
    ipa,
    translatedLines,
    unmapped: [...unmapped],
    bankUsage: [...rebuilt.banks].map(([bank, bytes]) => ({ bank, bytes: bytes.length, limit: 0xffff })),
    fontsIncluded,
  };
}
