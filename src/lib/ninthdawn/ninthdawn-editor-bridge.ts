import type { ExtractedEntry } from "@/components/editor/types";
import { extractNinthDawnTags, validateNinthDawnTags } from "./ninthdawn-tags";

export const NINTHDAWN_SOURCE_GAME = "ninthdawn";
export const NINTHDAWN_FORMAT = "9th-dawn-remake-arabic-translation-v1";
export interface NinthDawnJsonEntry {
  id: string;
  sheet_id: number;
  section: string;
  index: number;
  source: string;
  translation: string;
  technical_tokens?: string[];
}

/**
 * `source` becomes the English original the editor shows; `translation` — if
 * the export already carries one for that row — becomes the Arabic sitting in
 * the translation field, exactly as the tool's own export shipped it. Nothing
 * here treats an already-Arabic `translation` as the row's original text.
 */
export function importNinthDawnJson(value: unknown) {
  const doc = value as { format?: string; entries?: unknown[] };
  if (doc?.format !== NINTHDAWN_FORMAT || !Array.isArray(doc.entries)) throw new Error("هذا ليس ملف JSON الخاص بـ 9th Dawn Remake Arabic.");
  const seen = new Set<string>();
  const entries: ExtractedEntry[] = [];
  const translations: Record<string, string> = {};
  for (let i = 0; i < doc.entries.length; i++) {
    const row = doc.entries[i] as Partial<NinthDawnJsonEntry>;
    if (
      !row ||
      typeof row.id !== "string" ||
      typeof row.section !== "string" ||
      typeof row.source !== "string" ||
      typeof row.translation !== "string" ||
      seen.has(row.id)
    ) {
      throw new Error(`صف 9th Dawn Remake غير صالح عند الرقم ${i + 1}.`);
    }
    seen.add(row.id);
    const entry: ExtractedEntry = {
      msbtFile: `ninthdawn/${row.section}/${i}`,
      index: i,
      label: row.id,
      original: row.source,
      maxBytes: Number.MAX_SAFE_INTEGER,
      ninthDawnId: row.id,
      ninthDawnSection: row.section,
    };
    entries.push(entry);
    translations[`${entry.msbtFile}:${entry.index}`] = row.translation;
  }
  return { entries, translations };
}

export function exportNinthDawnJson(entries: ExtractedEntry[], translations: Record<string, string>) {
  const rows: NinthDawnJsonEntry[] = entries
    .filter((e) => e.msbtFile.startsWith("ninthdawn/"))
    .map((e) => {
      const translation = translations[`${e.msbtFile}:${e.index}`] ?? "";
      const checked = translation ? validateNinthDawnTags(e.original, translation) : { valid: true };
      if (!checked.valid) throw new Error(`الرموز التقنية غير محفوظة في: ${e.label}`);
      const id = e.ninthDawnId ?? e.label;
      const [sheetPart, indexPart] = id.split(":");
      return {
        id,
        sheet_id: Number(sheetPart) || 0,
        section: e.ninthDawnSection ?? "Generic",
        index: Number(indexPart) || 0,
        source: e.original,
        translation,
        technical_tokens: extractNinthDawnTags(e.original),
      };
    });
  return {
    format: NINTHDAWN_FORMAT,
    game: "9th Dawn Remake",
    entry_count: rows.length,
    instructions_ar: [
      "ترجم قيمة translation فقط.",
      "لا تعدل id أو sheet_id أو section أو index أو source أو technical_tokens.",
      "أبقِ كل الرموز الموجودة في technical_tokens كما هي وبنفس العدد والمعنى داخل الترجمة.",
      "لا تضف تشكيل الحروف أو تعكس اتجاه النص؛ ستعالج أداة البناء العربية تلقائيا.",
      "اترك translation فارغا إذا لم ترغب في ترجمة السطر الآن.",
    ],
    entries: rows,
  };
}
