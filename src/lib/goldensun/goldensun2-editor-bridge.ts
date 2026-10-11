/**
 * Shared editor adapter for Golden Sun: The Lost Age (AGFE).
 *
 * This is a translation WORKSPACE, not a ROM-script decoder. Known/captured
 * dialogue can be imported as a UTF-8 JSON catalogue and edited with exactly
 * the same editor as Golden Sun 1. No entries are fabricated from ROM scans,
 * and no GS1 text compressor/Arabic byte map is applied to AGFE.
 */
import type { ExtractedEntry } from "@/components/editor/types";

export const GOLDENSUN2_SOURCE_GAME = "goldensun2";
export const GOLDENSUN2_BUFFER_KEY = "goldensun2RomBuffer";
export const GOLDENSUN2_TRANSLATIONS_KEY = "goldensun2Translations";
export const GOLDENSUN2_FILE = "goldensun/lost-age/catalog";
export const GOLDENSUN2_CATALOG_MAX_ENTRIES = 30000;

export interface GoldenSun2CatalogRow {
  index: number;
  original: string;
  translation?: string;
}
export interface GoldenSun2Catalog {
  format: "goldensun2-translation-catalog-v1";
  entries: GoldenSun2CatalogRow[];
}
export interface GoldenSun2TokenProblem {
  index: number;
  original: string[];
  actual: string[];
}

const CONTROL_TAG = /\\x[0-9a-fA-F]{2}|\{GS2:[0-9A-Fa-f]{2,8}\}|\[[A-Za-z][A-Za-z0-9_]*:[^\]\r\n]*\]/g;
const WRONG_ESCAPE = /\\x(?![0-9a-fA-F]{2})/i;
const WRONG_GS2 = /\{GS2:(?![0-9A-Fa-f]{2,8}\})/i;

export function goldenSun2TechnicalTokens(text: string): string[] {
  return (text.match(CONTROL_TAG) || []).map(t => t.toUpperCase());
}

/** Control-code sequence must match EXACTLY, not just the count.
 * Moving a page-break or speaker tag can break an in-game event.
 */
export function validateGoldenSun2Translation(
  source: string, translation: string
): { valid: boolean; missingOrChanged: string[] } {
  const expected = goldenSun2TechnicalTokens(source);
  const actual = goldenSun2TechnicalTokens(translation);
  const syntaxBad = WRONG_ESCAPE.test(translation) || WRONG_GS2.test(translation);
  const valid = !syntaxBad &&
    expected.length === actual.length &&
    expected.every((tag, i) => actual[i] === tag);
  return { valid, missingOrChanged: valid ? [] : expected };
}

function isRow(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Explicit catalogue, NOT inferred original game text.
 * Supported input:
 *   [{index:0, original:"Text\\x03"}]
 *   {entries:[{index:0, original:"Text\\x03"}]}
 *   {entries:[{index:0, source:"Text\\x03", translation:"..."}]}
 * Source strings are required so technical tags cannot be silently omitted.
 */
export function parseGoldenSun2Catalog(value: unknown): GoldenSun2Catalog {
  const rows = Array.isArray(value)
    ? value
    : isRow(value) && Array.isArray(value.entries) ? value.entries : null;
  if (!rows || rows.length === 0 || rows.length > GOLDENSUN2_CATALOG_MAX_ENTRIES)
    throw new Error("الكتالوج يجب أن يحتوي على 1 إلى 30000 نص مع المصدر الأصلي");
  const used = new Set<number>();
  const parsed: GoldenSun2CatalogRow[] = rows.map((row: unknown, i: number) => {
    if (!isRow(row)) throw new Error(`سجل غير صالح عند السطر ${i + 1}`);
    const idx = row.index ?? row.id ?? i;
    const source = row.original ?? row.source;
    if (!Number.isSafeInteger(idx) || Number(idx) < 0 || Number(idx) > 999999 || used.has(Number(idx)))
      throw new Error(`معرّف مكرر أو غير صالح في السجل ${i + 1}`);
    if (typeof source !== "string" || !source.length || source.length > 10000)
      throw new Error(`النص الإنجليزي الأصلي مفقود أو طويل جدًا في السجل ${i + 1}`);
    const translation = row.translation;
    if (translation !== undefined && (typeof translation !== "string" || translation.length > 10000))
      throw new Error(`ترجمة غير صالحة في السجل ${i + 1}`);
    if (translation && !validateGoldenSun2Translation(source, translation).valid)
      throw new Error(`الترجمة في السطر ${idx} فقدت أو غيّرت رمزًا تقنيًا؛ أعد الوسوم كما هي`);
    used.add(Number(idx));
    return { index: Number(idx), original: source, ...(translation ? { translation } : {}) };
  });
  return { format: "goldensun2-translation-catalog-v1", entries: parsed };
}

export function goldenSun2ToEditorEntries(catalog: GoldenSun2Catalog): ExtractedEntry[] {
  return catalog.entries.map(row => ({
    msbtFile: GOLDENSUN2_FILE,
    index: row.index,
    label: row.original.slice(0, 60),
    original: row.original,
    maxBytes: 0, // no verified AGFE encoder: do NOT advertise a length limit
  }));
}

export function goldenSun2Translations(
  catalog: GoldenSun2Catalog, previouslySaved: Record<string, string>
): Record<string, string> {
  const translations: Record<string, string> = {};
  for (const row of catalog.entries) {
    const key = `${GOLDENSUN2_FILE}:${row.index}`;
    const proposed = previouslySaved[key] ?? row.translation;
    if (typeof proposed === "string" &&
        proposed.length > 0 &&
        validateGoldenSun2Translation(row.original, proposed).valid) {
      translations[key] = proposed;
    }
  }
  return translations;
}

/** Export an editable portable JSON catalogue, NEVER claim this is a GBA. */
export function exportGoldenSun2Catalog(
  entries: Array<Pick<ExtractedEntry, "msbtFile" | "index" | "original">>,
  translations: Record<string, string>
): GoldenSun2Catalog {
  const rows = entries.filter(e => e.msbtFile === GOLDENSUN2_FILE).map(e => {
    const candidate = translations[`${e.msbtFile}:${e.index}`];
    if (candidate && !validateGoldenSun2Translation(e.original, candidate).valid)
      throw new Error(`السطر ${e.index}: اختلاف أكواد التحكم التقنية. أعد الوسوم بالترتيب الأصلي قبل التصدير.`);
    return { index: e.index, original: e.original, ...(candidate ? { translation: candidate } : {}) };
  });
  return { format: "goldensun2-translation-catalog-v1", entries: rows };
}
