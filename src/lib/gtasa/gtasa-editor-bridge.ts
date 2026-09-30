import type { ExtractedEntry } from "@/components/editor/types";
import { validateGtaSaTags } from "./gtasa-tags";

export const GTASA_SOURCE_GAME = "gtasa";

/** One row of the export: a GXT line identified by its table and 8-hex-digit key hash. */
export interface GtaSaJsonEntry {
  table: string;
  hash: string;
  source: string;
  arabic: string;
}

const HASH_RE = /^[0-9A-Fa-f]{8}$/;

/**
 * `source` is the English the editor shows; `arabic` is the translation, with
 * one exception. The export writes the English back into `arabic` for a line
 * nobody translated yet (676 of 17,165: keys like `STEAL_4`, bare numbers,
 * and real text still waiting), so those rows import with an empty translation
 * and count as untranslated instead of passing for translated English.
 *
 * A line is identified by table + hash and nothing else: the hash, read as a
 * number, is the entry index. It is unique across the whole export (measured),
 * so it stays valid however the editor sorts or filters.
 */
export function importGtaSaJson(value: unknown) {
  if (!Array.isArray(value)) throw new Error("هذا ليس ملف JSON الخاص بـ GTA San Andreas.");
  const seen = new Set<string>();
  const entries: ExtractedEntry[] = [];
  const translations: Record<string, string> = {};
  for (let i = 0; i < value.length; i++) {
    const row = value[i] as Partial<GtaSaJsonEntry>;
    if (
      !row ||
      typeof row.table !== "string" || !row.table ||
      typeof row.hash !== "string" || !HASH_RE.test(row.hash) ||
      typeof row.source !== "string" ||
      typeof row.arabic !== "string"
    ) {
      throw new Error(`صف GTA San Andreas غير صالح عند الرقم ${i + 1}.`);
    }
    const hash = row.hash.toUpperCase();
    const id = `${row.table}:${hash}`;
    if (seen.has(id)) throw new Error(`صف مكرر في ملف GTA San Andreas: ${id}`);
    seen.add(id);
    const entry: ExtractedEntry = {
      msbtFile: `gtasa/${row.table}`,
      index: parseInt(hash, 16),
      label: `${row.table} · ${hash}`,
      original: row.source,
      maxBytes: Number.MAX_SAFE_INTEGER,
    };
    entries.push(entry);
    translations[`${entry.msbtFile}:${entry.index}`] = row.arabic === row.source ? "" : row.arabic;
  }
  return { entries, translations };
}

export function exportGtaSaJson(entries: ExtractedEntry[], translations: Record<string, string>): GtaSaJsonEntry[] {
  return entries
    .filter((e) => e.msbtFile.startsWith("gtasa/"))
    .map((e) => {
      const translation = translations[`${e.msbtFile}:${e.index}`] ?? "";
      if (translation && !validateGtaSaTags(e.original, translation).valid) {
        throw new Error(`الرموز التقنية غير محفوظة في: ${e.label}`);
      }
      return {
        table: e.msbtFile.slice("gtasa/".length),
        hash: e.label.split(" · ")[1] ?? e.index.toString(16).toUpperCase().padStart(8, "0"),
        source: e.original,
        // An untouched line goes back exactly as the export had it: the English.
        arabic: translation || e.original,
      };
    });
}
