/** GTA IV integration with the shared translation editor.
 * Design: GTA IV uses `gtaiv/<TABLE>` identities; the existing shared editor
 * remains the only editor UI. This module reads source English GXT only.
 */
import type { ExtractedEntry } from "@/components/editor/types";
import {
  decodeGtaIvArabicFontUnits,
  encodeGtaIvArabicText,
  gtaIvRawUnitsToString,
  parseGtaIvGxt,
  rebuildGtaIvGxt,
} from "./gxt-format";
import { gtaIvEditorTextToRuntimeText } from "./gtaiv-line-split";

export const GTAIV_SOURCE_GAME = "gtaiv";
export const GTAIV_BUFFER_KEY = "gtaiv:american-gxt-buffer";
export const GTAIV_SOURCE_NAME_KEY = "gtaiv:american-gxt-name";

export interface GtaIvEditorImport {
  entries: ExtractedEntry[];
  tableCount: number;
}

export interface GtaIvAmericanBuild {
  buffer: ArrayBuffer;
  filename: "american.gxt";
  translatedLines: number;
}

/**
 * Style contract: the current Arabic-over-English font dedicates 96..239 to
 * Arabic presentation forms. Runtime tokens are interpreted by GTA IV rather
 * than rendered as glyphs, so their contents remain exempt. Any visible raw
 * English unit in that interval would render as Arabic art and corrupt menus.
 */
const gtaIvArabicInputUnitStart = 96;
const gtaIvArabicInputUnitEnd = 239;
const gtaIvRuntimeTokenPattern = /~[^~]+~/g;

interface GtaIvVisibleUnitConflict {
  unit: number;
  character: string;
}

function findVisibleGtaIvArabicUnitConflict(text: string): GtaIvVisibleUnitConflict | null {
  const pieces = text.split(gtaIvRuntimeTokenPattern);
  for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex += 2) {
    const piece = pieces[pieceIndex] ?? "";
    for (let index = 0; index < piece.length; index += 1) {
      const unit = piece.charCodeAt(index);
      if (unit >= gtaIvArabicInputUnitStart && unit <= gtaIvArabicInputUnitEnd) {
        return { unit, character: piece[index] ?? "" };
      }
    }
  }
  return null;
}

export function extractGtaIvEntries(buffer: ArrayBuffer): GtaIvEditorImport {
  const parsed = parseGtaIvGxt(buffer);
  const entries = parsed.tables.flatMap((table) => table.entries.map((entry) => ({
    // Table + original CRC is the stable GXT identity. Do not substitute an
    // ordinal index: the exact CRC must be preserved for a later GXT builder.
    msbtFile: `gtaiv/${table.name}`,
    index: entry.crc >>> 0,
    label: `${table.name} · 0x${(entry.crc >>> 0).toString(16).padStart(8, "0")}`,
    original: decodeGtaIvArabicFontUnits(entry.textUnits),
    // GXT size can only be measured after its Arabic glyph encoding is fixed.
    // A zero budget tells generic editor checks not to invent a byte limit.
    maxBytes: 0,
  })));
  return { entries, tableCount: parsed.tables.length };
}

function gtaIvEntryIdentity(entry: Pick<ExtractedEntry, "msbtFile" | "index">): string | null {
  if (!entry.msbtFile.startsWith("gtaiv/")) return null;
  return `${entry.msbtFile.slice("gtaiv/".length)}:${entry.index >>> 0}`;
}

/**
 * Builds only the rows changed in the shared editor. The raw source is parsed
 * again so a stale editor state can never target a different American GXT.
 */
