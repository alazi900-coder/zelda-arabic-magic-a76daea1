/**
 * LumenTale: Memories of Trey — Unity Localization bundle bridge.
 * Design rule: m_Id is an opaque 64-bit identity. It is never parsed as a JS
 * number, translated, renumbered, or used as a writable value.
 */
import { load } from "unityfs-js";
import { processMonoBehaviour } from "unityfs-js/exporters/index.js";
import type { ExtractedEntry } from "@/components/editor/types";
import { validateLumenTaleTranslation } from "./lumentale-token-guard";
export { lumentaleTechnicalTokens, validateLumenTaleTranslation } from "./lumentale-token-guard";

export const LUMENTALE_SOURCE_GAME = "lumentale";
export const LUMENTALE_BUFFER_KEY = "lumentale-unityfs-buffer";
export const LUMENTALE_META_KEY = "lumentale-unityfs-meta";

export type LumenTaleTableMeta = {
  asset: string;
  table: string;
  pathId: string;
  rowCount: number;
  /** Maps the editor key to the immutable Unity row identity used by a future writer. */
  rows: Array<{ editorKey: string; rowIndex: number; m_Id: string }>;
};

export type LumenTaleBundleMeta = {
  originalName?: string;
  tables: LumenTaleTableMeta[];
};

type TableRow = { m_Id?: string | number | bigint; m_Localized?: unknown };

function toOpaqueId(value: TableRow["m_Id"]): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return String(value);
  return String(value ?? "");
}

function tableCategory(table: string): string {
  const upper = table.toUpperCase();
  if (/(DIALOG|STORY|CUTSCENE|QUEST)/.test(upper)) return "lumentale-dialogue";
  if (/(ANIMON.*NAME|CHARACTER|NPC)/.test(upper)) return "lumentale-names";
  if (/(DESCRIPTION|LORE|JOURNAL)/.test(upper)) return "lumentale-lore";
  if (/(ITEM|INVENTORY|EQUIP)/.test(upper)) return "lumentale-items";
  if (/(MENU|UI|SETTINGS|SYSTEM|TUTORIAL)/.test(upper)) return "lumentale-ui";
  return "lumentale-general";
}

/**
 * Returns every English string while preserving the original table, Unity asset
 * path and opaque m_Id in metadata. `index` stays a per-table row position for
 * compatibility with the shared editor; a future bundle writer must resolve a
 * row through `tables[].rows`, never by the global editor position.
 */
export async function extractLumenTaleEntries(buffer: ArrayBuffer): Promise<{
  entries: ExtractedEntry[];
  tables: LumenTaleTableMeta[];
}> {
  const manager = await load(buffer, { unityRevision: "2022.3.62f2" });
  const objects = manager.getObjectInfosByClass("MonoBehaviour");
  const entries: ExtractedEntry[] = [];
  const tables: LumenTaleTableMeta[] = [];

  for (const objectInfo of objects) {
    const pathInfo = manager.getObjectPathInfo(objectInfo);
    // unityfs-js exposes these resources as `Assets/Localization/Tables/<name>`
    // rather than the original `_en.asset` file name. m_TableData is the stable
    // discriminator, so do not reject valid tables based on the displayed path.
    if (!pathInfo?.path) continue;

    const result = await processMonoBehaviour(objectInfo, {}, manager);
    const raw = result?.data?.raw as { m_Name?: unknown; m_TableData?: unknown } | undefined;
    const hasTableData = Array.isArray(raw?.m_TableData);
    const rows = hasTableData ? (raw.m_TableData as TableRow[]) : [];
    const table = typeof raw?.m_Name === "string" ? raw.m_Name : pathInfo.name;
    // An empty table is still part of the original bundle identity and must be
    // retained in metadata for a future verified writer.
    if (!hasTableData || !table) continue;

    const sourceName = `lumentale/${table}`;
    const metaRows: LumenTaleTableMeta["rows"] = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const original = typeof row.m_Localized === "string" ? row.m_Localized : "";
      const id = toOpaqueId(row.m_Id);
      if (!id) continue;
      const index = rowIndex;
      const editorKey = `${sourceName}:${index}`;
      entries.push({
        msbtFile: sourceName,
        index,
        label: `${table} · m_Id ${id}`,
        original,
        // Unity's string table has no byte ceiling. The builder validates tokens,
        // not arbitrary byte truncation.
        maxBytes: 1_000_000,
        risen3Cat: tableCategory(table),
      });
      metaRows.push({ editorKey, rowIndex, m_Id: id });
    }
    tables.push({
      asset: pathInfo.path,
      table,
      pathId: objectInfo.pathID.toString(),
      rowCount: metaRows.length,
      rows: metaRows,
    });
  }

  if (!entries.length) {
    throw new Error("لم يُعثر على جداول لغة إنجليزية بصيغة LumenTale داخل الحزمة.");
  }
  return { entries, tables };
}

