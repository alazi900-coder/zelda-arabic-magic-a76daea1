// @vitest-environment node
/**
 * Browser artifact verification. This test reads a bundle downloaded by the
 * LumenTale editor and never writes to the uploaded source bundle or disk.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { extractLumenTaleEntries } from "./lumentale-editor-bridge";

const artifactPath = process.env.LUMENTALE_ARTIFACT_PATH;
const artifactTest = artifactPath && existsSync(artifactPath) ? test : test.skip;

describe("LumenTale browser-built artifact", () => {
  artifactTest("reopens with all identities intact and retains the saved UI translation", async () => {
    const bytes = await readFile(artifactPath!);
    const bundle = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const extracted = await extractLumenTaleEntries(bundle);

    expect(extracted.tables).toHaveLength(30);
    expect(extracted.entries).toHaveLength(14_476);

    const uiTable = extracted.tables.find((table) => table.table === "UI_en");
    const row = uiTable?.rows.find((candidate) => candidate.m_Id === "12603944960");
    expect(uiTable).toBeDefined();
    expect(row).toBeDefined();
    const target = extracted.entries.find(
      (entry) => entry.msbtFile === "lumentale/UI_en" && entry.index === row?.rowIndex,
    );
    expect(target).toBeDefined();
    expect(target?.original).toBe("اضغط أي زر");

    const identities = extracted.tables.flatMap((table) =>
      table.rows.map((row) => `${table.asset}\u0000${table.table}\u0000${row.m_Id}`),
    );
    expect(new Set(identities).size).toBe(14_476);
  }, 60_000);
});
