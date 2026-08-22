// @vitest-environment node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { extractLumenTaleEntries } from "./lumentale-editor-bridge";

const bundlePath = process.env.LUMENTALE_BUNDLE_PATH;
const bundleTest = bundlePath && existsSync(bundlePath) ? test : test.skip;

describe("LumenTale English Unity localization bundle", () => {
  bundleTest("reads the original bundle without changing its table and row identities", async () => {
    const bytes = await readFile(bundlePath!);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const { entries, tables } = await extractLumenTaleEntries(buffer);

    expect(tables).toHaveLength(30);
    expect(entries).toHaveLength(14_476);
    expect(entries.filter((entry) => entry.original.trim().length > 0)).toHaveLength(13_908);
    expect(tables.every((table) => table.asset.startsWith("Assets/Localization/") && table.pathId.length > 0)).toBe(true);

    const rows = tables.flatMap((table) => table.rows.map((row) => ({ table: table.table, ...row })));
    expect(rows).toHaveLength(entries.length);
    expect(rows.every((row) => typeof row.m_Id === "string" && row.m_Id.length > 0 && row.rowIndex >= 0)).toBe(true);
    expect(new Set(rows.map((row) => `${row.table}\u0000${row.m_Id}`)).size).toBe(rows.length);
    expect(new Set(rows.map((row) => row.editorKey)).size).toBe(rows.length);
  }, 60_000);
});
