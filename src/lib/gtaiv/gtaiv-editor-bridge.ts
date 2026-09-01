/** GTA IV integration with the shared translation editor.
 * Design: translate from `american.gxt` (plain English, no font quirks) and
 * build into `russian.gxt` (the Russian-slot Arabic mod's own GXT, which
 * alone has the font capable of drawing Arabic — see `gtaiv-ru-charmap.ts`
 * for how it was read). Untranslated lines keep whatever the container
 * already had; `~...~` runtime tokens and dollar amounts are always checked
 * against the English original, never against the container's old text.
 */
import type { ExtractedEntry } from "@/components/editor/types";
import {
  encodeGtaIvArabicText,
  gtaIvRawUnitsToString,
  parseGtaIvGxt,
  rebuildGtaIvGxt,
  type GtaIvParsedGxtTable,
} from "./gxt-format";
import { gtaIvEditorTextToRuntimeText } from "./gtaiv-line-split";
import { GTAIV_RU_CUSTOM_UNITS } from "./gtaiv-ru-charmap";

export const GTAIV_SOURCE_GAME = "gtaiv";
export const GTAIV_BUFFER_KEY = "gtaiv:english-gxt-buffer";
export const GTAIV_SOURCE_NAME_KEY = "gtaiv:english-gxt-name";
export const GTAIV_CONTAINER_BUFFER_KEY = "gtaiv:russian-container-buffer";
export const GTAIV_CONTAINER_NAME_KEY = "gtaiv:russian-container-name";

export interface GtaIvEditorImport {
  entries: ExtractedEntry[];
  tableCount: number;
}

export interface GtaIvRuBuild {
  buffer: ArrayBuffer;
  filename: "russian.gxt";
  translatedLines: number;
  /** Translated lines whose identity has no matching row in the Russian
   * container (a small, expected gap — see the 99.8% coverage check this
   * design was based on). They cannot be built; nothing else is affected. */
  skippedNoContainerMatch: number;
}

/**
 * Style contract: the Russian-slot mod's font draws Arabic on 124 specific,
 * non-contiguous glyph units (`GTAIV_RU_CUSTOM_UNITS`) — not a range, unlike
 * the disproven English-font assumption this replaced. Runtime tokens are
 * interpreted by GTA IV rather than rendered as glyphs, so their contents
 * remain exempt. Any visible raw ASCII sitting on one of those units would
 * render as Arabic art and corrupt menus or untranslated lines.
 */
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
      if (GTAIV_RU_CUSTOM_UNITS.has(unit)) {
        return { unit, character: piece[index] ?? "" };
      }
    }
  }
  return null;
}

function buildContainerTableIndex(parsedContainer: ReturnType<typeof parseGtaIvGxt>): Map<string, GtaIvParsedGxtTable> {
  const byUpperName = new Map<string, GtaIvParsedGxtTable>();
  for (const table of parsedContainer.tables) byUpperName.set(table.name.toUpperCase(), table);
  return byUpperName;
}

/**
 * Extracts entries from the plain English `american.gxt` — this is what the
 * editor shows and translates from. When `russianContainer` is also given,
 * each entry is flagged with whether the community mod itself ever
 * translated that line (its container row already uses one of the mod's 124
 * Arabic glyph units) — a line the mod left untranslated may still render
 * garbled in-game even though this tool never touched it; see
 * `buildGtaIvRuOutput`'s doc comment for why that is not this build's bug.
 */
export function extractGtaIvEntries(buffer: ArrayBuffer, russianContainer?: ArrayBuffer): GtaIvEditorImport {
  const parsed = parseGtaIvGxt(buffer);
  const containerTablesByUpperName = russianContainer ? buildContainerTableIndex(parseGtaIvGxt(russianContainer)) : null;

  const entries = parsed.tables.flatMap((table) => {
    const containerTable = containerTablesByUpperName?.get(table.name.toUpperCase());
    return table.entries.map((entry) => {
      const containerEntry = containerTable?.entries.find((candidate) => (candidate.crc >>> 0) === (entry.crc >>> 0));
      return {
        // Table + original CRC is the stable GXT identity. Do not substitute
        // an ordinal index: the exact CRC must be preserved for a later GXT builder.
        msbtFile: `gtaiv/${table.name}`,
        index: entry.crc >>> 0,
        label: `${table.name} · 0x${(entry.crc >>> 0).toString(16).padStart(8, "0")}`,
        original: gtaIvRawUnitsToString(entry.textUnits),
        // GXT size can only be measured after its Arabic glyph encoding is fixed.
        // A zero budget tells generic editor checks not to invent a byte limit.
        maxBytes: 0,
        gtaivNeedsModTranslation: containerTablesByUpperName
          ? Boolean(containerEntry && !containerEntry.textUnits.some((unit) => GTAIV_RU_CUSTOM_UNITS.has(unit)))
          : undefined,
      };
    });
  });
  return { entries, tableCount: parsed.tables.length };
}

