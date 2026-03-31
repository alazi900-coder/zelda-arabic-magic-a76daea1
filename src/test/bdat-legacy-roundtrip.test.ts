/**
 * اختبار تكاملي: بناء ملف Legacy BDAT والتحقق من المؤشرات المطلقة
 * 
 * يبني ملف BDAT وهمي بتنسيق Legacy (XC1 DE / XCDE) يدوياً،
 * يمرره عبر المحلل ثم الكاتب، ويتحقق أن:
 * 1. المؤشرات في بيانات الصفوف مطلقة (من بداية الجدول)
 * 2. stringTableLength محدث في الموضع الصحيح (0x1C)
 * 3. هيكلية هيدر الملف محفوظة بدقة
 */
import { describe, it, expect } from "vitest";
import { parseBdatFile, extractBdatStrings, BdatValueType } from "@/lib/bdat-parser";
import { patchBdatFile } from "@/lib/bdat-writer";

/** Build a minimal Legacy BDAT binary with one table containing string columns */
function buildLegacyBdat(strings: string[]): Uint8Array {
  const encoder = new TextEncoder();

  // --- Table layout (32-byte header, no XCDE extensions) ---
  // Header: 32 bytes
  // Column infos: 1 col × 4 bytes = 4 bytes (cellType=1, valueType=7(String), rowOffset=0)
  // Column nodes: 1 col × 6 bytes = 6 bytes
  // Name table: "TestTable\0" + "caption\0"
  // Hash table: 4 slots × 4 bytes = 16 bytes (simplified — all zeros)
  // Row data: N rows × 4 bytes (u32 absolute pointer each)
  // String table: null-separated strings

  const tableName = "TestTable_ms";
  const colName = "caption";
  const tableNameBytes = encoder.encode(tableName + "\0");
  const colNameBytes = encoder.encode(colName + "\0");

  const headerSize = 32;
  // Column info right after header
  const colInfoOffset = headerSize;
  const colInfoSize = 4; // cellType(1) + valueType(1) + rowOffset(u16)
  // Column node right after col info
  const colNodeOffset = colInfoOffset + colInfoSize;
  const colNodeSize = 6; // infoOffset(u16) + linkedNode(u16) + nameOffset(u16)
  // Name table after col nodes
  const nameTableOffset = colNodeOffset + colNodeSize;
  const nameTableSize = tableNameBytes.length + colNameBytes.length;
  // Hash table after name table
  const hashTableOffset = nameTableOffset + nameTableSize;
  const hashSlotCount = 4;
  const hashTableSize = hashSlotCount * 4;
  // Row data after hash table
  const rowDataOffset = hashTableOffset + hashTableSize;
  const rowLength = 4; // one u32 string pointer per row
  const rowCount = strings.length;
  const rowDataSize = rowCount * rowLength;
  // String table after row data
  const stringTableOffset = rowDataOffset + rowDataSize;

  // Build string table bytes
  const stringBytes: Uint8Array[] = [];
  const stringOffsets: number[] = [];
  let strPos = 0;
  for (const s of strings) {
    stringOffsets.push(strPos);
    const b = encoder.encode(s + "\0");
    stringBytes.push(b);
    strPos += b.length;
  }
  const stringTableLength = strPos;
  const tableSize = stringTableOffset + stringTableLength;

  // --- Build table data ---
  const tableData = new Uint8Array(tableSize);
  const view = new DataView(tableData.buffer);

  // Header
  tableData.set(encoder.encode("BDAT"), 0); // magic
  tableData[4] = 0; // flags (no scramble)
  tableData[5] = 0; // pad
  view.setUint16(0x06, nameTableOffset, true); // nameTableOffset
  view.setUint16(0x08, rowLength, true); // rowLength
  view.setUint16(0x0A, hashTableOffset, true); // hashTableOffset
  view.setUint16(0x0C, hashSlotCount, true); // hashSlotCount
  view.setUint16(0x0E, rowDataOffset, true); // rowDataOffset
  view.setUint16(0x10, rowCount, true); // rowCount
  view.setUint16(0x12, 0, true); // baseId
  view.setUint16(0x14, 0, true); // unknown
  view.setUint16(0x16, 0, true); // scrambleKey = 0
  view.setUint32(0x18, stringTableOffset, true); // stringTableOffset
  view.setUint32(0x1C, stringTableLength, true); // stringTableLength

  // Column info at colInfoOffset: cellType=1(Value), valueType=7(String), rowOffset=0
  tableData[colInfoOffset] = 1;
  tableData[colInfoOffset + 1] = 7; // BdatValueType.String
  view.setUint16(colInfoOffset + 2, 0, true); // rowOffset = 0

  // Column node at colNodeOffset
  view.setUint16(colNodeOffset, colInfoOffset, true); // infoOffset
  view.setUint16(colNodeOffset + 2, 0, true); // linkedNode = 0
  view.setUint16(colNodeOffset + 4, nameTableOffset + tableNameBytes.length, true); // nameOffset → "caption"

  // Name table
  tableData.set(tableNameBytes, nameTableOffset);
  tableData.set(colNameBytes, nameTableOffset + tableNameBytes.length);

  // Hash table (zeros — we don't need it for parsing)

  // Row data: write ABSOLUTE pointers to string table
  for (let r = 0; r < rowCount; r++) {
    const absPtr = stringTableOffset + stringOffsets[r];
    view.setUint32(rowDataOffset + r * rowLength, absPtr, true);
  }

  // String table
  let writePos = stringTableOffset;
  for (const b of stringBytes) {
    tableData.set(b, writePos);
    writePos += b.length;
  }

  // --- Build file: Legacy header (count + offsets) ---
  // File header: tableCount(u32) + 1 table offset(u32)
  const fileHeaderSize = 4 + 1 * 4; // 8 bytes
  const fileData = new Uint8Array(fileHeaderSize + tableSize);
  const fileView = new DataView(fileData.buffer);

  fileView.setUint32(0, 1, true); // tableCount = 1
  fileView.setUint32(4, fileHeaderSize, true); // offset to table

  fileData.set(tableData, fileHeaderSize);

  return fileData;
}

