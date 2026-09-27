import type { ExtractedEntry } from "@/components/editor/types";
import { validateTwomTags } from "./twom-tags";
import { twomCategoryId } from "./twom-categories";

export const TWOM_SOURCE_GAME = "twom";
export const TWOM_FORMAT = "twom-stories-localization-v1";

interface TwomJsonRow {
  id: string;
  key: string;
  index: number;
  category: string;
  source: string;
  translation: string;
  technical_tokens?: string[];
  status?: string;
  [extra: string]: unknown;
}

/**
 * `source` is the English the editor shows; an existing `translation` (95 rows
 * in the first export) arrives already filled in. Each row is kept whole on
 * its entry, so the export changes nothing but `translation` and `status`.
 */
export function importTwomJson(value: unknown) {
  const doc = value as { format?: string; entries?: unknown[] } & Record<string, unknown>;
  if (doc?.format !== TWOM_FORMAT || !Array.isArray(doc.entries)) throw new Error("هذا ليس ملف JSON الخاص بـ This War of Mine: Stories.");
  const { entries: rows, ...meta } = doc;
  const seen = new Set<string>();
  const entries: ExtractedEntry[] = [];
  const translations: Record<string, string> = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Partial<TwomJsonRow>;
    if (
      !row ||
      typeof row.id !== "string" ||
      typeof row.key !== "string" ||
      typeof row.category !== "string" ||
      typeof row.source !== "string" ||
      typeof row.translation !== "string" ||
      seen.has(row.id)
    ) {
      throw new Error(`صف غير صالح في ملف This War of Mine: Stories عند الرقم ${i + 1}.`);
    }
    seen.add(row.id);
    const entry: ExtractedEntry = {
      msbtFile: `twom/${twomCategoryId(row.category)}/${i}`,
      index: i,
      label: row.key,
      original: row.source,
      maxBytes: Number.MAX_SAFE_INTEGER,
      twomKey: row.key,
      twomRow: row as Record<string, unknown>,
      ...(i === 0 ? { twomDocMeta: meta } : {}),
    };
    entries.push(entry);
    translations[`${entry.msbtFile}:${entry.index}`] = row.translation;
  }
  return { entries, translations };
}

export function exportTwomJson(entries: ExtractedEntry[], translations: Record<string, string>) {
  const own = entries.filter((e) => e.msbtFile.startsWith("twom/"));
  const bad: string[] = [];
  const rows = own.map((e) => {
    const translation = translations[`${e.msbtFile}:${e.index}`] ?? "";
    if (translation.trim() && !validateTwomTags(e.original, translation).valid) bad.push(e.label);
    const row = { ...(e.twomRow ?? { id: `twom-stories/${e.label}`, key: e.label, index: e.index, source: e.original }) };
    row.translation = translation;
    if ("status" in row || !e.twomRow) row.status = translation.trim() ? "translated" : "untranslated";
    return row;
  });
  if (bad.length) throw new Error(`الرموز التقنية غير سليمة في ${bad.length} سطر، أولها: ${bad[0]}. شغّل «الفحص العميق» لإصلاحها ثم صدّر مجدداً.`);
  const meta = own.find((e) => e.twomDocMeta)?.twomDocMeta ?? { format: TWOM_FORMAT, game: "This War of Mine: Stories" };
  return { ...meta, format: TWOM_FORMAT, entry_count: rows.length, entries: rows };
}
