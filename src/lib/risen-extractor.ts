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
  type TabField,
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
    // Candidate source fields, in fallback order (English → German → French → ...).
    // Resolved per ROW below, not once for the whole table: a row may have its
    // text only in a non-preferred language while the preferred one is empty.
    const candidateFields: TabField[] = SOURCE_FIELD_PREFERENCE
      .map((name) => table.fields.find((f) => f.name === name))
      .filter((f): f is TabField => f !== undefined);
    if (candidateFields.length === 0) {
      const fallback = table.fields.find((f) => f.name === targetField);
      if (fallback) candidateFields.push(fallback);
    }
    if (candidateFields.length === 0) {
      perTable.push({ table: table.name, rows: 0, translatable: 0 });
      continue;
    }

    // ID field (usually the first field, named "ID")
    const idField = table.fields.find((f) => f.name === "ID");
    // Context fields
    const ctxFields = table.fields.filter((f) => CONTEXT_FIELDS.includes(f.name));

    const rowCount = candidateFields[0].rowCount;
    let translatableCount = 0;

    for (let r = 0; r < rowCount; r++) {
      let original = "";
      for (const field of candidateFields) {
        const v = field.values[r];
        if (v && v.trim()) { original = v; break; }
      }
      if (!original) continue; // all language variants empty for this row
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
