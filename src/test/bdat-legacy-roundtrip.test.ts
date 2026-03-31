/**
 * اختبار تكاملي: بناء ملف Legacy BDAT والتحقق من المؤشرات المطلقة
 */
import { describe, it, expect } from "vitest";
import { parseBdatFile, BdatValueType } from "@/lib/bdat-parser";
import { patchBdatFile } from "@/lib/bdat-writer";

/** Build a minimal Legacy BDAT binary (XCDE 64-byte header) with one table */
function buildLegacyBdat(strings: string[]): Uint8Array {
  const encoder = new TextEncoder();
  const tableName = "TestTable_ms";
  const colName = "caption";
  const tableNameBytes = encoder.encode(tableName + "\0");
  const colNameBytes = encoder.encode(colName + "\0");

  const headerSize = 64; // XCDE format

  // Layout after header:
  // 1. Column infos (1 col × 4 bytes)
  const colInfoOffset = headerSize;
  const colInfoSize = 4;
  // 2. Column nodes (1 col × 6 bytes)
  const colNodeOffset = colInfoOffset + colInfoSize;
  const colNodeSize = 6;
  // 3. Name table (tableName + colName)
  const nameTableOffset = colNodeOffset + colNodeSize;
  const nameTableSize = tableNameBytes.length + colNameBytes.length;
  // 4. Hash table (4 slots × 4 bytes, zeroed)
  const hashTableOffset = nameTableOffset + nameTableSize;
  const hashSlotCount = 4;
  const hashTableSize = hashSlotCount * 4;
  // 5. Row data
  const rowDataOffset = hashTableOffset + hashTableSize;
  const rowLength = 4; // one u32 per row
  const rowCount = strings.length;
  const rowDataSize = rowCount * rowLength;
  // 6. String table
  const stringTableOffset = rowDataOffset + rowDataSize;

  // Build string table
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
  const tableSize = stringTableOffset + stringTableLength;

  const tableData = new Uint8Array(tableSize);
  const view = new DataView(tableData.buffer);

  // --- 64-byte XCDE header ---
  tableData.set(encoder.encode("BDAT"), 0);
  tableData[4] = 0; // flags
  tableData[5] = 0; // pad
  view.setUint16(0x06, nameTableOffset, true);
  view.setUint16(0x08, rowLength, true);
  view.setUint16(0x0A, hashTableOffset, true);
  view.setUint16(0x0C, hashSlotCount, true);
  view.setUint16(0x0E, rowDataOffset, true);
  view.setUint16(0x10, rowCount, true);
  view.setUint16(0x12, 0, true); // baseId
  view.setUint16(0x14, 0, true); // unknown
  view.setUint16(0x16, 0, true); // scrambleKey
  view.setUint32(0x18, stringTableOffset, true);
  view.setUint32(0x1C, stringTableLength, true);
  // XCDE fields
  view.setUint16(0x20, colNodeOffset, true); // colNodeOffset
  view.setUint16(0x22, 1, true); // colNodeCount = 1

  // Column info: cellType=1(Value), valueType=7(String), rowOffset=0
  tableData[colInfoOffset] = 1;
  tableData[colInfoOffset + 1] = 7;
  view.setUint16(colInfoOffset + 2, 0, true);

  // Column node: infoOffset, linkedNode=0, nameOffset → colName
  view.setUint16(colNodeOffset, colInfoOffset, true);
  view.setUint16(colNodeOffset + 2, 0, true);
  view.setUint16(colNodeOffset + 4, nameTableOffset + tableNameBytes.length, true);

  // Name table
  tableData.set(tableNameBytes, nameTableOffset);
  tableData.set(colNameBytes, nameTableOffset + tableNameBytes.length);

  // Row data: ABSOLUTE pointers from table start
  for (let r = 0; r < rowCount; r++) {
    view.setUint32(rowDataOffset + r * rowLength, stringTableOffset + stringOffsets[r], true);
  }

  // String table
  let wp = stringTableOffset;
  for (const b of stringBufs) {
    tableData.set(b, wp);
    wp += b.length;
  }

  // --- File header: count(u32) + offset(u32) ---
  const fileHeaderSize = 8;
  const fileData = new Uint8Array(fileHeaderSize + tableSize);
  const fv = new DataView(fileData.buffer);
  fv.setUint32(0, 1, true);
  fv.setUint32(4, fileHeaderSize, true);
  fileData.set(tableData, fileHeaderSize);

  return fileData;
}

