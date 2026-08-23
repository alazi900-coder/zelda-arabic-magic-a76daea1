// @vitest-environment node
/**
 * LumenTale text-bundle launch probe.
 * Design reminder: create one UI_en marker only; preserve opaque m_Id values,
 * every table identity, and LZ4HC serialization. The artifact is written
 * outside the app solely after the same verification used by the editor.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";
import { buildLumenTaleBundle, extractLumenTaleEntries } from "./lumentale-editor-bridge";

const sourcePath = process.env.LUMENTALE_BUNDLE_PATH;
const outputPath = process.env.LUMENTALE_OUTPUT_PATH;
const enabled = Boolean(sourcePath && outputPath && existsSync(sourcePath));

test.runIf(enabled)("writes a single English UI marker only after verified LZ4HC rebuild", async () => {
  const sourceBytes = await readFile(sourcePath!);
  const source = sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength) as ArrayBuffer;
  const extracted = await extractLumenTaleEntries(source);
  const target = extracted.entries.find(
    (entry) => entry.msbtFile === "lumentale/UI_en" && entry.original.trim().length > 0,
  );
  expect(target).toBeDefined();
  if (!target) throw new Error("تعذر العثور على سطر واجهة صالح داخل UI_en.");

  const key = `${target.msbtFile}:${target.index}`;
  const result = await buildLumenTaleBundle(
    source,
    { originalName: "localization-string-tables-english_assets_all.bundle", tables: extracted.tables },
    extracted.entries,
    { [key]: `${target.original} [LT-CHECK]` },
  );
  if ("error" in result) throw new Error(result.error);
  expect(result.translatedLines).toBe(1);
  expect(result.changedTables).toBe(1);
  await mkdir(path.dirname(outputPath!), { recursive: true });
  await writeFile(outputPath!, result.bundle);
}, 180_000);
