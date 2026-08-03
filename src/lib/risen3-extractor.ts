/**
 * Converts a parsed Risen 3 `localization.p00` (GAR5/STB archive — see
 * risen3-p00.ts / risen3-gar5.ts) into the editor's ExtractedEntry format —
 * the Risen 3 counterpart of risen-extractor.ts, adapted for a structurally
 * different source: one flat set of 14 language columns shared across all
 * rows, instead of per-table TAB0/TAB1 fields.
 *
 * Row identity: Risen 3 rows have no readable string ID (only a DJB2 hash —
 * see risen3-gar5.ts), so the row's own index is used as the entry index,
 * and the hash (hex) is shown as the label. The 18 original source `.csv`
 * files are NOT split out into separate categories — their row ranges aren't
 * recoverable from the file (see risen3-gar5.ts's header docs) — so every
 * row is filed under a single virtual "table" name distinguished by the
 * `.gar3` suffix (parallel to Risen 1/2's `.tab` suffix), which is what lets
 * game-param.ts / useEditorBuild.ts's detectGameType tell this apart from
 * both Risen 1/2 and Xenoblade without adding a third bespoke pipeline.
 */
import type { ExtractedEntry } from "@/components/editor/types";
import {
  parseRisenP00Gar5,
  buildRisenP00Gar5,
  type RisenP00Gar5Document,
} from "./risen3-p00";
import { idbGet } from "./idb-storage";
import { hasRisenTags, restoreRisenTags, extractRisenTags } from "./risen-tag-guard";
import { extractFormatSpecifiers } from "./format-specifier-guard";
import { shapeArabicForRisen } from "./risen/arabic-shaper";

const RISEN_BUFFER_KEY = "risenSourceBuffer";
const RISEN_META_KEY = "risenMeta";

/** Suffix marking a Risen 3 (GAR5) entry — parallel to Risen 1/2's `.tab`,
 * checked by game-param.ts's resolveGameParam and useEditorBuild.ts's
 * detectGameType so the rest of the editor doesn't need to know GAR5 exists. */
export const RISEN3_MSBT_SUFFIX = ".gar3";

/** English-only source, with a per-row fallback to German when English is empty. */
const TEXT_SOURCE_PREFERENCE = ["English_Text", "German_Text"];
const STAGEDIR_SOURCE_PREFERENCE = ["English_StageDir", "German_StageDir"];

export const DEFAULT_ARABIC_TARGET_FIELD_GAR5 = "English_Text";
export const STAGEDIR_TARGET_FIELD_GAR5 = "English_StageDir";

const STAGEDIR_MSBT_MARKER = ":stagedir";

/** Rough max byte budget per string — same generous UI hint as risen-p00 (no
 * hard cap in the format itself: strings are stored as a chain of variable-
 * length trie chunks, not a fixed-width field). */
const RISEN_MAX_BYTES = 8192;

export interface Risen3ExtractResult {
  doc: RisenP00Gar5Document;
  entries: ExtractedEntry[];
  stats: {
    totalRows: number;
    translatable: number;
  };
}

export interface Risen3ExtractOptions {
  includeStageDir?: boolean;
  /** Key map (hash -> original ID + source csv prefix) used to label and
   * categorize rows — see src/lib/risen3/categories.ts. Optional: without it
   * rows keep their hash label and stay uncategorized. */
  keyMap?: Risen3KeyMap;
}

function extractColumnGroup(
  doc: RisenP00Gar5Document,
  sourcePreference: string[],
  msbtFile: string,
  entries: ExtractedEntry[],
  keyMap?: Risen3KeyMap
): number {
  const candidates = sourcePreference
    .map((name) => doc.gar5.columns.find((c) => c.name === name))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);
  if (candidates.length === 0) return 0;

  let translatableCount = 0;
  for (let r = 0; r < doc.gar5.rowCount; r++) {
    let original = "";
    for (const col of candidates) {
      const v = col.values[r];
      if (v && v.trim()) { original = v; break; }
    }
    if (!original) continue;
    translatableCount++;

    const idHex = (doc.gar5.rowIds[r] >>> 0).toString(16).padStart(8, "0");
    const key = keyMap?.get(idHex);
    entries.push({
      msbtFile,
      index: r,
      label: key ? key.id : `0x${idHex}`,
      original,
      maxBytes: RISEN_MAX_BYTES,
      risen3Cat: key ? categorizeRisen3Prefix(key.prefix).id : RISEN3_UNKNOWN_CATEGORY.id,
    });
  }
  return translatableCount;
}


export function extractEntriesFromP00Gar5(
  buffer: ArrayBuffer,
  targetField: string = DEFAULT_ARABIC_TARGET_FIELD_GAR5,
  options: Risen3ExtractOptions = {}
): Risen3ExtractResult {
  const doc = parseRisenP00Gar5(buffer);
  const entries: ExtractedEntry[] = [];

  const msbtFile = `${targetField}${RISEN3_MSBT_SUFFIX}`;
  let translatable = extractColumnGroup(doc, TEXT_SOURCE_PREFERENCE, msbtFile, entries);

  if (options.includeStageDir) {
    const stageDirMsbtFile = `${STAGEDIR_TARGET_FIELD_GAR5}${STAGEDIR_MSBT_MARKER}${RISEN3_MSBT_SUFFIX}`;
    translatable += extractColumnGroup(doc, STAGEDIR_SOURCE_PREFERENCE, stageDirMsbtFile, entries);
  }

  return {
    doc,
    entries,
    stats: { totalRows: doc.gar5.rowCount, translatable },
  };
}

