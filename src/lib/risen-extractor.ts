/**
 * Converts a parsed Risen `strings.p00` into the editor's ExtractedEntry format.
 * One entry per (table, row) — the SOURCE text is picked from the first available
 * language field (English → German → French).
 *
 * The entry KEY uses the target field name (default English_Text) because that's
 * where the Arabic translation will be written back on rebuild.
 */

import type { ExtractedEntry } from "@/components/editor/types";
import {
  parseP00,
  SOURCE_FIELD_PREFERENCE,
  DEFAULT_ARABIC_TARGET_FIELD,
  CONTEXT_FIELDS,
  type ParsedP00,
} from "./risen-tab0-parser";
import { makeKey } from "./risen-tab0-writer";

export interface RisenExtractResult {
  parsed: ParsedP00;
  entries: ExtractedEntry[];
  /** Per-entry context string (Owner, Role, Voice — for AI enhance) */
  contextByKey: Record<string, string>;
  stats: {
    totalRows: number;
    perTable: Array<{ table: string; rows: number; translatable: number }>;
  };
}

/** Rough max byte budget per string (UTF-16, generous). Risen has no strict cap
 * on string length in TAB0 (uint16 str_len), but we keep a UI hint. */
const RISEN_MAX_BYTES = 8192;

export function extractEntriesFromP00(
  buffer: ArrayBuffer,
  targetField: string = DEFAULT_ARABIC_TARGET_FIELD
): RisenExtractResult {
  const parsed = parseP00(buffer);
  const entries: ExtractedEntry[] = [];
  const contextByKey: Record<string, string> = {};
  const perTable: Array<{ table: string; rows: number; translatable: number }> = [];

  for (const table of parsed.tables) {
    // Pick which field to read the source text from.
    let sourceField = table.fields.find((f) =>
      SOURCE_FIELD_PREFERENCE.includes(f.name)
    );
    if (!sourceField) sourceField = table.fields.find((f) => f.name === targetField);
    if (!sourceField) {
      perTable.push({ table: table.name, rows: 0, translatable: 0 });
      continue;
    }

    // ID field (usually the first field, named "ID")
    const idField = table.fields.find((f) => f.name === "ID");
    // Context fields
    const ctxFields = table.fields.filter((f) => CONTEXT_FIELDS.includes(f.name));

    const rowCount = sourceField.rowCount;
    let translatableCount = 0;

    for (let r = 0; r < rowCount; r++) {
      const original = sourceField.values[r] ?? "";
      if (!original.trim()) continue; // skip empty source rows
      translatableCount++;

      const id = idField?.values[r] ?? `${table.name}#${r}`;
      const key = makeKey(table.name, targetField, r);

      entries.push({
        msbtFile: table.name,
        index: r,
        label: id.length > 60 ? id.slice(0, 60) + "…" : id,
        original,
        maxBytes: RISEN_MAX_BYTES,
      });

      // Build a context string from Owner/Role/Voice if present
      const ctxParts: string[] = [];
      for (const cf of ctxFields) {
        const v = cf.values[r];
        if (v && v.trim()) ctxParts.push(`${cf.name}: ${v}`);
      }
      if (ctxParts.length) contextByKey[key] = ctxParts.join(" | ");
    }

    perTable.push({ table: table.name, rows: rowCount, translatable: translatableCount });
  }

  return {
    parsed,
    entries,
    contextByKey,
    stats: {
      totalRows: entries.length,
      perTable,
    },
  };
}
