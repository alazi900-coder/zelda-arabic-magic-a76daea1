import { describe, it, expect } from "vitest";
import { parseBdatFile, type BdatFile, type BdatTable, BdatValueType } from "@/lib/bdat-parser";
import { patchBdatFile } from "@/lib/bdat-writer";

function scrambleSection(buf: Uint8Array, startIdx: number, endIdx: number, key: number): void {
  let k1 = ((key >> 8) & 0xff) ^ 0xff;
  let k2 = (key & 0xff) ^ 0xff;
  let pos = startIdx;
  while (pos + 1 < endIdx) {
    buf[pos] ^= k1;
    buf[pos + 1] ^= k2;
    k1 = (k1 + buf[pos]) & 0xff;
    k2 = (k2 + buf[pos + 1]) & 0xff;
    pos += 2;
  }
}

function buildScrambledLegacyBdat(strings: string[], trailingPad = 32): Uint8Array {
  const encoder = new TextEncoder();
  const tableName = "TestTable_ms";
  const colName = "caption";
  const tableNameBytes = encoder.encode(tableName + "\0");
  const colNameBytes = encoder.encode(colName + "\0");
  const scrambleKey = 0x4a3c;

  const headerSize = 64;
  const colInfoOffset = headerSize;
  const colInfoSize = 4;
  const colNodeOffset = colInfoOffset + colInfoSize;
  const colNodeSize = 6;
  const nameTableOffset = colNodeOffset + colNodeSize;
  const nameTableSize = tableNameBytes.length + colNameBytes.length;
  const hashTableOffset = nameTableOffset + nameTableSize;
  const hashSlotCount = 4;
  const hashTableSize = hashSlotCount * 4;
  const rowDataOffset = hashTableOffset + hashTableSize;
  const rowLength = 4;
  const rowCount = strings.length;
  const rowDataSize = rowCount * rowLength;
  const stringTableOffset = rowDataOffset + rowDataSize;

  const stringBufs: Uint8Array[] = [];
  const stringOffsets: number[] = [];
  let strPos = 0;
  for (const s of strings) {
    stringOffsets.push(strPos);
    const b = encoder.encode(s + "\0");
    stringBufs.push(b);
    strPos += b.length;
  }
  const stringTableLength = strPos;
  const tableSize = stringTableOffset + stringTableLength + trailingPad;

  const tableData = new Uint8Array(tableSize);
  const view = new DataView(tableData.buffer);

  tableData.set(encoder.encode("BDAT"), 0);
  tableData[4] = 0x02;
  tableData[5] = 0;
  view.setUint16(0x06, nameTableOffset, true);
  view.setUint16(0x08, rowLength, true);
  view.setUint16(0x0A, hashTableOffset, true);
  view.setUint16(0x0C, hashSlotCount, true);
  view.setUint16(0x0E, rowDataOffset, true);
  view.setUint16(0x10, rowCount, true);
  view.setUint16(0x12, 0, true);
  view.setUint16(0x14, 0, true);
  view.setUint16(0x16, scrambleKey, true);
  view.setUint32(0x18, stringTableOffset, true);
  view.setUint32(0x1C, stringTableLength, true);
  view.setUint16(0x20, colNodeOffset, true);
  view.setUint16(0x22, 1, true);

  tableData[colInfoOffset] = 1;
  tableData[colInfoOffset + 1] = 7;
  view.setUint16(colInfoOffset + 2, 0, true);

  view.setUint16(colNodeOffset, colInfoOffset, true);
  view.setUint16(colNodeOffset + 2, 0, true);
  view.setUint16(colNodeOffset + 4, nameTableOffset + tableNameBytes.length, true);

  tableData.set(tableNameBytes, nameTableOffset);
  tableData.set(colNameBytes, nameTableOffset + tableNameBytes.length);

  for (let r = 0; r < rowCount; r++) {
    view.setUint32(rowDataOffset + r * rowLength, stringTableOffset + stringOffsets[r], true);
  }

  let wp = stringTableOffset;
  for (const b of stringBufs) {
    tableData.set(b, wp);
    wp += b.length;
  }

  for (let i = stringTableOffset + stringTableLength; i < tableSize; i++) {
    tableData[i] = 0xaa;
  }

  scrambleSection(tableData, nameTableOffset, hashTableOffset, scrambleKey);
  scrambleSection(tableData, stringTableOffset, stringTableOffset + stringTableLength, scrambleKey);

  const fileHeaderSize = 8;
  const fileData = new Uint8Array(fileHeaderSize + tableSize);
  const fv = new DataView(fileData.buffer);
  fv.setUint32(0, 1, true);
  fv.setUint32(4, fileHeaderSize, true);
  fileData.set(tableData, fileHeaderSize);
  return fileData;
}

