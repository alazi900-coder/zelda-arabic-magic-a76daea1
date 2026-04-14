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

  it("should write correct sentinel entry at end of offset table", () => {
    // Build a legacy file with 2 tables
    const buildTable = (name: string, text: string) => {
      const enc = new TextEncoder();
      const nameBytes = enc.encode(name);
      const textBytes = enc.encode(text);
      const headerSize = 64;
      const colInfoSize = 4;
      const colNodeSize = 6;
      const rowDataOffset = headerSize + colInfoSize + colNodeSize;
      const rowLength = 4;
      const rowCount = 1;
      const hashTableOffset = rowDataOffset + rowLength * rowCount;
      const nameTableOffset = hashTableOffset;
      const stringTableOffset = nameTableOffset + nameBytes.length + 1;
      const stringTableLength = 1 + nameBytes.length + 1 + textBytes.length + 1;
      const totalSize = stringTableOffset + stringTableLength;
      const buf = new Uint8Array(totalSize);
      const v = new DataView(buf.buffer);
      buf.set([0x42, 0x44, 0x41, 0x54]); // BDAT
      buf[4] = 0; // flags
      v.setUint16(0x06, nameTableOffset, true);
      v.setUint16(0x08, rowLength, true);
      v.setUint16(0x0A, hashTableOffset, true);
      v.setUint16(0x0C, 0, true);
      v.setUint16(0x0E, rowDataOffset, true);
      v.setUint16(0x10, rowCount, true);
      v.setUint16(0x12, 0, true);
      v.setUint16(0x16, 0, true);
      v.setUint32(0x18, stringTableOffset, true);
      v.setUint32(0x1C, stringTableLength, true);
      v.setUint16(0x20, headerSize, true);
      v.setUint16(0x22, 1, true);
      // col info (Value, String, offset 0)
      buf[headerSize] = 1; buf[headerSize + 1] = 7;
      v.setUint16(headerSize + 2, 0, true);
      // col node
      const nodeOff = headerSize;
      v.setUint16(nodeOff + 4, nameTableOffset, true); // name → table name
      v.setUint16(headerSize + colInfoSize, headerSize, true); // infoOffset
      v.setUint16(headerSize + colInfoSize + 2, 0, true); // linked
      v.setUint16(headerSize + colInfoSize + 4, nameTableOffset, true); // nameOffset → reuse table name
      // row data: absolute pointer to text string
      const textAbsOff = stringTableOffset + 1 + nameBytes.length + 1;
      v.setUint32(rowDataOffset, textAbsOff, true);
      // name table
      buf.set(nameBytes, nameTableOffset);
      buf[nameTableOffset + nameBytes.length] = 0;
      // string table: flag(0) + name + text
      buf[stringTableOffset] = 0;
      buf.set(nameBytes, stringTableOffset + 1);
      buf[stringTableOffset + 1 + nameBytes.length] = 0;
      buf.set(textBytes, textAbsOff);
      buf[textAbsOff + textBytes.length] = 0;
      return buf;
    };

    const t1 = buildTable("TableA_ms", "Hello");
    const t2 = buildTable("TableB_ms", "World");
    // Legacy file: u32 count + (count+1) u32 offsets + table data
    const count = 2;
    const headerSize = 4 + (count + 1) * 4; // 16 bytes
    const fileSize = headerSize + t1.length + t2.length;
    const file = new Uint8Array(fileSize);
    const fv = new DataView(file.buffer);
    fv.setUint32(0, count, true);
    fv.setUint32(4, headerSize, true); // table 0 offset
    fv.setUint32(8, headerSize + t1.length, true); // table 1 offset
    fv.setUint32(12, fileSize, true); // sentinel
    file.set(t1, headerSize);
    file.set(t2, headerSize + t1.length);

    const parsed = parseBdatFile(file);
    expect(parsed.tables.length).toBe(2);

    const translations = new Map<string, string>();
    translations.set("TableA_ms:0:TableA_ms", "مرحبا بالعالم العربي");
    const { result } = patchBdatFile(parsed, translations);

    // Verify sentinel
    const rv = new DataView(result.buffer);
    const newCount = rv.getUint32(0, true);
    expect(newCount).toBe(2);
    const sentinel = rv.getUint32(4 + newCount * 4, true);
    expect(sentinel).toBe(result.byteLength); // sentinel must equal file size

    // Verify no "BDAT" written into offset table area
    for (let i = 0; i <= newCount; i++) {
      const off = rv.getUint32(4 + i * 4, true);
      // Offset must be a valid position, not 0x54414442 ("BDAT" as int)
      expect(off).not.toBe(0x54414442);
    }
  });
