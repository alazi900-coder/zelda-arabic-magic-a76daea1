/**
 * Read-only preflight facts for the LumenTale confirmation dialog.
 * The writer remains the sole authority for serialization and post-write UnityFS verification.
 */
import type { ExtractedEntry } from "@/components/editor/types";
import type { LumenTaleBundleMeta } from "./lumentale-editor-bridge";
import { validateLumenTaleTranslation } from "./lumentale-token-guard";

export type LumenTalePreBuildIssue = {
  editorKey: string;
  table: string;
  message: string;
};

export type LumenTalePreBuildReport = {
  sourceName: string;
  tableCount: number;
  sourceRows: number;
  changedLines: number;
  changedTables: number;
  blockingIssues: LumenTalePreBuildIssue[];
};

/**
 * Counts only the source rows that the UnityFS writer can resolve through the
 * immutable table metadata. It deliberately does not predict compression or
 * byte output: those facts are checked only after the writer serializes.
 */
export function createLumenTalePreBuildReport(
  meta: LumenTaleBundleMeta,
  entries: ExtractedEntry[],
  translations: Record<string, string>,
): LumenTalePreBuildReport {
  const entriesByKey = new Map(entries.map((entry) => [`${entry.msbtFile}:${entry.index}`, entry]));
  const changedTables = new Set<string>();
  const blockingIssues: LumenTalePreBuildIssue[] = [];
  let changedLines = 0;

  for (const table of meta.tables) {
    for (const row of table.rows) {
      const entry = entriesByKey.get(row.editorKey);
      if (!entry) {
        blockingIssues.push({
          editorKey: row.editorKey,
          table: table.table,
          message: "لم تعد بيانات سطر المحرر مطابقة لخريطة هوية الحزمة المفتوحة.",
        });
        continue;
      }

      const translation = translations[row.editorKey];
      if (!translation?.trim() || translation === entry.original) continue;

      const tokenError = validateLumenTaleTranslation(entry.original, translation);
      if (tokenError) {
        blockingIssues.push({ editorKey: row.editorKey, table: table.table, message: tokenError });
        continue;
      }
      changedLines += 1;
      changedTables.add(table.table);
    }
  }

  return {
    sourceName: meta.originalName || "حزمة LumenTale المفتوحة",
    tableCount: meta.tables.length,
    sourceRows: meta.tables.reduce((total, table) => total + table.rowCount, 0),
    changedLines,
    changedTables: changedTables.size,
    blockingIssues,
  };
}
