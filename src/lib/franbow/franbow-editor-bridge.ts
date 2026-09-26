import type { ExtractedEntry } from "@/components/editor/types";
import { extractFranBowTags, validateFranBowTags } from "./franbow-tags";
import { franBowCategoryId } from "./franbow-categories";

export const FRANBOW_SOURCE_GAME = "franbow";
export const FRANBOW_FORMAT = "fran-bow-arabic-translation";

export interface FranBowJsonEntry {
  id: string;
  category: string;
  context: string;
  source: string;
  translation: string;
  technical_tokens: string[];
  origins: string[];
}

/**
 * `source` becomes the English original the editor shows; `translation` — if
 * the export already carries one for that row — becomes the Arabic sitting in
 * the translation field, exactly as the tool's own export shipped it. Same
 * shape as 9th Dawn Remake's importer: nothing here treats an already-Arabic
 * `translation` as the row's original text.
 */
export function importFranBowJson(value: unknown) {
  const doc = value as { format?: string; entries?: unknown[] };
  if (doc?.format !== FRANBOW_FORMAT || !Array.isArray(doc.entries)) throw new Error("هذا ليس ملف JSON الخاص بـ Fran Bow.");
  const seen = new Set<string>();
  const entries: ExtractedEntry[] = [];
  const translations: Record<string, string> = {};
  for (let i = 0; i < doc.entries.length; i++) {
    const row = doc.entries[i] as Partial<FranBowJsonEntry>;
    if (
      !row ||
      typeof row.id !== "string" ||
      typeof row.category !== "string" ||
      typeof row.context !== "string" ||
      typeof row.source !== "string" ||
      typeof row.translation !== "string" ||
      seen.has(row.id)
    ) {
      throw new Error(`صف Fran Bow غير صالح عند الرقم ${i + 1}.`);
    }
    seen.add(row.id);
    const entry: ExtractedEntry = {
      msbtFile: `franbow/${franBowCategoryId(row.category)}/${i}`,
      index: i,
      label: row.id,
      original: row.source,
      maxBytes: Number.MAX_SAFE_INTEGER,
      franBowId: row.id,
      franBowCategory: row.category,
      franBowContext: row.context,
      franBowOrigins: Array.isArray(row.origins) ? row.origins.filter((o): o is string => typeof o === "string") : [],
    };
    entries.push(entry);
    translations[`${entry.msbtFile}:${entry.index}`] = row.translation;
  }
  return { entries, translations };
}

export function exportFranBowJson(entries: ExtractedEntry[], translations: Record<string, string>) {
  const rows: FranBowJsonEntry[] = entries
    .filter((e) => e.msbtFile.startsWith("franbow/"))
    .map((e) => {
      const translation = translations[`${e.msbtFile}:${e.index}`] ?? "";
      const checked = translation ? validateFranBowTags(e.original, translation) : { valid: true };
      if (!checked.valid) throw new Error(`الرموز التقنية غير محفوظة في: ${e.label}`);
      return {
        id: e.franBowId ?? e.label,
        category: e.franBowCategory ?? "الحوارات والسرد",
        context: e.franBowContext ?? "",
        source: e.original,
        translation,
        technical_tokens: extractFranBowTags(e.original),
        origins: e.franBowOrigins ?? [],
      };
    });
  return {
    format: FRANBOW_FORMAT,
    version: 1,
    game: "Fran Bow v1.0.5 Android",
    source_language: "en",
    target_language: "ar",
    entry_count: rows.length,
    instructions_ar: "ترجم قيمة translation فقط. لا تغيّر id أو source أو context، ولا تحذف أي قيمة موجودة في technical_tokens أو تغيّر ترتيبها.",
    entries: rows,
  };
}
