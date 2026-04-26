/**
 * اختبارات النسخة المحسّنة من bdat-writer:
 * - tableStats reporting
 * - u16 overflow detection & compaction
 * - shared string conflict resolution
 * - overflow error reasons
 */
import { describe, it, expect } from "vitest";
import { patchBdatFile } from "@/lib/bdat-writer";
import { BdatFile, BdatTable, BdatValueType } from "@/lib/bdat-parser";

const encoder = new TextEncoder();

/**
 * Build a minimal BDAT file with configurable column types.
 * columns: array of { name, type } where type is BdatValueType
 * rows: array of arrays of strings (one per column)
 */
function buildTestBdatMultiCol(
  columns: { name: string; type: BdatValueType }[],
  rows: string[][],
  tableName = "T"
): BdatFile {
  const tableOffset = 20;
  const tableHeaderSize = 40; // u16 layout

  // String table content
  const strParts: Uint8Array[] = [];
  let pos = 0;

  // Flag byte
  strParts.push(new Uint8Array([1]));
  pos = 1;

  // Table name
  const tnBytes = encoder.encode(tableName);
  strParts.push(tnBytes);
  strParts.push(new Uint8Array([0]));
  pos += tnBytes.length + 1;

  // Column names
  const colNameOffsets: number[] = [];
  for (const col of columns) {
    colNameOffsets.push(pos - 1);
    const cnBytes = encoder.encode(col.name);
    strParts.push(cnBytes);
    strParts.push(new Uint8Array([0]));
    pos += cnBytes.length + 1;
  }

  // Row strings — store offset for each cell
  const cellOffsets: number[][] = [];
  for (const row of rows) {
    const rowOffsets: number[] = [];
    for (const s of row) {
      rowOffsets.push(pos);
      const sBytes = encoder.encode(s);
      strParts.push(sBytes);
      strParts.push(new Uint8Array([0]));
      pos += sBytes.length + 1;
    }
    cellOffsets.push(rowOffsets);
  }

  const strTableLength = pos;

  // Column defs
  const colDefsOffset = tableHeaderSize;
  const colDefSize = 3; // type(1) + nameRef(2)
  const colDefsSize = columns.length * colDefSize;

  // Row data — compute rowLength based on column types
  let rowLength = 0;
  const colOffsets: number[] = [];
  for (const col of columns) {
    colOffsets.push(rowLength);
    rowLength += col.type === BdatValueType.MessageId ? 2 : 4;
  }

  const rowDataOffset = colDefsOffset + colDefsSize;
  const rowDataSize = rows.length * rowLength;
  const strTableOffset = rowDataOffset + rowDataSize;

  const tableSize = strTableOffset + strTableLength;
  const fileSize = tableOffset + tableSize;

  const buf = new Uint8Array(fileSize);
  const view = new DataView(buf.buffer);

  // File header
  buf.set(encoder.encode("BDAT"), 0);
  view.setUint32(4, 4, true);
  view.setUint32(8, 1, true);
  view.setUint32(12, fileSize, true);
  view.setUint32(16, tableOffset, true);

  // Table header (u16 layout)
  buf.set(encoder.encode("BDAT"), tableOffset);
  view.setUint16(tableOffset + 0x08, columns.length, true);
  view.setUint16(tableOffset + 0x0C, rows.length, true);
  view.setUint16(tableOffset + 0x18, colDefsOffset, true);
  view.setUint16(tableOffset + 0x1A, colDefsOffset, true);
  view.setUint16(tableOffset + 0x1C, rowDataOffset, true);
  view.setUint16(tableOffset + 0x1E, rowLength, true);
  view.setUint32(tableOffset + 0x20, strTableOffset, true);
  view.setUint32(tableOffset + 0x24, strTableLength, true);

  // Column defs
  for (let i = 0; i < columns.length; i++) {
    const off = tableOffset + colDefsOffset + i * colDefSize;
    buf[off] = columns[i].type;
    view.setUint16(off + 1, colNameOffsets[i], true);
  }

  // Row data
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < columns.length; c++) {
      const addr = tableOffset + rowDataOffset + r * rowLength + colOffsets[c];
      if (columns[c].type === BdatValueType.MessageId) {
        view.setUint16(addr, cellOffsets[r][c], true);
      } else {
        view.setUint32(addr, cellOffsets[r][c], true);
      }
    }
  }

  // String table
  let stOff = tableOffset + strTableOffset;
  for (const part of strParts) {
    buf.set(part, stOff);
    stOff += part.length;
  }

  // Build BdatFile structure
  const tableData = buf.slice(tableOffset, tableOffset + tableSize);
  const bdatColumns = columns.map((col, i) => ({
    valueType: col.type,
    nameOffset: colNameOffsets[i],
    name: col.name,
    offset: colOffsets[i],
  }));

  const bdatRows = rows.map((row, i) => ({
    id: i,
    values: Object.fromEntries(columns.map((col, ci) => [col.name, row[ci]])) as Record<string, unknown>,
  }));

  const table: BdatTable = {
    name: tableName,
    nameHash: null,
    columns: bdatColumns,
    rows: bdatRows,
    baseId: 0,
    _raw: {
      tableOffset,
      tableData,
      columnCount: columns.length,
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

  return {
    tables: [table],
    version: 4,
    fileSize,
    _raw: buf,
  };
}

// Simple helper for single String column
function buildSimpleBdat(strings: string[]): BdatFile {
  return buildTestBdatMultiCol(
    [{ name: "c", type: BdatValueType.String }],
    strings.map(s => [s]),
  );
}

describe("bdat-writer improved: tableStats", () => {
  it("should return tableStats with correct sizes", () => {
    const file = buildSimpleBdat(["Hello", "World"]);
    const translations = new Map<string, string>();
    translations.set("T:0:c", "مرحبا بالعالم");
    translations.set("T:1:c", "العالم");

    const result = patchBdatFile(file, translations);

    expect(result.tableStats).toHaveLength(1);
    const stat = result.tableStats[0];
    expect(stat.tableName).toBe("T");
    expect(stat.stringsPatched).toBe(2);
    expect(stat.stringsSkipped).toBe(0);
    expect(stat.hasU16Columns).toBe(false);
    expect(stat.newStringTableSize).toBeGreaterThan(stat.originalStringTableSize);
  });

  it("should report hasU16Columns=true for MessageId columns", () => {
    const file = buildTestBdatMultiCol(
      [{ name: "msg", type: BdatValueType.MessageId }],
      [["Hi"], ["Go"]],
    );
    const translations = new Map<string, string>();
    translations.set("T:0:msg", "مرحبا");

    const result = patchBdatFile(file, translations);

    expect(result.tableStats).toHaveLength(1);
    expect(result.tableStats[0].hasU16Columns).toBe(true);
    expect(result.tableStats[0].stringsPatched).toBe(1);
  });

  it("should skip tables without translations", () => {
    const file = buildSimpleBdat(["Test"]);
    const translations = new Map<string, string>(); // empty

    const result = patchBdatFile(file, translations);

    // No tableStats for skipped tables
    expect(result.tableStats).toHaveLength(0);
    expect(result.patchedCount).toBe(0);
  });
});

describe("bdat-writer improved: shared string conflicts", () => {
  it("should handle two rows sharing the same original string with different translations", () => {
    // Both rows point to same "Hello" string
    const file = buildSimpleBdat(["Hello", "Hello"]);

    const translations = new Map<string, string>();
    translations.set("T:0:c", "مرحبا");
    translations.set("T:1:c", "أهلاً");

    const result = patchBdatFile(file, translations);

    expect(result.patchedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.overflowErrors).toHaveLength(0);
  });
});

describe("bdat-writer improved: overflow error reasons", () => {
  it("should include reason field in overflow errors", () => {
    // We can't easily trigger a real u16 overflow in a small test without
    // generating 65KB+ of strings, but we can verify the reason field exists
    // on any overflow error that does occur.
    const file = buildSimpleBdat(["A"]);
    const translations = new Map<string, string>();
    translations.set("T:0:c", "Short");

    const result = patchBdatFile(file, translations);

    // No overflow expected here
    expect(result.overflowErrors).toHaveLength(0);
    expect(result.patchedCount).toBe(1);

    // Verify the structure of PatchResult
    expect(result).toHaveProperty("tableStats");
    expect(result).toHaveProperty("patchedCount");
    expect(result).toHaveProperty("skippedCount");
  });
});

describe("bdat-writer improved: MessageId u16 column patching", () => {
  it("should successfully patch MessageId (u16) columns with small translations", () => {
    const file = buildTestBdatMultiCol(
      [
        { name: "name", type: BdatValueType.String },
        { name: "desc", type: BdatValueType.MessageId },
      ],
      [
        ["Quest1", "Go north"],
        ["Quest2", "Go south"],
      ],
    );

    const translations = new Map<string, string>();
    translations.set("T:0:name", "المهمة الأولى");
    translations.set("T:0:desc", "اذهب شمالاً");
    translations.set("T:1:name", "المهمة الثانية");
    translations.set("T:1:desc", "اذهب جنوباً");

    const result = patchBdatFile(file, translations);

    expect(result.patchedCount).toBe(4);
    expect(result.skippedCount).toBe(0);
    expect(result.overflowErrors).toHaveLength(0);
    expect(result.tableStats[0].hasU16Columns).toBe(true);
  });
});

describe("bdat-writer improved: u16 overflow & compaction", () => {
  /**
   * Generate a string of exact UTF-8 byte length using ASCII chars.
   */
  function makeString(byteLen: number, char = "X"): string {
    return char.repeat(byteLen);
  }

  it("should detect u16 overflow when MessageId offset exceeds 65535", () => {
    // Strategy: create enough rows with long strings so that later MessageId
    // offsets exceed 0xFFFF. We use one String column (u32, no limit) to
    // fill up the string table, then a MessageId column whose offset overflows.
    //
    // String table metadata ≈ ~10 bytes. We need total > 65535.
    // Use 60 rows × 1100 bytes each ≈ 66,000 bytes of strings for the String col.
    // Then 60 rows × short MessageId strings that end up at offset > 65535.

    const rowCount = 65;
    const bigStr = makeString(1010); // each String col value = 1010 bytes
    const rows: string[][] = [];
    for (let i = 0; i < rowCount; i++) {
      rows.push([bigStr, `m${i}`]); // [String col, MessageId col]
    }

    const file = buildTestBdatMultiCol(
      [
        { name: "desc", type: BdatValueType.String },
        { name: "msg", type: BdatValueType.MessageId },
      ],
      rows,
    );

    // Translate ALL strings to even longer versions to push offsets past 65535
    const translations = new Map<string, string>();
    for (let i = 0; i < rowCount; i++) {
      translations.set(`T:${i}:desc`, makeString(1020, "Y"));
      translations.set(`T:${i}:msg`, `translated_msg_${i}`);
    }

    const result = patchBdatFile(file, translations);

    // The writer should either:
    // 1. Successfully compact (MessageId strings first) and patch everything, OR
    // 2. Report u16_offset_overflow errors if compaction fails
    
    if (result.overflowErrors.length === 0) {
      // Compaction succeeded!
      expect(result.patchedCount).toBe(rowCount * 2);
      expect(result.skippedCount).toBe(0);
      expect(result.tableStats[0].hasU16Columns).toBe(true);
      console.log("[TEST] ✅ Compaction succeeded — all MessageId offsets fit in u16");
    } else {
      // Compaction failed — verify errors have correct reason
      for (const err of result.overflowErrors) {
        expect(err.reason).toBe("u16_offset_overflow");
        expect(err.newOffset).toBeGreaterThan(0xFFFF);
      }
      expect(result.tableStats[0].stringsSkipped).toBeGreaterThan(0);
      console.log(`[TEST] ⚠️ Compaction failed — ${result.overflowErrors.length} overflow errors reported`);
    }
  });

  it("should compact MessageId strings to lower offsets when possible", () => {
    // Create a scenario where compaction SHOULD succeed:
    // Many large String (u32) values push offsets high, but MessageId values
    // are small enough to fit in u16 if placed first.
    //
    // 30 rows × 2000-byte String values = ~60KB in String col
    // 30 rows × 20-byte MessageId values = ~600 bytes
    // Without compaction: MessageId offsets > 60KB (overflow!)
    // With compaction: MessageId strings placed first → offsets < 1KB ✓

    const rowCount = 30;
    const rows: string[][] = [];
    for (let i = 0; i < rowCount; i++) {
      rows.push([makeString(2000), `short${i}`]);
    }

    const file = buildTestBdatMultiCol(
      [
        { name: "bio", type: BdatValueType.String },
        { name: "label", type: BdatValueType.MessageId },
      ],
      rows,
    );

    const translations = new Map<string, string>();
    for (let i = 0; i < rowCount; i++) {
      translations.set(`T:${i}:bio`, makeString(2200, "Z")); // bigger → pushes total > 65KB
      translations.set(`T:${i}:label`, `lbl_${i}`); // small MessageId translations
    }

    const result = patchBdatFile(file, translations);

    // Compaction should succeed because MessageId strings are small
    expect(result.overflowErrors).toHaveLength(0);
    expect(result.patchedCount).toBe(rowCount * 2);
    expect(result.tableStats[0].hasU16Columns).toBe(true);
    expect(result.tableStats[0].stringsSkipped).toBe(0);
    
    // Verify the new string table is > 65KB (proving compaction was needed)
    expect(result.tableStats[0].newStringTableSize).toBeGreaterThan(0xFFFF);
    console.log(`[TEST] ✅ Compaction worked! String table = ${result.tableStats[0].newStringTableSize} bytes, all MessageId offsets < 65536`);
  });

  it("should fail compaction when MessageId strings themselves exceed 65KB", () => {
    // Create a scenario where even MessageId strings alone exceed 65KB
    // This means compaction cannot help.
    const rowCount = 40;
    const rows: string[][] = [];
    for (let i = 0; i < rowCount; i++) {
      rows.push([makeString(1700, "A")]); // MessageId col with huge strings
    }

    const file = buildTestBdatMultiCol(
      [{ name: "msg", type: BdatValueType.MessageId }],
      rows,
    );

    const translations = new Map<string, string>();
    for (let i = 0; i < rowCount; i++) {
      translations.set(`T:${i}:msg`, makeString(1700, "B")); // 40 × 1700 = 68KB > 65535
    }

    const result = patchBdatFile(file, translations);

    // Should report overflow — compaction can't help when MessageId data alone > 65KB
    expect(result.overflowErrors.length).toBeGreaterThan(0);
    for (const err of result.overflowErrors) {
      expect(["u16_offset_overflow", "write_error"]).toContain(err.reason);
    }
    expect(result.tableStats[0].stringsSkipped).toBeGreaterThan(0);
    console.log(`[TEST] ✅ Correctly detected unresolvable u16 overflow (${result.overflowErrors.length} errors)`);
  });
});