describe("Legacy BDAT Integration: Parse → Patch → Verify", () => {
  it("should parse, patch, and write absolute string pointers correctly", () => {
    const originalStrings = ["Hello World", "Quest Name", "Party"];
    const fileData = buildLegacyBdat(originalStrings);

    // Step 1: Parse
    const parsed = parseBdatFile(fileData);
    expect(parsed.tables.length).toBe(1);
    const table = parsed.tables[0];
    expect(table.name).toBe("TestTable_ms");
    expect(table.rows.length).toBe(3);
    expect(table.rows[0].values["caption"]).toBe("Hello World");
    expect(table.rows[1].values["caption"]).toBe("Quest Name");
    expect(table.rows[2].values["caption"]).toBe("Party");
    expect(table._raw.isLegacy).toBe(true);

    // Step 2: Build translation map
    const translations = new Map<string, string>();
    translations.set("TestTable_ms:0:caption", "مرحبا بالعالم");
    translations.set("TestTable_ms:1:caption", "اسم المهمة");
    translations.set("TestTable_ms:2:caption", "الفريق");

    // Step 3: Patch
    const result = patchBdatFile(parsed, translations);
    expect(result.patchedCount).toBe(3);
    expect(result.overflowErrors.length).toBe(0);

    // Step 4: Re-parse the patched file
    const reparsed = parseBdatFile(result.result);
    expect(reparsed.tables.length).toBe(1);
    const patchedTable = reparsed.tables[0];
    expect(patchedTable.rows[0].values["caption"]).toBe("مرحبا بالعالم");
    expect(patchedTable.rows[1].values["caption"]).toBe("اسم المهمة");
    expect(patchedTable.rows[2].values["caption"]).toBe("الفريق");
  });

  it("should verify absolute pointers in raw binary", () => {
    const fileData = buildLegacyBdat(["ABC", "XY"]);
    const parsed = parseBdatFile(fileData);

    const translations = new Map<string, string>();
    translations.set("TestTable_ms:0:caption", "مرحبا");
    // Leave row 1 untranslated

    const result = patchBdatFile(parsed, translations);
    expect(result.patchedCount).toBe(1);

    // Verify raw binary: pointers should be absolute from table start
    const patchedData = result.result;
    const tableOffset = new DataView(patchedData.buffer).getUint32(4, true);
    const tableView = new DataView(patchedData.buffer, tableOffset);

    const strTableOff = tableView.getUint32(0x18, true);
    const strTableLen = tableView.getUint32(0x1C, true);

    // Row data offset
    const rowDataOff = tableView.getUint16(0x0E, true);

    // Read row 0 pointer — should be absolute (>= stringTableOffset)
    const ptr0 = tableView.getUint32(rowDataOff, true);
    expect(ptr0).toBeGreaterThanOrEqual(strTableOff);
    expect(ptr0).toBeLessThan(strTableOff + strTableLen);

    // Read the string at ptr0 — should be Arabic
    const strBytes: number[] = [];
    let i = tableOffset + ptr0;
    while (i < patchedData.length && patchedData[i] !== 0) {
      strBytes.push(patchedData[i]);
      i++;
    }
    const str0 = new TextDecoder().decode(new Uint8Array(strBytes));
    expect(str0).toBe("مرحبا");

    // Read row 1 pointer — untranslated, should still be absolute and valid
    const ptr1 = tableView.getUint32(rowDataOff + 4, true);
    expect(ptr1).toBeGreaterThanOrEqual(strTableOff);
    const strBytes1: number[] = [];
    let j = tableOffset + ptr1;
    while (j < patchedData.length && patchedData[j] !== 0) {
      strBytes1.push(patchedData[j]);
      j++;
    }
    const str1 = new TextDecoder().decode(new Uint8Array(strBytes1));
    expect(str1).toBe("XY");
  });

  it("should preserve file header structure (offset array)", () => {
    const fileData = buildLegacyBdat(["Test"]);

    // Original: count=1, offset[0]=8
    const origView = new DataView(fileData.buffer);
    expect(origView.getUint32(0, true)).toBe(1); // count

    const parsed = parseBdatFile(fileData);
    const translations = new Map<string, string>();
    translations.set("TestTable_ms:0:caption", "اختبار");

    const result = patchBdatFile(parsed, translations);
    const patchedView = new DataView(result.result.buffer);

    // Count should still be 1
    expect(patchedView.getUint32(0, true)).toBe(1);
    // Offset should still point to a valid BDAT table
    const off = patchedView.getUint32(4, true);
    expect(result.result[off]).toBe(0x42); // 'B'
    expect(result.result[off + 1]).toBe(0x44); // 'D'
    expect(result.result[off + 2]).toBe(0x41); // 'A'
    expect(result.result[off + 3]).toBe(0x54); // 'T'
  });

  it("should update stringTableLength at offset 0x1C in legacy header", () => {
    const fileData = buildLegacyBdat(["Hi"]);
    const parsed = parseBdatFile(fileData);

    const origStrLen = parsed.tables[0]._raw.stringTableLength;

    // Arabic translation is longer than "Hi"
    const translations = new Map<string, string>();
    translations.set("TestTable_ms:0:caption", "مرحبا بالعالم الجميل");

    const result = patchBdatFile(parsed, translations);
    const tableOffset = new DataView(result.result.buffer).getUint32(4, true);
    const tableView = new DataView(result.result.buffer, tableOffset);

    const newStrLen = tableView.getUint32(0x1C, true);
    // New string table should be larger since Arabic text is longer
    expect(newStrLen).toBeGreaterThan(origStrLen);
  });
});
