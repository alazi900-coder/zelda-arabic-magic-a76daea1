/**
 * BDAT Binary Parser for Xenoblade Chronicles 3 (Modern) + XC1/XC2/XCDE (Legacy)
 * 
 * Parses "Modern" BDAT format (XC3) based on bdat-rs specifications.
 * Legacy format (XC1 DE, XC2) is handled by bdat-legacy-parser.ts.
 * Supports hashed column/table names (Murmur3) and all 14 value types.
 */

import { isLegacyTable, parseLegacyTable } from './bdat-legacy-parser';

// ============= Types =============

export enum BdatValueType {
  Unknown = 0,
  UnsignedByte = 1,
  UnsignedShort = 2,
  UnsignedInt = 3,
  SignedByte = 4,
  SignedShort = 5,
  SignedInt = 6,
  String = 7,
  Float = 8,
  Percent = 9,
  HashRef = 10,
  DebugString = 11,
  Unknown12 = 12,
  MessageId = 13,
}

/** Size in bytes for each value type */
const VALUE_TYPE_SIZE: Record<number, number> = {
  [BdatValueType.Unknown]: 0,
  [BdatValueType.UnsignedByte]: 1,
  [BdatValueType.UnsignedShort]: 2,
  [BdatValueType.UnsignedInt]: 4,
  [BdatValueType.SignedByte]: 1,
  [BdatValueType.SignedShort]: 2,
  [BdatValueType.SignedInt]: 4,
  [BdatValueType.String]: 4,
  [BdatValueType.Float]: 4,
  [BdatValueType.Percent]: 1,
  [BdatValueType.HashRef]: 4,
  [BdatValueType.DebugString]: 4,
  [BdatValueType.Unknown12]: 1,
  [BdatValueType.MessageId]: 2,
};

export interface BdatColumn {
  valueType: BdatValueType;
  nameOffset: number;   // offset into table's string table (or hash)
  name: string;         // resolved name (unhashed or raw)
  offset: number;       // byte offset within a row for this column's data
}

export interface BdatRow {
  id: number;
  values: Record<string, unknown>;
}

export interface BdatTable {
  name: string;
  nameHash: number | null;
  columns: BdatColumn[];
  rows: BdatRow[];
  baseId: number;
  // Internal data for writer
  _raw: {
    tableOffset: number;
    tableData: Uint8Array;
    columnCount: number;
    rowCount: number;
    rowLength: number;
    columnDefsOffset: number;
    hashTableOffset: number;
    rowDataOffset: number;
    stringTableOffset: number;
    stringTableLength: number;
    hashedNames: boolean;
    baseId: number;
    isU32Layout: boolean;  // true = 48-byte header (u32 offsets), false = 40-byte header (u16 offsets)
    isLegacy?: boolean;    // true = XC1/XC2/XCDE legacy format (absolute string pointers)
  };
}

export interface BdatFile {
  tables: BdatTable[];
  version: number;
  fileSize: number;
  _raw: Uint8Array;  // original file bytes for writer
}

// ============= String Table Reading =============

