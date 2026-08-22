import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { load } from "unityfs-js";
import { processMonoBehaviour } from "unityfs-js/exporters/index.js";

const cliArgs = process.argv.slice(2);
const editOneRow = cliArgs.includes("--edit-one-row");
const [sourceArg, outputArg, reportArg] = cliArgs.filter((arg) => arg !== "--edit-one-row");

if (!sourceArg || !outputArg) {
  throw new Error("Usage: node scripts/lumentale-roundtrip.mjs <source.bundle> <working-copy.bundle> [report.json] [--edit-one-row]");
}

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error(`UnityFS writer returned an unsupported value: ${Object.prototype.toString.call(value)}`);
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function firstDifference(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (stableJson(left[index]) !== stableJson(right[index])) {
      return { index, before: left[index] ?? null, after: right[index] ?? null };
    }
  }
  return null;
}

function summarizeDifference(before, after) {
  const assetLength = Math.max(before.assets.length, after.assets.length);
  let assetDifference = null;
  for (let index = 0; index < assetLength; index += 1) {
    const left = before.assets[index];
    const right = after.assets[index];
    if (!left || !right || left.assetIndex !== right.assetIndex || left.objectCount !== right.objectCount) {
      assetDifference = { index, before: left ?? null, after: right ?? null };
      break;
    }
    const objectDifference = firstDifference(left.objects, right.objects);
    if (objectDifference) {
      assetDifference = { assetIndex: left.assetIndex, objectDifference };
      break;
    }
  }

  const tableLength = Math.max(before.tables.length, after.tables.length);
  let tableDifference = null;
  for (let index = 0; index < tableLength; index += 1) {
    const left = before.tables[index];
    const right = after.tables[index];
    if (!left || !right || left.asset !== right.asset || left.table !== right.table || left.pathId !== right.pathId) {
      tableDifference = { index, before: left ?? null, after: right ?? null };
      break;
    }
    const rowDifference = firstDifference(left.rows, right.rows);
    if (rowDifference) {
      tableDifference = { table: left.table, pathId: left.pathId, rowDifference };
      break;
    }
  }

  return {
    bundleNodeDifference: firstDifference(before.bundleNodes, after.bundleNodes),
    assetDifference,
    tableDifference,
  };
}

async function collectSignature(manager) {
  const bundleNodes = (manager.bundleFile?.nodes ?? [])
    .map((node) => ({ path: node.path, size: Number(node.size), flags: node.flags }))
    .sort((left, right) => left.path.localeCompare(right.path));

  const assets = manager.assetFiles
    .map((assetFile, assetIndex) => ({
      assetIndex,
      objectCount: assetFile.objects.length,
      objects: assetFile.objects
        .map((objectInfo) => ({
          pathId: objectInfo.pathID.toString(),
          className: objectInfo.getClassName(),
          byteSize: Number(objectInfo.byteSize),
        }))
        .sort((left, right) => left.pathId.localeCompare(right.pathId)),
    }))
    .sort((left, right) => left.assetIndex - right.assetIndex);

  const tables = [];
  for (const objectInfo of manager.getObjectInfosByClass("MonoBehaviour")) {
    const result = await processMonoBehaviour(objectInfo, {}, manager);
    const raw = result?.data?.raw;
    if (!Array.isArray(raw?.m_TableData)) continue;

    const pathInfo = manager.getObjectPathInfo(objectInfo);
    const table = typeof raw.m_Name === "string" ? raw.m_Name : pathInfo?.name ?? "";
    tables.push({
      asset: pathInfo?.path ?? "",
      table,
      pathId: objectInfo.pathID.toString(),
      rows: raw.m_TableData.map((row, rowIndex) => ({
        rowIndex,
        m_Id: String(row?.m_Id ?? ""),
        m_Localized: typeof row?.m_Localized === "string" ? row.m_Localized : "",
      })),
    });
  }

  tables.sort((left, right) => `${left.asset}\u0000${left.table}\u0000${left.pathId}`.localeCompare(`${right.asset}\u0000${right.table}\u0000${right.pathId}`));
  return { bundleNodes, assets, tables };
}

async function loadBundle(path) {
  const bytes = await readFile(path);
  const manager = await load(toArrayBuffer(bytes), { unityRevision: "2022.3.62f2" });
  return { bytes, manager };
}

