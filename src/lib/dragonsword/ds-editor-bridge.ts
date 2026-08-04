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

/** A pak holds fonts, configs and widgets too; only these carry text. */
const TABLE_RE = /\.table$/i;
/** The English table is the source to translate from, never the one written. */
const SOURCE_TABLE_RE = /_en\.table$/i;

interface DsTablePair {
  id: string;
  /** The English table, when the pak ships one beside the target. */
  source?: { path: string; data: Uint8Array };
  /** The table the game reads, and the only one a build writes into. */
  target: { path: string; data: Uint8Array };
}

/**
 * Pairs each table with its English twin.
 *
 * A translated pak often ships two copies of a table under one language slot:
 * `StringData_en.table` holding the English the translator worked from, and
 * `StringData_th.table` holding what the game shows. They carry the same row
 * ids, so the pair is the editor's two columns — English on the left, the work
 * so far on the right — and only the right-hand one is ever written back.
 */
function pairTables(pak: Uint8Array): DsTablePair[] {
  const groups = new Map<string, { path: string; data: Uint8Array }[]>();
  for (const file of readDragonSwordPak(pak)) {
    if (!TABLE_RE.test(file.path)) continue;
    const id = dsFileId(file.path);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(file);
  }
  const pairs: DsTablePair[] = [];
  for (const [id, files] of groups) {
    const source = files.find((f) => SOURCE_TABLE_RE.test(f.path));
    const target = files.find((f) => !SOURCE_TABLE_RE.test(f.path));
    // A pak that ships only the English table has nothing else to write into,
    // so that table is both sides — the ordinary single-table case.
    if (!target) pairs.push({ id, target: source! });
    else pairs.push({ id, source, target });
  }
  return pairs;
}

export interface DsExtractResult {
  entries: ExtractedEntry[];
  /** One row per table: what is written, how many lines, and its English twin. */
  tables: { path: string; file: string; rows: number; bytes: number; source?: string }[];
  /** Rows skipped because they hold no words — only tags, digits or nothing. */
  skipped: number;
  /** Work already in the pak, keyed `<file>:<id>` — the editor starts here. */
  translations: Record<string, string>;
}

/** Reads every translatable line out of the pak. */
export function extractDsEntries(pak: Uint8Array): DsExtractResult {
  const entries: ExtractedEntry[] = [];
  const tables: DsExtractResult["tables"] = [];
  const translations: Record<string, string> = {};
  let skipped = 0;
  for (const pair of pairTables(pak)) {
    const targetRows = parseDsTable(pair.target.data);
    const done = new Map(targetRows.map((r) => [r.id, r.text]));
    // The English table decides which rows exist and what the translator
    // reads; a row only in the target has no source line to work from.
    const rows = pair.source ? parseDsTable(pair.source.data) : targetRows;
    tables.push({
      path: pair.target.path,
      file: pair.id,
      rows: rows.length,
      bytes: pair.target.data.length,
      source: pair.source?.path,
    });
    for (const row of rows) {
      if (!row.text || dsIsTechnicalOnly(row.text)) {
        skipped++;
        continue;
      }
      const key = `${pair.id}:${row.id}`;
      entries.push({
        msbtFile: pair.id,
        index: row.id,
        label: preview(row.text),
        original: row.text,
        // A row is a JSON string in a file that is rebuilt around it, so no
        // slot bounds it. The only real ceiling is what the game's own text
        // box will show, which is not something this side can measure.
        maxBytes: 0x7fff,
      });
      const already = done.get(row.id);
      if (pair.source && already && already !== row.text) translations[key] = already;
    }
  }
  return { entries, tables, skipped, translations };
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

  let pairs;
  try {
    pairs = pairTables(pak);
  } catch (err) {
    return { error: `تعذّرت قراءة الحاوية: ${(err as Error).message}` };
  }
  if (pairs.length === 0) {
    return { error: "لم أجد جداول نصٍّ داخل الحاوية" };
  }

  const brokenTags: DsBuildOk["brokenTags"] = [];
  const perTable: DsBuildOk["perTable"] = [];
  const replace: Record<string, Uint8Array> = {};
  let translatedLines = 0;

  for (const pair of pairs) {
    let rows, sourceText: Map<number, string> | null = null;
    try {
      rows = parseDsTable(pair.target.data);
      if (pair.source) {
        sourceText = new Map(parseDsTable(pair.source.data).map((r) => [r.id, r.text]));
      }
    } catch (err) {
      return { error: `«${pair.target.path}»: ${(err as Error).message}` };
    }
    const edits = new Map<number, string>();
    for (const row of rows) {
      const value = translations[`${pair.id}:${row.id}`];
      if (!value || value === row.text) continue;
      // Tokens are checked against the English when the pak ships it: that is
      // what the game substitutes into, and it is what the editor showed. The
      // line already in the target may itself have lost a token, and measuring
      // against it would let that error through unnoticed.
      const against = sourceText?.get(row.id) ?? row.text;
      const diff = diffDsTags(against, value);
      if (diff.missing.length || diff.extra.length || !diff.sameOrder) {
        brokenTags.push({ file: pair.id, id: row.id, missing: diff.missing, extra: diff.extra, text: value });
        continue;
      }
      edits.set(row.id, value);
    }
    perTable.push({ file: pair.id, written: edits.size, rows: rows.length });
    translatedLines += edits.size;
    if (edits.size > 0) replace[pair.target.path] = buildDsTable(pair.target.data, edits);
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