function readNullTerminatedString(data: Uint8Array, offset: number): string {
  const bytes: number[] = [];
  let i = offset;
  while (i < data.length && data[i] !== 0) {
    bytes.push(data[i]);
    i++;
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

// ============= Parser =============

function parseTableHeader(data: Uint8Array, tableOffset: number): BdatTable['_raw'] & { valid: boolean } {
  const view = new DataView(data.buffer, data.byteOffset + tableOffset);
  
  // Check magic "BDAT"
  const magic = String.fromCharCode(data[tableOffset], data[tableOffset + 1], data[tableOffset + 2], data[tableOffset + 3]);
  if (magic !== 'BDAT') {
    return { valid: false } as any;
  }

  // Detect header layout from table version.
  // XC3 uses table version 0x3004 which always implies u32 layout (48-byte header).
  const tableVersion = view.getUint32(0x04, true);
  const isU32Layout = tableVersion === 0x3004 || (() => {
    // Heuristic fallback for non-0x3004 versions
    const testRowLength16 = view.getUint16(0x1E, true);
    const testColDefsOffset32 = view.getUint32(0x18, true);
    return testRowLength16 === 0 && testColDefsOffset32 > 0 && testColDefsOffset32 < 0x10000;
  })();

  let columnCount: number, rowCount: number, baseId: number;
  let columnDefsOffset: number, hashTableOffset: number, rowDataOffset: number, rowLength: number, stringTableOffset: number, stringTableLength: number;

  if (isU32Layout) {
    // u32 layout (48-byte header, 0x30) — matches bdat-rs reference implementation:
    // 0x00: magic (4), 0x04: version (u32), 0x08: columns (u32), 0x0C: rows (u32),
    // 0x10: base_id (u32), 0x14: unknown (u32), 0x18: col_defs (u32), 0x1C: hash_tbl (u32),
    // 0x20: row_data (u32), 0x24: row_length (u32), 0x28: str_tbl (u32), 0x2C: str_len (u32)
    columnCount = view.getUint32(0x08, true);
    rowCount = view.getUint32(0x0C, true);
    baseId = view.getUint32(0x10, true);
    // 0x14 is unknown/padding (u32), skip
    columnDefsOffset = view.getUint32(0x18, true);
    hashTableOffset = view.getUint32(0x1C, true);
    rowDataOffset = view.getUint32(0x20, true);
    rowLength = view.getUint32(0x24, true);
    stringTableOffset = view.getUint32(0x28, true);
    stringTableLength = view.getUint32(0x2C, true);
  } else {
    // u16 layout (40-byte header) — legacy/non-XC3 format
    columnCount = view.getUint16(0x08, true);
    rowCount = view.getUint16(0x0C, true);
    baseId = view.getUint16(0x10, true);
    columnDefsOffset = view.getUint16(0x18, true);
    hashTableOffset = view.getUint16(0x1A, true);
    rowDataOffset = view.getUint16(0x1C, true);
    rowLength = view.getUint16(0x1E, true);
    stringTableOffset = view.getUint32(0x20, true);
    stringTableLength = view.getUint32(0x24, true);
  }

  // Calculate table size
  const tableSize = stringTableOffset + stringTableLength;
  const tableData = data.slice(tableOffset, tableOffset + tableSize);

  // Check if names are hashed: first byte of string table is a flag
  const hashedNames = stringTableLength > 0 ? tableData[stringTableOffset] === 0 : true;

  return {
    valid: true,
    tableOffset,
    tableData,
    columnCount,
    rowCount,
    rowLength,
    columnDefsOffset,
    hashTableOffset,
    rowDataOffset,
    stringTableOffset,
    stringTableLength,
    hashedNames,
    baseId,
    isU32Layout,
  };
}

function parseColumns(tableData: Uint8Array, raw: BdatTable['_raw'], unhashFn: (hash: number) => string): BdatColumn[] {
  const columns: BdatColumn[] = [];
  const view = new DataView(tableData.buffer, tableData.byteOffset);
  
  // First pass: collect types and names
  const colDefs: { valueType: BdatValueType; name: string; nameRef: number; size: number }[] = [];
  for (let i = 0; i < raw.columnCount; i++) {
    const defOffset = raw.columnDefsOffset + i * 3;
    const valueType: BdatValueType = tableData[defOffset];
    const nameRef = view.getUint16(defOffset + 1, true);

    let name: string;
    if (raw.hashedNames) {
      // nameRef is the byte offset into the string table (matching bdat-rs get_label).
      // The hash (u32) is stored at stringTableOffset + nameRef.
      const hashOffset = raw.stringTableOffset + nameRef;
      if (hashOffset + 4 <= tableData.length) {
        const hash = view.getUint32(hashOffset, true);
        name = unhashFn(hash);
      } else {
        name = `col_${i}`;
      }
    } else {
      const strOffset = raw.stringTableOffset + 1 + nameRef;
      name = readNullTerminatedString(tableData, strOffset);
      if (!name) name = `col_${i}`;
    }

    const size = VALUE_TYPE_SIZE[valueType] || 0;
    colDefs.push({ valueType, name, nameRef, size });
  }

  // Calculate offsets using rowLength to determine layout
  let simpleTotal = colDefs.reduce((sum, c) => sum + c.size, 0);
  
  // If simple cumulative sizes don't match rowLength, the format uses
  // padded storage where small types (1-byte) are stored in wider slots.
  // Try progressively wider padding until total matches rowLength.
  if (simpleTotal !== raw.rowLength && raw.rowLength > 0) {
    // Strategy: pad 1-byte types to 2, then to 4 if needed
    for (const padSize of [2, 4]) {
      const paddedDefs = colDefs.map(d => ({ ...d, size: d.size === 1 ? padSize : d.size }));
      const paddedTotal = paddedDefs.reduce((sum, c) => sum + c.size, 0);
      if (paddedTotal === raw.rowLength) {
        let off = 0;
        for (const def of paddedDefs) {
          columns.push({ valueType: def.valueType, nameOffset: def.nameRef, name: def.name, offset: off });
          off += def.size;
        }
        return columns;
      }
    }
    // Fallback: try natural alignment (align each field to its own size)
    let off = 0;
    for (const def of colDefs) {
      if (def.size > 1) {
        const align = Math.min(def.size, 4);
        off = Math.ceil(off / align) * align;
      }
      columns.push({ valueType: def.valueType, nameOffset: def.nameRef, name: def.name, offset: off });
      off += def.size;
    }
    return columns;
  }
  
  // Simple cumulative layout (no padding needed)
  let currentOffset = 0;
  for (const def of colDefs) {
    columns.push({ valueType: def.valueType, nameOffset: def.nameRef, name: def.name, offset: currentOffset });
    currentOffset += def.size;
  }

  return columns;
}

function parseRows(tableData: Uint8Array, raw: BdatTable['_raw'], columns: BdatColumn[]): BdatRow[] {
  const rows: BdatRow[] = [];
  const view = new DataView(tableData.buffer, tableData.byteOffset);

  for (let r = 0; r < raw.rowCount; r++) {
    const rowOffset = raw.rowDataOffset + r * raw.rowLength;
    const values: Record<string, unknown> = {};

    for (const col of columns) {
      const cellOffset = rowOffset + col.offset;
      if (cellOffset >= tableData.length) continue;

      switch (col.valueType) {
        case BdatValueType.UnsignedByte:
        case BdatValueType.Percent:
        case BdatValueType.Unknown12:
          values[col.name] = tableData[cellOffset];
          break;
        case BdatValueType.UnsignedShort:
          values[col.name] = view.getUint16(cellOffset, true);
          break;
        case BdatValueType.MessageId: {
          // MessageId is a u16 offset into the string table
          const msgOff = view.getUint16(cellOffset, true);
          if (msgOff > 0 && raw.stringTableOffset + msgOff < tableData.length) {
            values[col.name] = readNullTerminatedString(tableData, raw.stringTableOffset + msgOff);
          } else {
            values[col.name] = '';
          }
          break;
        }
        case BdatValueType.UnsignedInt:
        case BdatValueType.HashRef:
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
        case BdatValueType.String:
        case BdatValueType.DebugString: {
          const strOffset = view.getUint32(cellOffset, true);
          if (strOffset > 0 && raw.stringTableOffset + strOffset < tableData.length) {
            values[col.name] = readNullTerminatedString(tableData, raw.stringTableOffset + strOffset);
          } else {
            values[col.name] = '';
          }
          break;
        }
        default:
          values[col.name] = null;
      }
    }

    rows.push({ id: raw.baseId + r, values });
  }

  return rows;
}

function getTableName(tableData: Uint8Array, raw: BdatTable['_raw'], tableIndex: number, unhashFn: (hash: number) => string): { name: string; hash: number | null } {
  const view = new DataView(tableData.buffer, tableData.byteOffset);
  
  if (raw.hashedNames && raw.stringTableLength > 0) {
    // Table name hash: bdat-rs calls get_label(1) → reads u32 at stringTableOffset + 1
    // (offset 0 is the flag byte, offset 1 starts the table name hash)
    const hashOffset = raw.stringTableOffset + 1;
    if (hashOffset + 4 <= tableData.length) {
      const hash = view.getUint32(hashOffset, true);
      return { name: unhashFn(hash), hash };
    }
  } else if (raw.stringTableLength > 1) {
    // Table name is the first null-terminated string after the flag byte
    const name = readNullTerminatedString(tableData, raw.stringTableOffset + 1);
    if (name) return { name, hash: null };
  }
  
  return { name: `table_${tableIndex}`, hash: null };
}

/**
 * Parse a BDAT binary file and extract all tables with their data.
 */
export function parseBdatFile(data: Uint8Array, unhashFn?: (hash: number) => string): BdatFile {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  
  const magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
  const defaultUnhash = unhashFn || ((h: number) => `0x${h.toString(16).padStart(8, '0')}`);

  let version: number;
  let tableCount: number;
  let fileSize: number;
  let tableOffsets: number[];

  if (magic === 'BDAT') {
    // XC3 format: BDAT magic + version + tableCount + fileSize + offsets
    version = view.getUint32(4, true);
    tableCount = view.getUint32(8, true);
    fileSize = view.getUint32(12, true);
    tableOffsets = [];
    for (let t = 0; t < tableCount; t++) {
      tableOffsets.push(view.getUint32(16 + t * 4, true));
    }
  } else {
    // XC1/XC2 legacy format: tableCount (u32) + offset array (first may be sentinel = fileSize)
    tableCount = view.getUint32(0, true);
    if (tableCount > 10000 || tableCount === 0) {
      throw new Error(`Invalid BDAT file: expected magic "BDAT", got "${magic}"`);
    }
    version = 0;
    fileSize = data.byteLength;
    tableOffsets = [];
    for (let t = 0; t < tableCount; t++) {
      const off = view.getUint32(4 + t * 4, true);
      // Skip sentinel entries (offset = fileSize or beyond data)
      if (off < data.byteLength) {
        // Verify this offset actually has BDAT magic
        if (off + 4 <= data.byteLength && data[off] === 0x42 && data[off+1] === 0x44 && data[off+2] === 0x41 && data[off+3] === 0x54) {
          tableOffsets.push(off);
        }
      }
    }
    console.log(`[BDAT-PARSER] Legacy format detected: ${tableCount} entries, ${tableOffsets.length} valid tables`);
  }

  const tables: BdatTable[] = [];

  console.log(`[BDAT-PARSER] File: version=0x${version.toString(16)}, tableCount=${tableOffsets.length}, fileSize=${fileSize}`);
  for (let t = 0; t < tableOffsets.length; t++) {
    const tableOffset = tableOffsets[t];
    
    // Check if this table uses legacy format (XC1/XC2/XCDE)
    if (isLegacyTable(data, tableOffset)) {
      const legacyTable = parseLegacyTable(data, tableOffset, t);
      if (legacyTable) {
        tables.push(legacyTable);
      } else {
        console.warn(`[BDAT-PARSER] Table ${t} at offset ${tableOffset}: legacy parse failed`);
      }
      continue;
    }

    const rawInfo = parseTableHeader(data, tableOffset);
    if (!rawInfo.valid) {
      console.warn(`[BDAT-PARSER] Table ${t} at offset ${tableOffset}: INVALID (no BDAT magic)`);
      continue;
    }

    if (t < 5) {
      const headerHex = Array.from(data.slice(tableOffset, tableOffset + Math.min(48, rawInfo.tableData.length)))
        .map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`[BDAT-PARSER] Table ${t} header (${rawInfo.isU32Layout ? 'u32' : 'u16'}): ${headerHex}`);
      console.log(`[BDAT-PARSER] Table ${t}: cols=${rawInfo.columnCount}, rows=${rawInfo.rowCount}, rowLen=${rawInfo.rowLength}, colDefs=0x${rawInfo.columnDefsOffset.toString(16)}, hashTbl=0x${rawInfo.hashTableOffset.toString(16)}, rowData=0x${rawInfo.rowDataOffset.toString(16)}, strTbl=0x${rawInfo.stringTableOffset.toString(16)}, strLen=${rawInfo.stringTableLength}, hashed=${rawInfo.hashedNames}`);
    }

    const raw: BdatTable['_raw'] = {
      tableOffset: rawInfo.tableOffset,
      tableData: rawInfo.tableData,
      columnCount: rawInfo.columnCount,
      rowCount: rawInfo.rowCount,
      rowLength: rawInfo.rowLength,
      columnDefsOffset: rawInfo.columnDefsOffset,
      hashTableOffset: rawInfo.hashTableOffset,
      rowDataOffset: rawInfo.rowDataOffset,
      stringTableOffset: rawInfo.stringTableOffset,
      stringTableLength: rawInfo.stringTableLength,
      hashedNames: rawInfo.hashedNames,
      baseId: rawInfo.baseId,
      isU32Layout: rawInfo.isU32Layout,
    };

    const columns = parseColumns(rawInfo.tableData, raw, defaultUnhash);
    const rows = parseRows(rawInfo.tableData, raw, columns);
    const { name, hash } = getTableName(rawInfo.tableData, raw, t, defaultUnhash);

    if (t < 5) {
      const colSummary = columns.map(c => `${c.name}(type=${c.valueType})`).join(', ');
      console.log(`[BDAT-PARSER] Table ${t} "${name}": columns=[${colSummary}]`);
      if (rows.length > 0) {
        const sampleRow = rows[0].values;
        const sampleStr = Object.entries(sampleRow).slice(0, 5).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
        console.log(`[BDAT-PARSER] Table ${t} row[0]: ${sampleStr}`);
      }
    }

    tables.push({
      name,
      nameHash: hash,
      columns,
      rows,
      baseId: rawInfo.baseId,
      _raw: raw,
    });
  }

  return { tables, version, fileSize, _raw: data };
}

/**
 * Extract all translatable string entries from a parsed BDAT file.
 * Returns entries in the format compatible with the editor.
 * @param safetyMargin multiplier for the byte budget (e.g. 1.2 = 20% headroom). Defaults to reading from settings.
 */
export function extractBdatStrings(
  bdatFile: BdatFile,
  fileName: string,
  safetyMargin?: number,
): {
  key: string;
  original: string;
  tableName: string;
  rowIndex: number;
  columnName: string;
  maxBytes: number;
}[] {
  // Resolve margin & arabic multiplier from persisted settings
  const settings = (() => {
    try {
      const raw = localStorage.getItem("bdat-settings-v1");
      if (raw) return JSON.parse(raw) as { safetyMargin?: number; arabicMultiplier?: number };
    } catch { /* ignore */ }
    return {} as { safetyMargin?: number; arabicMultiplier?: number };
  })();
  const resolvedMargin = safetyMargin !== undefined ? Math.max(safetyMargin, 1.0) : Math.max(settings.safetyMargin ?? 1.2, 1.0);
  const resolvedArabicMul = Math.min(Math.max(settings.arabicMultiplier ?? 2.0, 1.5), 3.0);

  const entries: { key: string; original: string; tableName: string; rowIndex: number; columnName: string; maxBytes: number }[] = [];

  for (const table of bdatFile.tables) {
    const stringColumns = table.columns.filter(
      c => c.valueType === BdatValueType.String || c.valueType === BdatValueType.DebugString || c.valueType === BdatValueType.MessageId
    );

    // Pre-compute max UTF-8 byte length per column from all non-empty values
    const colMaxBytes: Record<string, number> = {};
    for (const col of stringColumns) {
      let max = 0;
      for (const row of table.rows) {
        const val = row.values[col.name];
        if (typeof val === 'string' && val.trim().length > 0) {
          const byteLen = new TextEncoder().encode(val).length;
          if (byteLen > max) max = byteLen;
        }
      }
      // Use observed max × safety margin × arabic multiplier as the field's byte budget.
      // Minimum of 4 to handle empty/near-empty columns.
      colMaxBytes[col.name] = Math.max(Math.ceil(max * resolvedMargin * resolvedArabicMul), 4);
    }

    for (let r = 0; r < table.rows.length; r++) {
      const row = table.rows[r];
      for (const col of stringColumns) {
        const val = row.values[col.name];
        if (typeof val === 'string' && val.trim().length > 0) {
          // Skip pure numeric/hex strings
          if (/^[0-9a-fA-Fx<>]+$/.test(val.trim())) continue;
          
          const key = `bdat-bin:${fileName}:${table.name}:${r}:${col.name}`;
          entries.push({
            key,
            original: val,
            tableName: table.name,
            rowIndex: r,
            columnName: col.name,
            maxBytes: colMaxBytes[col.name],
          });
        }
      }
    }
  }

  return entries;
}
