/**
 * Bridge between DragonSword Awakening's `.pak` and the shared editor.
 *
 * Entry identity is the row's own ID — a number the game itself uses to find
 * the line, stable across every rebuild — paired with the table it came from.
 * So re-opening a pak, even one this tool already wrote, matches every saved
 * translation back onto its line.
 *
 * A pak this tool built can be re-opened, unlike the ROM games: the text is
 * still JSON, still keyed by ID, and Arabic reads back as Arabic. There is
 * nothing to refuse.
 *
 * The editor holds normal logical Arabic. Nothing is shaped or reversed here —
 * Unreal draws text with a real shaper and a real bidi pass, so the game does
 * that work itself. This is the first game in this tool where that is true,
 * and it is why there is no font step: what it needs is a font that carries
 * Arabic, which is a separate job from the text.
 */

import type { ExtractedEntry } from "@/components/editor/types";
import { readDragonSwordPak, writeDragonSwordPak, looksLikeDragonSwordPak } from "./ds-pak";
import { parseDsTable, buildDsTable, dsFileId } from "./ds-tables";
import { diffDsTags, dsIsTechnicalOnly } from "./ds-tag-guard";

export const DS_BUFFER_KEY = "dragonSwordSourceBuffer";
export const DS_SOURCE_GAME = "dragonsword";

function preview(text: string): string {
  const t = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

export interface DsExtractResult {
  entries: ExtractedEntry[];
  /** One row per table: its path, how many lines it holds, and its size. */
  tables: { path: string; file: string; rows: number; bytes: number }[];
  /** Rows skipped because they hold no words — only tags, digits or nothing. */
  skipped: number;
}

/** Reads every translatable line out of the pak. */
export function extractDsEntries(pak: Uint8Array): DsExtractResult {
  const entries: ExtractedEntry[] = [];
  const tables: DsExtractResult["tables"] = [];
  let skipped = 0;
  for (const file of readDragonSwordPak(pak)) {
    const rows = parseDsTable(file.data);
    const id = dsFileId(file.path);
    tables.push({ path: file.path, file: id, rows: rows.length, bytes: file.data.length });
    for (const row of rows) {
      if (!row.text || dsIsTechnicalOnly(row.text)) {
        skipped++;
        continue;
      }
      entries.push({
        msbtFile: id,
        index: row.id,
        label: preview(row.text),
        original: row.text,
        // A row is a JSON string in a file that is rebuilt around it, so no
        // slot bounds it. The only real ceiling is what the game's own text
        // box will show, which is not something this side can measure.
        maxBytes: 0x7fff,
      });
    }
  }
  return { entries, tables, skipped };
}

export interface DsBuildOk {
  pak: Uint8Array;
  translatedLines: number;
  /** Lines refused because their technical tokens changed. */
  brokenTags: { file: string; id: number; missing: string[]; extra: string[]; text: string }[];
  /** Per table: how many of its lines were replaced. */
  perTable: { file: string; written: number; rows: number }[];
}
export interface DsBuildError {
  error: string;
}

/**
 * Rebuilds the pak. `translations` is keyed `<file>:<id>`.
 *
 * A line whose tokens changed is **refused**, not written: `{0}` is a value
 * the game substitutes and `</>` closes a colour, and a line that lost one
 * either shows the wrong thing or paints the rest of the screen orange. A
 * refused line stays Italian and is named in the report; a written one that is
 * broken is invisible until someone plays that far.
 */
export function buildDsPak(
  pak: Uint8Array,
  translations: Record<string, string>
): DsBuildOk | DsBuildError {
  if (!looksLikeDragonSwordPak(pak)) {
    return { error: "هذا الملفّ ليس حاوية Unreal — تحقّق من أنك رفعت ملفّ ‎.pak‎ الصحيح" };
  }

  let files;
  try {
    files = readDragonSwordPak(pak);
  } catch (err) {
    return { error: `تعذّرت قراءة الحاوية: ${(err as Error).message}` };
  }

  const brokenTags: DsBuildOk["brokenTags"] = [];
  const perTable: DsBuildOk["perTable"] = [];
  const replace: Record<string, Uint8Array> = {};
  let translatedLines = 0;

  for (const file of files) {
    const id = dsFileId(file.path);
    let rows;
    try {
      rows = parseDsTable(file.data);
    } catch (err) {
      return { error: `«${file.path}»: ${(err as Error).message}` };
    }
    const edits = new Map<number, string>();
    for (const row of rows) {
      const value = translations[`${id}:${row.id}`];
      if (!value || value === row.text) continue;
      const diff = diffDsTags(row.text, value);
      if (diff.missing.length || diff.extra.length || !diff.sameOrder) {
        brokenTags.push({ file: id, id: row.id, missing: diff.missing, extra: diff.extra, text: value });
        continue;
      }
      edits.set(row.id, value);
    }
    perTable.push({ file: id, written: edits.size, rows: rows.length });
    translatedLines += edits.size;
    if (edits.size > 0) replace[file.path] = buildDsTable(file.data, edits);
  }

  if (translatedLines === 0 && brokenTags.length === 0) {
    return { error: "لا توجد ترجمات محفوظة لبنائها" };
  }

  try {
    return { pak: writeDragonSwordPak(pak, replace), translatedLines, brokenTags, perTable };
  } catch (err) {
    return { error: `تعذّرت إعادة بناء الحاوية: ${(err as Error).message}` };
  }
}