async function applySingleRowEdit(manager) {
  for (const objectInfo of manager.getObjectInfosByClass("MonoBehaviour")) {
    const result = await processMonoBehaviour(objectInfo, {}, manager);
    const raw = result?.data?.raw;
    if (!Array.isArray(raw?.m_TableData)) continue;

    const rowIndex = raw.m_TableData.findIndex((row) => typeof row?.m_Localized === "string" && row.m_Localized.length > 0);
    if (rowIndex < 0) continue;

    const object = objectInfo.object;
    if (!object?.fields || typeof object.setDirty !== "function") {
      throw new Error("Unable to access a writable MonoBehaviour for the LumenTale test row.");
    }

    const pathInfo = manager.getObjectPathInfo(objectInfo);
    const table = typeof raw.m_Name === "string" ? raw.m_Name : pathInfo?.name ?? "";
    const row = object.fields.m_TableData[rowIndex];
    const originalText = row.m_Localized;
    const updatedText = `${originalText} [LMT_BUILD_TEST]`;
    row.m_Localized = updatedText;
    object.setDirty();

    return {
      asset: pathInfo?.path ?? "",
      table,
      pathId: objectInfo.pathID.toString(),
      rowIndex,
      m_Id: String(row.m_Id ?? ""),
      originalText,
      updatedText,
    };
  }

  throw new Error("No non-empty LumenTale translation row was available for the working-copy edit test.");
}

function verifySingleRowEdit(before, after, target) {
  if (before.bundleNodes.length !== after.bundleNodes.length || before.assets.length !== after.assets.length || before.tables.length !== after.tables.length) {
    throw new Error("Edited round-trip changed the number of bundle nodes, assets, or localization tables.");
  }

  let changedRows = 0;
  for (let tableIndex = 0; tableIndex < before.tables.length; tableIndex += 1) {
    const left = before.tables[tableIndex];
    const right = after.tables[tableIndex];
    if (!right || left.asset !== right.asset || left.table !== right.table || left.pathId !== right.pathId || left.rows.length !== right.rows.length) {
      throw new Error("Edited round-trip changed localization table identity or row count.");
    }

    for (let rowIndex = 0; rowIndex < left.rows.length; rowIndex += 1) {
      const beforeRow = left.rows[rowIndex];
      const afterRow = right.rows[rowIndex];
      const isTarget = left.asset === target.asset && left.table === target.table && left.pathId === target.pathId && beforeRow.rowIndex === target.rowIndex && beforeRow.m_Id === target.m_Id;
      if (isTarget) {
        if (afterRow?.m_Localized !== target.updatedText || afterRow.m_Id !== target.m_Id) {
          throw new Error("Edited round-trip did not preserve the target row identity and updated text.");
        }
        changedRows += 1;
      } else if (stableJson(beforeRow) !== stableJson(afterRow)) {
        throw new Error(`Edited round-trip changed an unrelated row: ${left.table} row ${beforeRow.rowIndex}.`);
      }
    }
  }

  if (changedRows !== 1) {
    throw new Error(`Edited round-trip expected one changed row but found ${changedRows}.`);
  }
}

const source = resolve(sourceArg);
const output = resolve(outputArg);
const report = resolve(reportArg ?? `${output}.roundtrip.json`);

const original = await loadBundle(source);
const before = await collectSignature(original.manager);
const editTarget = editOneRow ? await applySingleRowEdit(original.manager) : null;
const serialized = toBytes(original.manager.bundleFile.serialize());

await mkdir(dirname(output), { recursive: true });
await writeFile(output, serialized);

const rebuilt = await loadBundle(output);
const after = await collectSignature(rebuilt.manager);
const beforeJson = stableJson(before);
const afterJson = stableJson(after);

if (!editTarget && beforeJson !== afterJson) {
  await mkdir(dirname(report), { recursive: true });
  await writeFile(`${report}.diagnostic.json`, stableJson({ summary: summarizeDifference(before, after) }));
  throw new Error("Round-trip verification failed: Unity resource or localization-table signature changed.");
}

if (editTarget) {
  verifySingleRowEdit(before, after, editTarget);
}

const summary = {
  source,
  output,
  originalBytes: original.bytes.length,
  rebuiltBytes: serialized.length,
  originalSha256: createHash("sha256").update(original.bytes).digest("hex"),
  rebuiltSha256: createHash("sha256").update(serialized).digest("hex"),
  bundleNodes: before.bundleNodes.length,
  assetFiles: before.assets.length,
  localizationTables: before.tables.length,
  localizationRows: before.tables.reduce((total, table) => total + table.rows.length, 0),
  editTarget,
  verification: "passed",
};

await mkdir(dirname(report), { recursive: true });
await writeFile(report, stableJson(summary));
console.log(stableJson(summary));
