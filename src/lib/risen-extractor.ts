/**
 * Converts a parsed Risen `strings.p00`/`strings.pak` into the editor's ExtractedEntry format.
 *
 * Only English is shown as the source text (other languages — German, French,
 * Italian, Spanish, Polish, Russian — never appear in the editor). The single
 * exception is a per-row fallback: if `English_Text[row]` is empty for a given
 * row, `German_Text[row]` is used as the source for that row only, so the row
 * isn't silently dropped. A row is skipped only if both are empty.
 *
 * `*_StageDir` fields (short performance-direction text like "laughs") are
 * excluded by default — low translation value — but can optionally be included
 * via `includeStageDir`, using the same English→German per-row fallback.
 *
 * One entry per (table, row). The entry KEY uses the target field name
 * (English_Text, or English_StageDir when stagedir is included) because
 * that's where the Arabic translation is written back on rebuild.
 */

import type { ExtractedEntry } from "@/components/editor/types";
import {
  parseRisenP00Full,
  makeKey,
  type RisenP00Document,
  type RisenTableRaw,
  type RisenFieldRaw,
} from "./risen-p00";

export interface RisenExtractResult {
  doc: RisenP00Document;
  entries: ExtractedEntry[];
  /** Per-entry context string (Owner, Role, Voice — for AI enhance) */
  contextByKey: Record<string, string>;
  stats: {
    totalRows: number;
    perTable: Array<{ table: string; rows: number; translatable: number }>;
  };
}

export interface RisenExtractOptions {
  /** Also extract `*_StageDir` fields as translatable entries. Default: false. */
  includeStageDir?: boolean;
}

/** English-only source, with a per-row fallback to German when English is empty for that row. */
const TEXT_SOURCE_PREFERENCE = ["English_Text", "German_Text"];
const STAGEDIR_SOURCE_PREFERENCE = ["English_StageDir", "German_StageDir"];

/** Default field to REPLACE with the Arabic translation on rebuild. */
export const DEFAULT_ARABIC_TARGET_FIELD = "English_Text";
export const STAGEDIR_TARGET_FIELD = "English_StageDir";

/** msbtFile suffix marking a StageDir entry, to avoid colliding with the Text entry of the same row. */
const STAGEDIR_MSBT_SUFFIX = ":stagedir";

export function isStageDirMsbtFile(msbtFile: string): boolean {
  return msbtFile.endsWith(STAGEDIR_MSBT_SUFFIX);
}

export function stripStageDirSuffix(msbtFile: string): string {
  return isStageDirMsbtFile(msbtFile) ? msbtFile.slice(0, -STAGEDIR_MSBT_SUFFIX.length) : msbtFile;
}

/** Contextual (non-translatable) fields the editor can show for AI context. */
export const CONTEXT_FIELDS = ["Owner", "Role", "Voice"];

/** Rough max byte budget per string (UTF-16, generous). Risen has no strict cap
 * on string length in TAB0 (uint16 str_len), but we keep a UI hint. */
const RISEN_MAX_BYTES = 8192;

function extractFieldGroup(
  table: RisenTableRaw,
  sourcePreference: string[],
  msbtFile: string,
  targetField: string,
  idField: RisenFieldRaw | undefined,
  ctxFields: RisenFieldRaw[],
  entries: ExtractedEntry[],
  contextByKey: Record<string, string>
): number {
  const candidateFields: RisenFieldRaw[] = sourcePreference
    .map((name) => table.fields.find((f) => f.name === name))
    .filter((f): f is RisenFieldRaw => f !== undefined);
  if (candidateFields.length === 0) return 0;

  const roleField = table.fields.find((f) => f.name === "Role");
  const ownerField = table.fields.find((f) => f.name === "Owner");

  const rowCount = candidateFields[0].values.length;
  let translatableCount = 0;

  for (let r = 0; r < rowCount; r++) {
    let original = "";
    for (const field of candidateFields) {
      const v = field.values[r];
      if (v && v.trim()) { original = v; break; }
    }
    if (!original) continue; // English and German both empty for this row
    translatableCount++;

    const id = idField?.values[r] ?? `${table.name}#${r}`;
    const key = makeKey(table.name, targetField, r);

    entries.push({
      msbtFile,
      index: r,
      label: id.length > 60 ? id.slice(0, 60) + "…" : id,
      original,
      maxBytes: RISEN_MAX_BYTES,
      risenRole: roleField?.values[r] || undefined,
      risenOwner: ownerField?.values[r] || undefined,
    });

    const ctxParts: string[] = [];
    for (const cf of ctxFields) {
      const v = cf.values[r];
      if (v && v.trim()) ctxParts.push(`${cf.name}: ${v}`);
    }
    if (ctxParts.length) contextByKey[key] = ctxParts.join(" | ");
  }

  return translatableCount;
}

export function extractEntriesFromP00(
  buffer: ArrayBuffer,
  targetField: string = DEFAULT_ARABIC_TARGET_FIELD,
  options: RisenExtractOptions = {}
): RisenExtractResult {
  const doc = parseRisenP00Full(buffer);
  const entries: ExtractedEntry[] = [];
  const contextByKey: Record<string, string> = {};
  const perTable: Array<{ table: string; rows: number; translatable: number }> = [];

  for (const table of doc.tables) {
    const idField = table.fields.find((f) => f.name === "ID");
    const ctxFields = table.fields.filter((f) => CONTEXT_FIELDS.includes(f.name));

    let translatableCount = extractFieldGroup(
      table, TEXT_SOURCE_PREFERENCE, table.name, targetField, idField, ctxFields, entries, contextByKey
    );

    if (options.includeStageDir) {
      translatableCount += extractFieldGroup(
        table, STAGEDIR_SOURCE_PREFERENCE, `${table.name}${STAGEDIR_MSBT_SUFFIX}`, STAGEDIR_TARGET_FIELD,
        idField, ctxFields, entries, contextByKey
      );
    }

    const rowCount = table.fields.find((f) => TEXT_SOURCE_PREFERENCE.includes(f.name))?.values.length ?? 0;
    perTable.push({ table: table.name, rows: rowCount, translatable: translatableCount });
  }

  return {
    doc,
    entries,
    contextByKey,
    stats: {
      totalRows: entries.length,
      perTable,
    },
  };
}