describe("Legacy BDAT scrambled roundtrip", () => {
  it("should reopen rebuilt scrambled legacy files without corrupted table names", () => {
    const fileData = buildScrambledLegacyBdat(["Hello", "Quest"]);
    const parsed = parseBdatFile(fileData);
    expect(parsed.tables.length).toBe(1);
    expect(parsed.tables[0].name).toBe("TestTable_ms");
    expect(parsed.tables[0].rows[0].values["caption"]).toBe("Hello");

    const translations = new Map<string, string>();
    translations.set("TestTable_ms:0:caption", "مرحبا");

    const result = patchBdatFile(parsed, translations);
    expect(result.patchedCount).toBe(1);
    expect(result.result.byteLength).toBeGreaterThanOrEqual(fileData.byteLength);

    const reparsed = parseBdatFile(result.result);
    expect(reparsed.tables.length).toBe(1);
    expect(reparsed.tables[0].name).toBe("TestTable_ms");
    expect(reparsed.tables[0].columns.map(c => c.name)).toEqual(["caption"]);
    expect(reparsed.tables[0].rows[0].values["caption"]).toBe("مرحبا");
    expect(reparsed.tables[0].rows[1].values["caption"]).toBe("Quest");
  });

  it("should preserve original scrambled bytes when skipping a legacy table after overflow", () => {
    const tableData = new Uint8Array(128);
    const originalTableData = new Uint8Array(128).fill(0xaa);
    const tableOffset = 8;
    const stringTableOffset = 100;
    const stringBytes = new TextEncoder().encode("A\0");

    tableData.set([0x42, 0x44, 0x41, 0x54], 0);
    tableData[4] = 0x02;
    new DataView(tableData.buffer).setUint16(40, 1, true);
    tableData.set(stringBytes, stringTableOffset + 1);

    const table: BdatTable = {
      name: "SkipLegacy_ms",
      nameHash: null,
      columns: [{ valueType: BdatValueType.MessageId, nameOffset: 0, name: "msg", offset: 0 }],
      rows: [{ id: 0, values: { msg: "A" } }],
      baseId: 0,
      _raw: {
        tableOffset,
        tableData,
        originalTableData,
        columnCount: 1,
        rowCount: 1,
        rowLength: 2,
        columnDefsOffset: 32,
        hashTableOffset: 32,
        rowDataOffset: 40,
        stringTableOffset,
        stringTableLength: 4,
        hashedNames: false,
        baseId: 0,
        isU32Layout: false,
        isLegacy: true,
        isScrambled: true,
        scrambleKey: 0x1234,
      },
    };

    const fileData = new Uint8Array(8 + originalTableData.length);
    const fileView = new DataView(fileData.buffer);
    fileView.setUint32(0, 1, true);
    fileView.setUint32(4, tableOffset, true);
    fileData.set(originalTableData, tableOffset);

    const bdatFile: BdatFile = {
      tables: [table],
      version: 0,
      fileSize: fileData.length,
      _raw: fileData,
      _legacyOffsetEntries: [
        { offset: tableOffset, data: originalTableData, isTable: true },
        { offset: fileData.length, data: new Uint8Array(0), isTable: false },
      ],
    };

    const translations = new Map<string, string>();
    translations.set("SkipLegacy_ms:0:msg", "ب".repeat(70000));

    const result = patchBdatFile(bdatFile, translations);
    expect(result.overflowErrors.length).toBeGreaterThan(0);
    expect(result.patchedCount).toBe(0);
    expect(result.result.slice(tableOffset, tableOffset + originalTableData.length)).toEqual(originalTableData);
  });
});
