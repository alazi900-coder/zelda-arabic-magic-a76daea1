// @vitest-environment node
/**
 * LumenTale build verification. This never writes to the uploaded bundle or
 * to disk: it serializes a fresh bundle in memory, reopens that result, and
 * compares every editor row identity with the original extraction.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { load } from "unityfs-js";
import {
  buildLumenTaleBundle,
  extractLumenTaleEntries,
  lumentaleTechnicalTokens,
} from "./lumentale-editor-bridge";

const bundlePath = process.env.LUMENTALE_BUNDLE_PATH;
const bundleTest = bundlePath && existsSync(bundlePath) ? test : test.skip;

describe("LumenTale verified bundle build", () => {
  bundleTest("changes one requested row only while preserving all table and m_Id identities", async () => {
    const bytes = await readFile(bundlePath!);
    const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const extracted = await extractLumenTaleEntries(source);
    const target = extracted.entries.find(
      (entry) => entry.original.trim().length > 0 && lumentaleTechnicalTokens(entry.original).length === 0,
    );
    expect(target).toBeDefined();
    if (!target) throw new Error("لم يُعثر على سطر اختباري آمن بلا رموز تقنية.");

    const targetKey = `${target.msbtFile}:${target.index}`;
    const translatedText = "اختبار بناء LumenTale";
    const result = await buildLumenTaleBundle(source, { originalName: "lumentale-test.bundle", tables: extracted.tables }, extracted.entries, {
      [targetKey]: translatedText,
    });

    if ("error" in result) throw new Error(result.error);
    expect(result.translatedLines).toBe(1);
    expect(result.changedTables).toBe(1);

    const rebuilt = result.bundle.buffer.slice(
      result.bundle.byteOffset,
      result.bundle.byteOffset + result.bundle.byteLength,
    ) as ArrayBuffer;
    const rebuiltManager = await load(rebuilt, { unityRevision: "2022.3.62f2" });
    expect(rebuiltManager.bundleFile.flags.compressionType).toBe(3);
    expect(rebuiltManager.bundleFile.blockInfo.every((block) => block.flags.compressionType === 3)).toBe(true);
    const reopened = await extractLumenTaleEntries(rebuilt);
    expect(reopened.tables).toHaveLength(30);
    expect(reopened.entries).toHaveLength(extracted.entries.length);

    const originalByKey = new Map(extracted.entries.map((entry) => [`${entry.msbtFile}:${entry.index}`, entry]));
    const changed = reopened.entries.filter((entry) => {
      const original = originalByKey.get(`${entry.msbtFile}:${entry.index}`);
      return original?.original !== entry.original;
    });
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ msbtFile: target.msbtFile, index: target.index, original: translatedText });

    const originalIdentity = extracted.tables.flatMap((table) => table.rows.map((row) => `${table.asset}\u0000${table.table}\u0000${row.m_Id}`));
    const rebuiltIdentity = reopened.tables.flatMap((table) => table.rows.map((row) => `${table.asset}\u0000${table.table}\u0000${row.m_Id}`));
    expect(rebuiltIdentity).toEqual(originalIdentity);
  }, 180_000);
});
