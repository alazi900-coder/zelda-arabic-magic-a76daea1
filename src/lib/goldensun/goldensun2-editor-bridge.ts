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
export const GOLDENSUN2_CATALOG_SIG_KEY = "goldensun2CatalogFingerprint";
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

// Keep the exact structural tokens already recognized by the shared editor:
 // backslash byte escapes, bracket tags, named placeholders, and private-use
 // markers. Only the HEX digits of \xNN are case-normalized below.
const CONTROL_TAG = /\\x[0-9a-fA-F]{2}|\{[A-Za-z][A-Za-z0-9_]*:[^{}\r\n]*\}|\[[A-Za-z\/][A-Za-z0-9_\/]*(?:[:=][^\]\r\n]*)?\]|[\uFFF9-\uFFFC\uE000-\uE0FF]/g;
const WRONG_ESCAPE = /\\x(?![0-9a-fA-F]{2})/i;
const WRONG_GS2 = /\{GS2:(?![0-9A-Fa-f]{2,8}\})/i;

/**
 * Imported JSON or AI output may contain actual ASCII C0 controls such as
 * U+001B (ESC) instead of the editor spelling \x1B. Encode only controls
 * actually required by the game's source; stray invisible controls inserted
 * by an AI are not part of the translation and must not block ROM building.
 * Newlines, tabs and NUL are excluded from this normalization.
 */
const GS2_RAW_EMBEDDED_CONTROL_RE = /[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g;

export function normalizeGoldenSun2EmbeddedControls(text: string): string {
  return text.replace(GS2_RAW_EMBEDDED_CONTROL_RE, char =>
    "\\x" + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")
  );
}

/**
 * Remove ONLY real invisible C0 characters which would add an unexpected
 * technical token. Preserve required originals, including their multiplicity.
 * Explicit readable \xNN tags are NEVER removed: if changed, the existing
 * token validator still rejects the translation.
 *
 * This does not modify the editor's saved text; the ROM builder cleans the
 * outgoing copy and reports how many unexpected controls were omitted.
 */
export function stripUnexpectedGoldenSun2RawControls(
  source: string,
  translation: string,
): { text: string; removed: number } {
  const expected = new Map<string, number>();
  for (const token of goldenSun2TechnicalTokens(source)) {
    if (!/^\\x(?:0[1-8BCEF]|1[0-9A-F])$/i.test(token)) continue;
    const code = token.slice(-2).toUpperCase();
    expected.set(code, (expected.get(code) ?? 0) + 1);
  }

  // Literal textual \xNN controls already occupy their required source slots.
  // A duplicate invisible character alongside a correct tag is expendable.
  const used = new Map<string, number>();
  for (const match of translation.matchAll(/\\x([0-9a-fA-F]{2})/g)) {
    const code = match[1].toUpperCase();
    used.set(code, (used.get(code) ?? 0) + 1);
  }
  let removed = 0;
  const text = translation.replace(GS2_RAW_EMBEDDED_CONTROL_RE, char => {
    const code = char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
    const count = used.get(code) ?? 0;
    if (count < (expected.get(code) ?? 0)) {
      used.set(code, count + 1);
      return char;
    }
    removed++;
    return "";
  });
  return { text, removed };
}

export function goldenSun2TechnicalTokens(text: string): string[] {
  return (normalizeGoldenSun2EmbeddedControls(text).match(CONTROL_TAG) || []).map(tag =>
    /^\\x/i.test(tag) ? "\\x" + tag.slice(-2).toUpperCase() :
    /^\{GS2:/i.test(tag) ? "{GS2:" + tag.slice(5, -1).toUpperCase() + "}" : tag
  );
}

/** Control-code sequence must match EXACTLY, not just the count.
 * Moving a page-break or speaker tag can break an in-game event.
 */
export function validateGoldenSun2Translation(
  source: string, translation: string
): { valid: boolean; missingOrChanged: string[] } {
  const expected = goldenSun2TechnicalTokens(source);
  const actual = goldenSun2TechnicalTokens(translation);
  const normalized = normalizeGoldenSun2EmbeddedControls(translation);
  const syntaxBad = WRONG_ESCAPE.test(normalized) || WRONG_GS2.test(normalized);
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
    if (typeof idx !== "number" || !Number.isSafeInteger(idx) || idx < 0 || idx > 999999 || used.has(idx))
      throw new Error(`معرّف مكرر أو غير صالح في السجل ${i + 1}`);
    if (typeof source !== "string" || !source.length || source.length > 10000 || WRONG_ESCAPE.test(source) || WRONG_GS2.test(source))
      throw new Error(`النص الإنجليزي الأصلي مفقود أو طويل جدًا في السجل ${i + 1}`);
    const translation = row.translation ?? row.arabic;
    if (translation !== undefined && (typeof translation !== "string" || translation.length > 10000))
      throw new Error(`ترجمة غير صالحة في السجل ${i + 1}`);
    if (translation && !validateGoldenSun2Translation(source, translation).valid)
      throw new Error(`الترجمة في السطر ${idx} فقدت أو غيّرت رمزًا تقنيًا؛ أعد الوسوم كما هي`);
    used.add(Number(idx));
    return { index: Number(idx), original: source, ...(translation ? { translation } : {}) };
  });
  return { format: "goldensun2-translation-catalog-v1", entries: parsed };
}

/** Stable fingerprint avoids mixing translations from different source dumps. */
export function goldenSun2CatalogFingerprint(catalog: GoldenSun2Catalog): string {
  let value = 2166136261;
  for (const row of catalog.entries) {
    const raw = String(row.index) + ":" + row.original + "\\n";
    for (let i = 0; i < raw.length; i++) {
      value ^= raw.charCodeAt(i);
      value = Math.imul(value, 16777619);
    }
  }
  return (value >>> 0).toString(16).padStart(8, "0");
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