export interface Risen3BuildResult {
  buffer: ArrayBuffer;
  filename: string;
  translatedCount: number;
  originalSize: number;
  tagRepairCount: number;
}

export interface Risen3BuildOptions {
  shapeArabic?: boolean;
}

function isStageDirMsbtFile(msbtFile: string): boolean {
  return msbtFile.includes(STAGEDIR_MSBT_MARKER);
}

/** Strips the `.gar3` suffix and (if present) the `:stagedir` marker,
 * returning the plain target column name — mirrors risen-extractor.ts's
 * stripStageDirSuffix, adapted for the extra `.gar3` layer. */
function targetColumnFromMsbtFile(msbtFile: string): string {
  return msbtFile
    .replace(new RegExp(`${RISEN3_MSBT_SUFFIX.replace(".", "\\.")}$`), "")
    .replace(STAGEDIR_MSBT_MARKER, "");
}

/** Same shared-build-implementation pattern as risen-extractor.ts's
 * buildRisenOutputFromState — reads the source buffer saved at extraction
 * time, applies saved translations, rebuilds, and returns the finished file.
 * Kept as a separate function (rather than merged into the Risen 1/2 one)
 * because the underlying document shapes are unrelated — the caller decides
 * which to call based on the saved session's format (see useEditorBuild.ts). */
export async function buildRisen3OutputFromState(
  translations: Record<string, string>,
  entries?: ExtractedEntry[],
  options?: Risen3BuildOptions,
): Promise<Risen3BuildResult> {
  const shapeArabic = options?.shapeArabic !== false;
  const buffer = await idbGet<ArrayBuffer>(RISEN_BUFFER_KEY);
  if (!buffer) {
    throw new Error("لا يوجد ملف مصدر — ارفع localization.p00 من صفحة Risen 3 أولاً");
  }

  const meta = await idbGet<{ filename?: string }>(RISEN_META_KEY);

  const originalByKey = new Map<string, string>();
  if (entries) {
    for (const e of entries) originalByKey.set(`${e.msbtFile}:${e.index}`, e.original);
  }

  const doc = parseRisenP00Gar5(buffer);

  let translatedCount = 0;
  let tagRepairCount = 0;
  // Group edits per target column so we only touch a column's values array once.
  const editsByColumn = new Map<string, Map<number, string>>();

  for (const [key, rawValue] of Object.entries(translations)) {
    if (!rawValue?.trim()) continue;
    const lastColon = key.lastIndexOf(":");
    if (lastColon === -1) continue;
    const msbtFile = key.slice(0, lastColon);
    if (!msbtFile.endsWith(RISEN3_MSBT_SUFFIX)) continue; // not a Risen 3 entry
    const index = parseInt(key.slice(lastColon + 1), 10);
    if (isNaN(index)) continue;

    let value = rawValue;
    const original = originalByKey.get(key);
    if (original && hasRisenTags(original)) {
      const repaired = restoreRisenTags(original, value);
      if (repaired.changed) {
        value = repaired.text;
        tagRepairCount++;
      }
    }

    if (shapeArabic) {
      const beforeTags = extractRisenTags(value).slice().sort();
      const shapedValue = shapeArabicForRisen(value);
      const afterTags = extractRisenTags(shapedValue).slice().sort();
      const specOrderOk = extractFormatSpecifiers(value).join('') === extractFormatSpecifiers(shapedValue).join('');
      if (beforeTags.join(' ') !== afterTags.join(' ') || !specOrderOk) {
        console.warn(`[risen3-build] Arabic shaping altered protected tags for key ${key} — keeping unshaped value`);
      } else {
        value = shapedValue;
      }
    }

    const targetColumn = isStageDirMsbtFile(msbtFile) ? STAGEDIR_TARGET_FIELD_GAR5 : targetColumnFromMsbtFile(msbtFile);
    let colEdits = editsByColumn.get(targetColumn);
    if (!colEdits) { colEdits = new Map(); editsByColumn.set(targetColumn, colEdits); }
    colEdits.set(index, value);
    translatedCount++;
  }

  if (translatedCount === 0) {
    throw new Error("لم تُدخل أي ترجمة بعد");
  }

  for (const [columnName, edits] of editsByColumn) {
    const col = doc.gar5.columns.find((c) => c.name === columnName);
    if (!col) continue;
    for (const [index, value] of edits) col.values[index] = value;
  }

  const rebuilt = buildRisenP00Gar5(doc);

  return {
    buffer: rebuilt,
    filename: meta?.filename || "localization.p00",
    translatedCount,
    originalSize: buffer.byteLength,
    tagRepairCount,
  };
}