function entryKey(entry: Pick<ExtractedEntry, "msbtFile" | "index">): string {
  return `${entry.msbtFile}:${entry.index}`;
}

/**
 * The browser build must prove that the serialized bytes can be reopened by
 * UnityFS before the editor offers them for download. This catches the exact
 * failure mode where a bundle is written as Resource/no-compression and Unity
 * then falls back to displaying localization keys in its menus.
 */
async function verifyBuiltLumenTaleBundle(bundle: Uint8Array, tables: LumenTaleTableMeta[]): Promise<string | null> {
  try {
    const copy = bundle.buffer.slice(bundle.byteOffset, bundle.byteOffset + bundle.byteLength);
    const verifier = await load(copy, { unityRevision: "2022.3.62f2" });
    if (!verifier.bundleFile) return "فشل فتح الحزمة الناتجة للتحقق قبل التنزيل.";
    if (verifier.bundleFile.flags.compressionType !== 3) {
      return "أوقف البناء: الحزمة الناتجة ليست مضغوطة بـLZ4HC كما في المصدر.";
    }

    const verifiedObjects = verifier.getObjectInfosByClass("MonoBehaviour");
    const expectedByTable = new Map(tables.map((table) => [table.table, table.rowCount]));
    const verifiedRows = new Map<string, number>();
    for (const objectInfo of verifiedObjects) {
      const result = await processMonoBehaviour(objectInfo, {}, verifier);
      const raw = result?.data?.raw as { m_Name?: unknown; m_TableData?: unknown } | undefined;
      const table = typeof raw?.m_Name === "string" ? raw.m_Name : "";
      if (table && Array.isArray(raw?.m_TableData)) verifiedRows.set(table, raw.m_TableData.length);
    }

    if (verifiedRows.size !== tables.length) {
      return `أوقف البناء: أُعيد فتح ${verifiedRows.size} جدولاً فقط من أصل ${tables.length}.`;
    }
    for (const [table, expectedRows] of expectedByTable) {
      if (verifiedRows.get(table) !== expectedRows) {
        return `أوقف البناء: جدول ${table} لا يطابق عدد صفوفه الأصلي بعد إعادة الفتح.`;
      }
    }
    return null;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return `أوقف البناء: تعذر التحقق من Bundle الناتج (${detail}).`;
  }
}

/**
 * Rebuilds a new UnityFS bundle from the browser-held source only after checking
 * every serialized table and row against its immutable extraction metadata.
 * The supplied ArrayBuffer is never mutated; UnityFS serializes a fresh result.
 */
export async function buildLumenTaleBundle(
  source: ArrayBuffer,
  meta: LumenTaleBundleMeta,
  entries: ExtractedEntry[],
  translations: Record<string, string>,
): Promise<
  | { bundle: Uint8Array; translatedLines: number; changedTables: number; filename: string }
  | { error: string }
