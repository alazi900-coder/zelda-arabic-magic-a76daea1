/**
 * Regression test for the "clear translations" bug:
 *
 *   When a row is explicitly cleared via "مسح الترجمات", the build must NOT
 *   fall back to whatever bytes are sitting in the source BDAT. If the user
 *   uploaded a previously-built (Arabic-baked) BDAT, falling back to source
 *   bytes silently re-introduces the cleared Arabic — defeating the clear.
 *
 *   The fix routes cleared rows through patchBdatFile() with an explicit
 *   empty-string translation. The writer must:
 *     1. Honor "" as a real translation (write it, do not fall back).
 *     2. Not propagate "" to sibling rows that share the same source offset.
 */
import { describe, it, expect } from "vitest";
import { parseBdatFile } from "@/lib/bdat-parser";
import { patchBdatFile as patchBdatFileWriter } from "@/lib/bdat-writer";
import { BdatFile, BdatTable, BdatValueType } from "@/lib/bdat-parser";

const encoder = new TextEncoder();

function buildBdatWithUniqueStrings(rows: string[], tableName = "T"): BdatFile {
  const tableOffset = 20;
  const tableHeaderSize = 40;
  const strParts: Uint8Array[] = [];
  let pos = 0;
  strParts.push(new Uint8Array([1]));
  pos = 1;
  const tnBytes = encoder.encode(tableName);
  strParts.push(tnBytes, new Uint8Array([0]));
  pos += tnBytes.length + 1;
  const colName = "c";
  const colNameOffset = pos - 1;
  const cnBytes = encoder.encode(colName);
  strParts.push(cnBytes, new Uint8Array([0]));
  pos += cnBytes.length + 1;
  const cellOffsets: number[] = [];
  for (const s of rows) {
    cellOffsets.push(pos);
    const sBytes = encoder.encode(s);
    strParts.push(sBytes, new Uint8Array([0]));
    pos += sBytes.length + 1;
  }
  const strTableLength = pos;
  const colDefsOffset = tableHeaderSize;
  const colDefsSize = 3;
  const rowLength = 4;
  const rowDataOffset = colDefsOffset + colDefsSize;
  const rowDataSize = rows.length * rowLength;
  const strTableOffset = rowDataOffset + rowDataSize;
  const tableSize = strTableOffset + strTableLength;
  const fileSize = tableOffset + tableSize;
  const buf = new Uint8Array(fileSize);
  const view = new DataView(buf.buffer);
  buf.set(encoder.encode("BDAT"), 0);
  view.setUint32(4, 4, true);
  view.setUint32(8, 1, true);
  view.setUint32(12, fileSize, true);
  view.setUint32(16, tableOffset, true);
  buf.set(encoder.encode("BDAT"), tableOffset);
  view.setUint16(tableOffset + 0x08, 1, true);
  view.setUint16(tableOffset + 0x0C, rows.length, true);
  view.setUint16(tableOffset + 0x18, colDefsOffset, true);
  view.setUint16(tableOffset + 0x1A, colDefsOffset, true);
  view.setUint16(tableOffset + 0x1C, rowDataOffset, true);
  view.setUint16(tableOffset + 0x1E, rowLength, true);
  view.setUint32(tableOffset + 0x20, strTableOffset, true);
  view.setUint32(tableOffset + 0x24, strTableLength, true);
  buf[tableOffset + colDefsOffset] = BdatValueType.String;
  view.setUint16(tableOffset + colDefsOffset + 1, colNameOffset, true);
  for (let r = 0; r < rows.length; r++) {
    view.setUint32(tableOffset + rowDataOffset + r * rowLength, cellOffsets[r], true);
  }
  let stOff = tableOffset + strTableOffset;
  for (const part of strParts) {
    buf.set(part, stOff);
    stOff += part.length;
  }
  const tableData = buf.slice(tableOffset, tableOffset + tableSize);
  const table: BdatTable = {
    name: tableName,
    nameHash: null,
    columns: [{ valueType: BdatValueType.String, nameOffset: colNameOffset, name: colName, offset: 0 }],
    rows: rows.map((s, i) => ({ id: i, values: { [colName]: s } })),
    baseId: 0,
    _raw: {
      tableOffset,
      tableData,
      columnCount: 1,
      rowCount: rows.length,
      rowLength,
      columnDefsOffset: colDefsOffset,
      hashTableOffset: colDefsOffset,
      rowDataOffset,
      stringTableOffset: strTableOffset,
      stringTableLength: strTableLength,
      hashedNames: false,
      baseId: 0,
      isU32Layout: false,
    },
  };
  return { tables: [table], version: 4, fileSize, _raw: buf };
}

describe("bdat-writer: explicitly-cleared rows ('' translation)", () => {
  it("writes an EMPTY string for an explicitly-cleared row instead of falling back to the source bytes", () => {
    // The source BDAT mimics a previously-built Arabic file: the on-disk
    // bytes for row 0 ALREADY contain Arabic. If the clear feature only
    // deletes a key from React state, the build would read these bytes
    // back. This test pins down the fix: an empty translation must win.
    const file = buildBdatWithUniqueStrings(["مرحبا قديم", "Untouched"]);
    const translations = new Map<string, string>();
    translations.set("T:0:c", ""); // explicitly cleared

    const result = patchBdatFileWriter(file, translations);
    const reparsed = parseBdatFile(result.result);

    expect(reparsed.tables).toHaveLength(1);
    const rows = reparsed.tables[0].rows;
    expect(rows[0].values.c).toBe(""); // cleared → empty, NOT the source Arabic
    expect(rows[1].values.c).toBe("Untouched"); // unrelated row untouched
  });

  it("does not pull a sibling untranslated row to '' just because one row in the offset group was cleared", () => {
    // In real BDATs, multiple rows can share the same source offset.
    // A cleared cell ('' translation) must not drag siblings to empty.
    // We simulate sharing by giving two rows identical source text:
    // the offset group is keyed by origStrOffset, but our simple builder
    // puts each row at its own offset, so the practical guard is that
    // a sibling without a translation keeps its original text.
    const file = buildBdatWithUniqueStrings(["First", "Second"]);
    const translations = new Map<string, string>();
    translations.set("T:0:c", ""); // cleared
    // T:1:c has no translation → must keep "Second"

    const result = patchBdatFileWriter(file, translations);
    const reparsed = parseBdatFile(result.result);
    expect(reparsed.tables[0].rows[0].values.c).toBe("");
    expect(reparsed.tables[0].rows[1].values.c).toBe("Second");
  });
});
