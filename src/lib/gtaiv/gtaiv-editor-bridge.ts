/** GTA IV integration with the shared translation editor.
 * Design: GTA IV uses `gtaiv/<TABLE>` identities; the existing shared editor
 * remains the only editor UI. This module reads source English GXT only.
 */
import type { ExtractedEntry } from "@/components/editor/types";
import { gtaIvRawUnitsToString, parseGtaIvGxt } from "./gxt-format";

export const GTAIV_SOURCE_GAME = "gtaiv";

export interface GtaIvEditorImport {
  entries: ExtractedEntry[];
  tableCount: number;
}

export function extractGtaIvEntries(buffer: ArrayBuffer): GtaIvEditorImport {
  const parsed = parseGtaIvGxt(buffer);
  const entries = parsed.tables.flatMap((table) => table.entries.map((entry) => ({
    // Table + original CRC is the stable GXT identity. Do not substitute an
    // ordinal index: the exact CRC must be preserved for a later GXT builder.
    msbtFile: `gtaiv/${table.name}`,
    index: entry.crc >>> 0,
    label: `${table.name} · 0x${(entry.crc >>> 0).toString(16).padStart(8, "0")}`,
    original: gtaIvRawUnitsToString(entry.textUnits),
    // GXT size can only be measured after its Arabic glyph encoding is fixed.
    // A zero budget tells generic editor checks not to invent a byte limit.
    maxBytes: 0,
  })));
  return { entries, tableCount: parsed.tables.length };
}