function gtaIvEntryIdentity(entry: Pick<ExtractedEntry, "msbtFile" | "index">): string | null {
  if (!entry.msbtFile.startsWith("gtaiv/")) return null;
  return `${entry.msbtFile.slice("gtaiv/".length)}:${entry.index >>> 0}`;
}

/**
 * Builds only the rows changed in the shared editor. `englishSource` is
 * re-parsed so a stale editor state can never target a different english
 * file; `russianContainer` is the actual GXT being built — its table names
 * are matched case-insensitively against the English ones (the mod's own
 * tables are lowercase, american.gxt's are uppercase).
 */
export function buildGtaIvRuOutput(
  englishSource: ArrayBuffer,
  russianContainer: ArrayBuffer,
  entries: readonly ExtractedEntry[],
  translations: Readonly<Record<string, string>>,
): GtaIvRuBuild {
  const parsedEnglish = parseGtaIvGxt(englishSource);
  const englishByIdentity = new Map(parsedEnglish.tables.flatMap((table) => table.entries.map((entry) => [
    `${table.name}:${entry.crc >>> 0}`,
    { table: table.name, crc: entry.crc >>> 0, textUnits: entry.textUnits },
  ])));

  const parsedContainer = parseGtaIvGxt(russianContainer);
  const containerTablesByUpperName = buildContainerTableIndex(parsedContainer);

  const replacements: { table: string; crc: number; textUnits: Uint16Array }[] = [];
  const translatedPresentationText = new Map<string, string>();
  let skippedNoContainerMatch = 0;

  for (const entry of entries) {
    const identity = gtaIvEntryIdentity(entry);
    if (!identity) continue;
    const englishEntry = englishByIdentity.get(identity);
    if (!englishEntry) throw new Error("حالة المحرر لا تطابق ملف الإنجليزي المحفوظ. أعد استيراد المصدر.");
    if (gtaIvRawUnitsToString(englishEntry.textUnits) !== entry.original) {
      throw new Error("تم تغيير مصدر الإنجليزي منذ فتح المحرر. أعد استيراده قبل البناء.");
    }
    const key = `${entry.msbtFile}:${entry.index}`;
    const translation = translations[key];
    // `~n~\n` exists only to make the editor show GTA IV's explicit break as
    // a real line. Collapse it here, immediately before GXT encoding.
    const runtimeTranslation = translation ? gtaIvEditorTextToRuntimeText(translation) : translation;
    if (!runtimeTranslation || runtimeTranslation === entry.original) continue;

    const containerTable = containerTablesByUpperName.get(englishEntry.table.toUpperCase());
    const containerEntry = containerTable?.entries.find((candidate) => (candidate.crc >>> 0) === englishEntry.crc);
    if (!containerTable || !containerEntry) {
      skippedNoContainerMatch += 1;
      continue;
    }

    const encoded = encodeGtaIvArabicText(entry.original, runtimeTranslation);
    replacements.push({ table: containerTable.name, crc: containerEntry.crc >>> 0, textUnits: encoded.textUnits });
    translatedPresentationText.set(`${containerTable.name}:${containerEntry.crc >>> 0}`, encoded.processedText);
  }

  const replacementByIdentity = new Map(replacements.map((entry) => [`${entry.table}:${entry.crc >>> 0}`, entry.textUnits]));
  // Only the rows this build actually writes are checked here. The
  // container's own untouched rows are the community mod's pre-existing
  // content — some are genuinely still untranslated and already collide
  // with the repainted Arabic units in the shipped mod itself; that is not
  // a defect this build introduces or can fix, so it is left as-is.
  const visibleConflicts: { table: string; crc: number; unit: number; character: string }[] = [];
  for (const [identity, renderedText] of translatedPresentationText) {
    const conflict = findVisibleGtaIvArabicUnitConflict(renderedText);
    if (conflict) {
      const [table, crc] = identity.split(":");
      visibleConflicts.push({ table, crc: Number(crc), ...conflict });
    }
  }
  if (visibleConflicts.length > 0) {
    const first = visibleConflicts[0];
    throw new Error(
      `لا يمكن بناء russian.gxt: بقيت ${visibleConflicts.length} سطور تستخدم محارف مرئية تقع على إحدى خانات الخطّ العربي المخصّصة لهذا المود (أولها ${first.table} · 0x${first.crc.toString(16).padStart(8, "0")} بالحرف «${first.character}» والوحدة ${first.unit}). ترجم هذه السطور؛ الوسوم بين ~...~ مستثناة.`,
    );
  }

  const buffer = rebuildGtaIvGxt(russianContainer, replacements);
  const parsedOutput = parseGtaIvGxt(buffer);
  if (parsedOutput.tables.length !== parsedContainer.tables.length) throw new Error("فشل تحقق البناء: عدد الجداول تغير.");

  for (let tableIndex = 0; tableIndex < parsedContainer.tables.length; tableIndex += 1) {
    const originalTable = parsedContainer.tables[tableIndex];
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

  return { buffer, filename: "russian.gxt", translatedLines: replacements.length, skippedNoContainerMatch };
}