> {
  if (!meta?.tables?.length) return { error: "بيانات هوية جداول LumenTale غير موجودة. أعد فتح الحزمة من صفحة LumenTale." };

  const manager = await load(source, { unityRevision: "2022.3.62f2" });
  if (!manager.bundleFile) return { error: "تعذر تحميل UnityFS قبل البناء." };

  const entryByKey = new Map(entries.map((entry) => [entryKey(entry), entry]));
  const objectsByPathId = new Map(
    manager.getObjectInfosByClass("MonoBehaviour").map((objectInfo) => [objectInfo.pathID.toString(), objectInfo]),
  );
  const pending: Array<{ row: { m_Localized?: unknown }; text: string; table: string }> = [];

  for (const tableMeta of meta.tables) {
    const objectInfo = objectsByPathId.get(tableMeta.pathId);
    if (!objectInfo) return { error: `تعذر العثور على مورد الجدول ${tableMeta.table} بالهوية الأصلية.` };

    const pathInfo = manager.getObjectPathInfo(objectInfo);
    if (pathInfo?.path !== tableMeta.asset) {
      return { error: `تغيّر مسار مورد الجدول ${tableMeta.table}. أعد فتح الحزمة المطابقة قبل البناء.` };
    }

    const result = await processMonoBehaviour(objectInfo, {}, manager);
    const raw = result?.data?.raw as { m_Name?: unknown; m_TableData?: unknown } | undefined;
    const rawTable = typeof raw?.m_Name === "string" ? raw.m_Name : pathInfo?.name;
    const rawRows = Array.isArray(raw?.m_TableData) ? (raw.m_TableData as TableRow[]) : null;
    const writableRows = objectInfo.object?.fields?.m_TableData as Array<{ m_Id?: unknown; m_Localized?: unknown }> | undefined;

    if (rawTable !== tableMeta.table || !rawRows || !writableRows || rawRows.length !== tableMeta.rowCount || writableRows.length !== tableMeta.rowCount) {
      return { error: `بنية جدول ${tableMeta.table} لا تطابق الفهرسة الأصلية؛ لم تُكتب أي ترجمة.` };
    }

    for (const rowMeta of tableMeta.rows) {
      const sourceRow = rawRows[rowMeta.rowIndex];
      const writableRow = writableRows[rowMeta.rowIndex];
      if (!sourceRow || !writableRow || toOpaqueId(sourceRow.m_Id) !== rowMeta.m_Id || toOpaqueId(writableRow.m_Id as TableRow["m_Id"]) !== rowMeta.m_Id) {
        return { error: `هوية m_Id لمطابقة السطر في ${tableMeta.table} تغيّرت؛ أوقف البناء لحماية النصوص.` };
      }

      const translation = translations[rowMeta.editorKey];
      if (!translation?.trim()) continue;
      const original = typeof sourceRow.m_Localized === "string" ? sourceRow.m_Localized : "";
      if (translation === original) continue;
      const tokenError = validateLumenTaleTranslation(original, translation);
      if (tokenError) return { error: `${tableMeta.table} · m_Id ${rowMeta.m_Id}: ${tokenError}` };
      pending.push({ row: writableRow, text: translation, table: tableMeta.table });
    }
  }

  if (!pending.length) return { error: "لا توجد ترجمات مختلفة صالحة لبنائها في الحزمة." };

  const changedTables = new Set<string>();
  for (const change of pending) {
    change.row.m_Localized = change.text;
    changedTables.add(change.table);
  }

  const changedObjects = new Set(meta.tables.filter((table) => changedTables.has(table.table)).map((table) => table.pathId));
  for (const pathId of changedObjects) {
    const object = objectsByPathId.get(pathId)?.object;
    if (!object || typeof object.setDirty !== "function") return { error: "تعذر تعليم جدول Unity المعدّل للحفظ." };
    object.setDirty();
  }

  const serialized = manager.bundleFile.serialize();
  const bundle = serialized instanceof Uint8Array ? serialized : new Uint8Array(serialized as ArrayBuffer);
  const verificationError = await verifyBuiltLumenTaleBundle(bundle, meta.tables);
  if (verificationError) return { error: verificationError };
  const stem = (meta.originalName || "localization-string-tables-english_assets_all.bundle").replace(/\.bundle$/i, "");
  return {
    bundle,
    translatedLines: pending.length,
    changedTables: changedTables.size,
    filename: `${stem}_ar.bundle`,
  };
}