describe("Legacy BDAT Integration: Parse → Patch → Verify", () => {
  it("should roundtrip: parse → translate → patch → re-parse", () => {
    const fileData = buildLegacyBdat(["Hello World", "Quest Name", "Party"]);
    const parsed = parseBdatFile(fileData);

    expect(parsed.tables.length).toBe(1);
    const table = parsed.tables[0];
    expect(table.name).toBe("TestTable_ms");
    expect(table.rows.length).toBe(3);
    expect(table.rows[0].values["caption"]).toBe("Hello World");
    expect(table.rows[1].values["caption"]).toBe("Quest Name");
    expect(table.rows[2].values["caption"]).toBe("Party");
    expect(table._raw.isLegacy).toBe(true);

    const translations = new Map<string, string>();
    translations.set("TestTable_ms:0:caption", "مرحبا بالعالم");
    translations.set("TestTable_ms:1:caption", "اسم المهمة");
    translations.set("TestTable_ms:2:caption", "الفريق");

    const result = patchBdatFile(parsed, translations);
    expect(result.patchedCount).toBe(3);
    expect(result.overflowErrors.length).toBe(0);

    const reparsed = parseBdatFile(result.result);
    expect(reparsed.tables.length).toBe(1);
    expect(reparsed.tables[0].rows[0].values["caption"]).toBe("مرحبا بالعالم");
    expect(reparsed.tables[0].rows[1].values["caption"]).toBe("اسم المهمة");
    expect(reparsed.tables[0].rows[2].values["caption"]).toBe("الفريق");
  });

  it("should write absolute pointers in raw binary", () => {
    const fileData = buildLegacyBdat(["ABC", "XY"]);
    const parsed = parseBdatFile(fileData);

    const translations = new Map<string, string>();
    translations.set("TestTable_ms:0:caption", "مرحبا");

    const result = patchBdatFile(parsed, translations);
    expect(result.patchedCount).toBe(1);

    const patchedData = result.result;
    const tableOffset = new DataView(patchedData.buffer).getUint32(4, true);
    const tv = new DataView(patchedData.buffer, tableOffset);

    const strTableOff = tv.getUint32(0x18, true);
    const strTableLen = tv.getUint32(0x1C, true);
    const rowDataOff = tv.getUint16(0x0E, true);

    // Row 0 pointer should be absolute and within string table
    const ptr0 = tv.getUint32(rowDataOff, true);
    expect(ptr0).toBeGreaterThanOrEqual(strTableOff);
    expect(ptr0).toBeLessThan(strTableOff + strTableLen);

    // Read the string at ptr0
    const readStr = (absPtr: number) => {
      const bytes: number[] = [];
      let i = tableOffset + absPtr;
      while (i < patchedData.length && patchedData[i] !== 0) {
        bytes.push(patchedData[i]);
        i++;
      }
      return new TextDecoder().decode(new Uint8Array(bytes));
    };

    expect(readStr(ptr0)).toBe("مرحبا");

    // Row 1 untranslated — still valid absolute pointer
    const ptr1 = tv.getUint32(rowDataOff + 4, true);
    expect(ptr1).toBeGreaterThanOrEqual(strTableOff);
    expect(readStr(ptr1)).toBe("XY");
  });

  it("should preserve file header structure", () => {
    const fileData = buildLegacyBdat(["Test"]);
    const parsed = parseBdatFile(fileData);

    const translations = new Map<string, string>();
    translations.set("TestTable_ms:0:caption", "اختبار");

    const result = patchBdatFile(parsed, translations);
    const pv = new DataView(result.result.buffer);

    expect(pv.getUint32(0, true)).toBe(1); // count preserved
    const off = pv.getUint32(4, true);
    // BDAT magic at table offset
    expect(String.fromCharCode(...result.result.slice(off, off + 4))).toBe("BDAT");
  });

  it("should update stringTableLength at 0x1C for larger translations", () => {
    const fileData = buildLegacyBdat(["Hi"]);
    const parsed = parseBdatFile(fileData);
    const origStrLen = parsed.tables[0]._raw.stringTableLength;

    const translations = new Map<string, string>();
    translations.set("TestTable_ms:0:caption", "مرحبا بالعالم الجميل والكبير");

    const result = patchBdatFile(parsed, translations);
    const tableOffset = new DataView(result.result.buffer).getUint32(4, true);
    const newStrLen = new DataView(result.result.buffer, tableOffset).getUint32(0x1C, true);

    expect(newStrLen).toBeGreaterThan(origStrLen);
  });
});