export function buildGtaIvAmericanOutput(
  source: ArrayBuffer,
  entries: readonly ExtractedEntry[],
  translations: Readonly<Record<string, string>>,
): GtaIvAmericanBuild {
  const parsedSource = parseGtaIvGxt(source);
  const sourceByIdentity = new Map(parsedSource.tables.flatMap((table) => table.entries.map((entry) => [
    `${table.name}:${entry.crc >>> 0}`,
    { table: table.name, crc: entry.crc >>> 0, textUnits: entry.textUnits },
  ])));
  const replacements: { table: string; crc: number; textUnits: Uint16Array }[] = [];
  const translatedPresentationText = new Map<string, string>();

  for (const entry of entries) {
    const identity = gtaIvEntryIdentity(entry);
    if (!identity) continue;
    const sourceEntry = sourceByIdentity.get(identity);
    if (!sourceEntry) throw new Error("حالة المحرر لا تطابق ملف american.gxt المحفوظ. أعد استيراد المصدر الإنجليزي.");
    if (gtaIvRawUnitsToString(sourceEntry.textUnits) !== entry.original) {
      throw new Error("تم تغيير مصدر american.gxt منذ فتح المحرر. أعد استيراده قبل البناء.");
    }
    const key = `${entry.msbtFile}:${entry.index}`;
    const translation = translations[key];
    // `~n~\n` exists only to make the editor show GTA IV's explicit break as
    // a real line. Collapse it here, immediately before GXT encoding.
    const runtimeTranslation = translation ? gtaIvEditorTextToRuntimeText(translation) : translation;
    if (!runtimeTranslation || runtimeTranslation === entry.original) continue;
    const encoded = encodeGtaIvArabicText(entry.original, runtimeTranslation);
    replacements.push({ table: sourceEntry.table, crc: sourceEntry.crc, textUnits: encoded.textUnits });
    translatedPresentationText.set(`${sourceEntry.table}:${sourceEntry.crc >>> 0}`, encoded.processedText);
  }

  const replacementByIdentity = new Map(replacements.map((entry) => [`${entry.table}:${entry.crc >>> 0}`, entry.textUnits]));
  const visibleConflicts: { table: string; crc: number; unit: number; character: string }[] = [];
  for (const table of parsedSource.tables) {
    for (const entry of table.entries) {
      const identity = `${table.name}:${entry.crc >>> 0}`;
      const renderedText = translatedPresentationText.get(identity) ?? gtaIvRawUnitsToString(entry.textUnits);
      const conflict = findVisibleGtaIvArabicUnitConflict(renderedText);
      if (conflict) visibleConflicts.push({ table: table.name, crc: entry.crc >>> 0, ...conflict });
    }
  }
  if (visibleConflicts.length > 0) {
    const first = visibleConflicts[0];
    throw new Error(
      `لا يمكن بناء american.gxt مع الخط العربي الحالي: بقيت ${visibleConflicts.length} سطور تستخدم محارف إنجليزية مرئية في نطاق وحدات العربية 96–239 (أولها ${first.table} · 0x${first.crc.toString(16).padStart(8, "0")} بالحرف «${first.character}» والوحدة ${first.unit}). ترجم هذه السطور أو لا تستخدم حزمة الخط العربي الحالية؛ الوسوم بين ~...~ مستثناة.`,
    );
  }

  const buffer = rebuildGtaIvGxt(source, replacements);
  const parsedOutput = parseGtaIvGxt(buffer);
  if (parsedOutput.tables.length !== parsedSource.tables.length) throw new Error("فشل تحقق البناء: عدد الجداول تغير.");

  for (let tableIndex = 0; tableIndex < parsedSource.tables.length; tableIndex += 1) {
    const originalTable = parsedSource.tables[tableIndex];
    const outputTable = parsedOutput.tables[tableIndex];
    if (!outputTable || outputTable.name !== originalTable.name || outputTable.entries.length !== originalTable.entries.length) {
      throw new Error("فشل تحقق البناء: ترتيب جداول GXT تغير.");
    }
    for (let entryIndex = 0; entryIndex < originalTable.entries.length; entryIndex += 1) {
      const original = originalTable.entries[entryIndex];
      const output = outputTable.entries[entryIndex];
      if (!output || output.crc !== original.crc) throw new Error("فشل تحقق البناء: هوية CRC تغيرت.");
      const replacement = replacementByIdentity.get(`${originalTable.name}:${original.crc >>> 0}`);
      const expected = replacement ?? original.textUnits;
      if (expected.length !== output.textUnits.length || expected.some((unit, index) => unit !== output.textUnits[index])) {
        throw new Error("فشل تحقق البناء: تغيرت بيانات سطر على نحو غير متوقع.");
      }
    }
  }

  return { buffer, filename: "american.gxt", translatedLines: replacements.length };
}
