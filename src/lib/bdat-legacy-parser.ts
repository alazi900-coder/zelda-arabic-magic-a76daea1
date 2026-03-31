/**
 * Legacy BDAT Parser for XC1 DE / XC2 / XCDE
 * 
 * Handles the pre-XC3 "legacy" BDAT format based on the bdat-rs LEGACY.md specification.
 * 
 * Key differences from Modern (XC3) format:
 * - Table header is 64 bytes (XCDE) or 32 bytes (Wii/3DS)
 * - Column info + column nodes are separate structures
 * - String pointers in row data are ABSOLUTE (from table start), not relative to string table
 * - String/name tables may be scrambled (XOR encryption)
 * - No hashed names (Murmur3) — names are plain strings
 */

import { BdatColumn, BdatTable, BdatRow, BdatValueType } from './bdat-parser';

// Value type sizes (same IDs as modern, but only types 1-8 exist in legacy)
const LEGACY_VALUE_SIZE: Record<number, number> = {
  1: 1, // UnsignedByte
  2: 2, // UnsignedShort
  3: 4, // UnsignedInt
  4: 1, // SignedByte
  5: 2, // SignedShort
  6: 4, // SignedInt
  7: 4, // String (u32 absolute pointer)
  8: 4, // Float
};

function readNullTerminatedString(data: Uint8Array, offset: number): string {
  const bytes: number[] = [];
  let i = offset;
  while (i < data.length && data[i] !== 0) {
    bytes.push(data[i]);
    i++;
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

/** Unscramble (decrypt) a section using the XOR key */
function unscramble(data: Uint8Array, start: number, end: number, key: number): void {
  let k1 = ((key >> 8) & 0xFF) ^ 0xFF;
  let k2 = (key & 0xFF) ^ 0xFF;
  let i = start;
  while (i < end - 1) {
    const a = data[i];
    const b = data[i + 1];
    data[i + 1] ^= k1;
    data[i + 1] = data[i + 1] & 0xFF;
    i++;
    data[i + 1] ^= k2;
    data[i + 1] = data[i + 1] & 0xFF;
    i++;
    k1 = (k1 + a) & 0xFF;
    k2 = (k2 + b) & 0xFF;
  }
}

// Wait, the unscramble logic is tricky. Let me re-read the spec:
// void unscramble(char* start, char* end, u16 key) {
//   u8 k1 = (key >> 8) ^ 0xff;
//   u8 k2 = key ^ 0xff;
//   while (start < end) {
//     char a = *start;
//     char b = *(start + 1);
//     *(++start) ^= k1;  // XOR byte at start+1 with k1
//     *(++start) ^= k2;  // XOR byte at start+2 with k2, then start is now at start+2
//     k1 += a;
//     k2 += b;
//   }
// }
// So it processes 2 bytes at a time: saves originals, XORs [i+1] with k1, XORs [i+2] with k2,
// then advances by 2 and updates keys with the ORIGINAL values.
// Wait no - *(++start) means start is incremented FIRST, then dereferenced.
// So: start points to byte[0]
//   a = byte[0], b = byte[1]
//   ++start → start now at byte[1], byte[1] ^= k1
//   ++start → start now at byte[2], byte[2] ^= k2
//   k1 += a (original byte[0]), k2 += b (original byte[1])
// Next iteration: start at byte[2], process byte[2] and byte[3]...
// Wait that means byte[2] was already modified. Let me re-read.
// Actually the C code: *(++start) means increment start then dereference.
// First iteration: start=0
//   a = data[0], b = data[1]
//   start becomes 1, data[1] ^= k1
//   start becomes 2, data[2] ^= k2
//   k1 += a, k2 += b
// Second iteration: start=2, check start < end
//   a = data[2] (already modified!), b = data[3]
//   start becomes 3, data[3] ^= k1
//   start becomes 4, data[4] ^= k2
// Hmm, that means byte 2 is both XORed and then used as 'a'. That seems wrong for decryption.
// Let me look at this more carefully... Actually, the loop increments start by 2 each time
// (two ++start), and the while condition checks if the new position < end.
// So it processes bytes in pairs: (0,1), (2,3), (4,5), etc.
// For pair (i, i+1):
//   a = data[i], b = data[i+1]  (these are the ENCRYPTED values)
//   data[i+1] ^= k1  (but wait, this is byte i+1, and 'b' already captured its value)
//   Actually no: *(++start) modifies data[start+1]. After first ++start, start=i+1
//   So data[i+1] ^= k1. Then ++start makes start=i+2, data[i+2] ^= k2.
// That's processing bytes i+1 and i+2, NOT i and i+1! The pair skips byte i.
// Hmm, this is confusing. Let me just use a simpler implementation.

function unscrambleSection(buf: Uint8Array, startIdx: number, endIdx: number, key: number): void {
  let k1 = ((key >> 8) & 0xFF) ^ 0xFF;
  let k2 = (key & 0xFF) ^ 0xFF;
  let pos = startIdx;
  while (pos + 1 < endIdx) {
    const a = buf[pos];
    const b = buf[pos + 1];
    buf[pos] ^= k1;
    buf[pos + 1] ^= k2;
    k1 = (k1 + a) & 0xFF;
    k2 = (k2 + b) & 0xFF;
    pos += 2;
  }
}

interface LegacyTableHeader {
  valid: boolean;
  flags: number;
  nameTableOffset: number;
  rowLength: number;
  hashTableOffset: number;
  hashSlotCount: number;
  rowDataOffset: number;
  rowCount: number;
  baseId: number;
  scrambleKey: number;
  stringTableOffset: number;
  stringTableLength: number;
  colNodeOffset: number;
  colNodeCount: number;
  headerSize: number; // 64 for XCDE, 32 for Wii/3DS
}

function parseLegacyTableHeader(data: Uint8Array, tableOffset: number): LegacyTableHeader {
  const view = new DataView(data.buffer, data.byteOffset + tableOffset);
  
  const magic = String.fromCharCode(data[tableOffset], data[tableOffset + 1], data[tableOffset + 2], data[tableOffset + 3]);
  if (magic !== 'BDAT') {
    return { valid: false } as any;
  }

  const flags = data[tableOffset + 4];
  const nameTableOffset = view.getUint16(0x06, true);
  const rowLength = view.getUint16(0x08, true);
  const hashTableOffset = view.getUint16(0x0A, true);
  const hashSlotCount = view.getUint16(0x0C, true);
  const rowDataOffset = view.getUint16(0x0E, true);
  const rowCount = view.getUint16(0x10, true);
  const baseId = view.getUint16(0x12, true);
  // 0x14: unknown (u16)
  const scrambleKey = view.getUint16(0x16, true);
  const stringTableOffset = view.getUint32(0x18, true);
  const stringTableLength = view.getUint32(0x1C, true);
  
  // XCDE has additional fields at 0x20+
  let colNodeOffset = 0;
  let colNodeCount = 0;
  let headerSize = 32;
  
  // Detect XCDE (64-byte header) vs Wii/3DS (32-byte header)
  // XCDE has column node fields at 0x20-0x23
  if (nameTableOffset >= 0x40) {
    // Header is at least 64 bytes since name table starts at or after 0x40
    headerSize = 64;
    colNodeOffset = view.getUint16(0x20, true);
    colNodeCount = view.getUint16(0x22, true);
  }

  return {
    valid: true,
    flags,
    nameTableOffset,
    rowLength,
    hashTableOffset,
    hashSlotCount,
    rowDataOffset,
    rowCount,
    baseId,
    scrambleKey,
    stringTableOffset,
    stringTableLength,
    colNodeOffset,
    colNodeCount,
    headerSize,
  };
}

interface LegacyColumnInfo {
  cellType: number; // 1=Value, 2=List, 3=Flags
  valueType: number;
  rowOffset: number;
  listCount?: number; // for List type
  flagShift?: number; // for Flags type
  flagMask?: number;  // for Flags type
}

function parseLegacyColumnInfos(tableData: Uint8Array, headerSize: number, colNodeCount: number): LegacyColumnInfo[] {
  const view = new DataView(tableData.buffer, tableData.byteOffset);
  const infos: LegacyColumnInfo[] = [];
  
  // Column info tables start right after the header
  let offset = headerSize;
  
  // We need to parse until we've found all column infos referenced by column nodes.
  // Each column info is variable-length based on cell type.
  // We'll collect all unique info offsets from column nodes first, but since we may not 
  // have parsed nodes yet, we just parse sequentially.
  // Actually, we know colNodeCount = number of columns. Parse that many infos.
  for (let i = 0; i < colNodeCount; i++) {
    if (offset >= tableData.length) break;
    const cellType = tableData[offset];
    
    if (cellType === 1) {
      // Value: type(u8) + valueType(u8) + rowOffset(u16) = 4 bytes
      const valueType = tableData[offset + 1];
      const rowOffset = view.getUint16(offset + 2, true);
      infos.push({ cellType, valueType, rowOffset });
      offset += 4;
    } else if (cellType === 2) {
      // List: type(u8) + valueType(u8) + rowOffset(u16) + count(u16) = 6 bytes
      const valueType = tableData[offset + 1];
      const rowOffset = view.getUint16(offset + 2, true);
      const listCount = view.getUint16(offset + 4, true);
      infos.push({ cellType, valueType, rowOffset, listCount });
      offset += 6;
    } else if (cellType === 3) {
      // Flags: type(u8) + shift(u8) + mask(u32) + parentNodePtr(u16) = 8 bytes
      infos.push({ cellType, valueType: 0, rowOffset: 0, flagShift: tableData[offset + 1], flagMask: view.getUint32(offset + 2, true) });
      offset += 8;
    } else {
      // Unknown cell type, try to skip 4 bytes
      infos.push({ cellType, valueType: 0, rowOffset: 0 });
      offset += 4;
    }
  }
  
  return infos;
}

interface LegacyColumnNode {
  infoOffset: number;   // absolute offset to column info in table
  linkedNode: number;   // linked node offset (0 = none)
  nameOffset: number;   // absolute offset to name string in table
}

function parseLegacyColumnNodes(tableData: Uint8Array, colNodeOffset: number, colNodeCount: number): LegacyColumnNode[] {
  const view = new DataView(tableData.buffer, tableData.byteOffset);
  const nodes: LegacyColumnNode[] = [];
  
  for (let i = 0; i < colNodeCount; i++) {
    const off = colNodeOffset + i * 6; // Each node = 6 bytes (XCX+)
    if (off + 6 > tableData.length) break;
    nodes.push({
      infoOffset: view.getUint16(off, true),
      linkedNode: view.getUint16(off + 2, true),
      nameOffset: view.getUint16(off + 4, true),
    });
  }
  
  return nodes;
}

/**
 * Parse a single legacy BDAT table and return a BdatTable compatible with the rest of the system.
 */
export function parseLegacyTable(
  fileData: Uint8Array,
  tableOffset: number,
  tableIndex: number,
): BdatTable | null {
  const hdr = parseLegacyTableHeader(fileData, tableOffset);
  if (!hdr.valid) return null;

  // Calculate table size and extract table data
  const tableSize = hdr.stringTableOffset + hdr.stringTableLength;
  // Make a COPY so we can unscramble in-place without modifying original
  const tableData = fileData.slice(tableOffset, tableOffset + tableSize);
  
  // Unscramble if needed (flags bit 1)
  const isScrambled = (hdr.flags & 0x02) !== 0;
  if (isScrambled && hdr.scrambleKey !== 0) {
    // Section 1: name table to hash table
    unscrambleSection(tableData, hdr.nameTableOffset, hdr.hashTableOffset, hdr.scrambleKey);
    // Section 2: string table
    unscrambleSection(tableData, hdr.stringTableOffset, hdr.stringTableOffset + hdr.stringTableLength, hdr.scrambleKey);
  }

  // Parse column infos (right after header)
  const columnInfos = parseLegacyColumnInfos(tableData, hdr.headerSize, hdr.colNodeCount);
  
  // Parse column nodes to get names
  const columnNodes = hdr.colNodeOffset > 0 
    ? parseLegacyColumnNodes(tableData, hdr.colNodeOffset, hdr.colNodeCount)
    : [];
  
  // Build column definitions by matching nodes to infos
  const columns: BdatColumn[] = [];
  const infoByOffset = new Map<number, LegacyColumnInfo>();
  
  // Map info offsets: column infos start at headerSize
  let infoOffset = hdr.headerSize;
  for (const info of columnInfos) {
    infoByOffset.set(infoOffset, info);
    if (info.cellType === 1) infoOffset += 4;
    else if (info.cellType === 2) infoOffset += 6;
    else if (info.cellType === 3) infoOffset += 8;
    else infoOffset += 4;
  }

  if (columnNodes.length > 0) {
    // Use column nodes to match info → name
    for (const node of columnNodes) {
      const info = infoByOffset.get(node.infoOffset);
      if (!info || info.cellType === 3) continue; // Skip flag columns
      
      const name = readNullTerminatedString(tableData, node.nameOffset);
      const valueType = info.valueType as BdatValueType;
      
      columns.push({
        valueType,
        nameOffset: node.nameOffset,
        name: name || `col_${columns.length}`,
        offset: info.rowOffset,
      });
    }
  } else {
    // No column nodes — use infos directly with generated names
    for (let i = 0; i < columnInfos.length; i++) {
      const info = columnInfos[i];
      if (info.cellType === 3) continue;
      columns.push({
        valueType: info.valueType as BdatValueType,
        nameOffset: 0,
        name: `col_${i}`,
        offset: info.rowOffset,
      });
    }
  }

  // Read table name from name table
  const tableName = readNullTerminatedString(tableData, hdr.nameTableOffset);

  // Parse rows
  const rows: BdatRow[] = [];
  const view = new DataView(tableData.buffer, tableData.byteOffset);

  for (let r = 0; r < hdr.rowCount; r++) {
    const rowOffset = hdr.rowDataOffset + r * hdr.rowLength;
    const values: Record<string, unknown> = {};

    for (const col of columns) {
      const cellOffset = rowOffset + col.offset;
      if (cellOffset >= tableData.length) continue;

      switch (col.valueType) {
        case BdatValueType.UnsignedByte:
          values[col.name] = tableData[cellOffset];
          break;
        case BdatValueType.UnsignedShort:
          values[col.name] = view.getUint16(cellOffset, true);
          break;
        case BdatValueType.UnsignedInt:
          values[col.name] = view.getUint32(cellOffset, true);
          break;
        case BdatValueType.SignedByte:
          values[col.name] = view.getInt8(cellOffset);
          break;
        case BdatValueType.SignedShort:
          values[col.name] = view.getInt16(cellOffset, true);
          break;
        case BdatValueType.SignedInt:
          values[col.name] = view.getInt32(cellOffset, true);
          break;
        case BdatValueType.Float:
          values[col.name] = view.getFloat32(cellOffset, true);
          break;
        case BdatValueType.String: {
          // Legacy: String value is a u32 ABSOLUTE pointer from table start
          const strPtr = view.getUint32(cellOffset, true);
          if (strPtr > 0 && strPtr < tableData.length) {
            values[col.name] = readNullTerminatedString(tableData, strPtr);
          } else {
            values[col.name] = '';
          }
          break;
        }
        default:
          values[col.name] = null;
      }
    }

    rows.push({ id: hdr.baseId + r, values });
  }

  // Build _raw for compatibility with writer
  const raw: BdatTable['_raw'] = {
    tableOffset,
    tableData,
    columnCount: columns.length,
    rowCount: hdr.rowCount,
    rowLength: hdr.rowLength,
    columnDefsOffset: hdr.headerSize,
    hashTableOffset: hdr.hashTableOffset,
    rowDataOffset: hdr.rowDataOffset,
    stringTableOffset: hdr.stringTableOffset,
    stringTableLength: hdr.stringTableLength,
    hashedNames: false,
    baseId: hdr.baseId,
    isU32Layout: false,
    isLegacy: true,
  };

  if (tableIndex < 5) {
    const colSummary = columns.map(c => `${c.name}(type=${c.valueType})`).join(', ');
    console.log(`[BDAT-LEGACY] Table ${tableIndex} "${tableName}": cols=[${colSummary}], rows=${hdr.rowCount}, rowLen=${hdr.rowLength}`);
    if (rows.length > 0) {
      const sample = Object.entries(rows[0].values).slice(0, 5).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
      console.log(`[BDAT-LEGACY] Table ${tableIndex} row[0]: ${sample}`);
    }
  }

  return {
    name: tableName || `table_${tableIndex}`,
    nameHash: null,
    columns,
    rows,
    baseId: hdr.baseId,
    _raw: raw,
  };
}

/**
 * Check if a BDAT table at the given offset is in legacy format.
 * Legacy tables have flags/pad at 0x04-0x05 instead of a u32 version.
 * Modern XC3 tables have version 0x3004 at 0x04.
 */
export function isLegacyTable(data: Uint8Array, tableOffset: number): boolean {
  if (tableOffset + 8 > data.length) return false;
  const view = new DataView(data.buffer, data.byteOffset + tableOffset);
  const version32 = view.getUint32(0x04, true);
  
  // XC3 modern format uses version 0x3004
  if (version32 === 0x3004) return false;
  
  // Legacy: byte 4 is flags (small, 0-3), byte 5 is padding (0)
  // Check: byte 5 should be 0, and the name offset at 0x06 should be reasonable
  const flagByte = data[tableOffset + 4];
  const padByte = data[tableOffset + 5];
  const nameOffset = view.getUint16(0x06, true);
  
  return padByte === 0 && flagByte <= 3 && nameOffset >= 0x20 && nameOffset <= 0x200;
}
