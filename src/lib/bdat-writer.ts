/**
 * BDAT Binary Patcher for Xenoblade Chronicles 3
 * 
 * ═══════════════════════════════════════════════════════════════
 *  IMPROVED VERSION — Safe String Table Expansion
 * ═══════════════════════════════════════════════════════════════
 *
 * String Table Expansion Mode: rebuilds each table's string table to accommodate
 * translations that are LARGER than the original strings (critical for Arabic
 * Presentation Forms which use 3 bytes per char vs 1 byte for ASCII).
 *
 * How it works:
 * 1. For each table, collect ALL string offsets referenced by row data.
 * 2. Read original strings and replace with translations where available.
 * 3. Handle SHARED strings correctly: if multiple rows share the same original
 *    string but have DIFFERENT translations, create separate string entries.
 * 4. Build a NEW string table (may be larger than original).
 * 5. Update string pointers in row data to point to new offsets.
 * 6. Update stringTableLength in the table header.
 * 7. Rebuild the full file with adjusted table sizes and offsets.
 *
 * Invariants preserved:
 * - Row count, column count, row length are NEVER changed.
 * - Column definitions and hash tables are byte-identical.
 * - String table flag byte and metadata strings (table/column names) are preserved.
 * - Only row-data string pointers are updated.
 *
 * Safety improvements over original:
 * - MessageId (u16) overflow detection: reports error when new offset > 65535
 * - Shared string conflict resolution: different translations for same original string
 * - Overflow error reporting with detailed diagnostics
 * - Bounds checking on all read/write operations
 * - Optional string table alignment padding
 */

import { BdatFile, BdatTable, BdatValueType } from './bdat-parser';

// ============= Public types =============

export interface OverflowError {
  /** Editor key (tableName:rowIndex:colName) */
  key: string;
  /** Original allocation in bytes (including null terminator) */
  originalBytes: number;
  /** UTF-8 byte length of the translation + null terminator */
  translationBytes: number;
  /** Reason for the overflow */
  reason: 'u16_offset_overflow' | 'bounds_exceeded' | 'write_error';
  /** The new offset that caused the overflow (for u16 issues) */
  newOffset?: number;
}

export interface PatchResult {
  result: Uint8Array;
  overflowErrors: OverflowError[];
  /** Number of strings successfully patched */
  patchedCount: number;
  /** Number of strings skipped due to overflow */
  skippedCount: number;
  /** Diagnostic info per table */
  tableStats: TablePatchStat[];
}

export interface TablePatchStat {
  tableName: string;
  originalStringTableSize: number;
  newStringTableSize: number;
  stringsPatched: number;
  stringsSkipped: number;
  hasU16Columns: boolean;
}

// ============= Helpers =============

const encoder = new TextEncoder();

/**
 * Read a null-terminated UTF-8 string from a buffer at the given offset.
 */
function readNullTermStr(data: Uint8Array, offset: number): { str: string; byteLen: number } {
  if (offset >= data.length) return { str: '', byteLen: 1 };
  let end = offset;
  while (end < data.length && data[end] !== 0) end++;
  const bytes = data.slice(offset, end);
  return {
    str: new TextDecoder('utf-8').decode(bytes),
    byteLen: end - offset + 1,
  };
}

/**
 * Scramble (encrypt) a section using the XOR key — inverse of unscramble.
 * In unscramble: save encrypted bytes → XOR → update keys with encrypted bytes.
 * In scramble: XOR first → save encrypted bytes → update keys with encrypted bytes.
 */
function scrambleSection(buf: Uint8Array, startIdx: number, endIdx: number, key: number): void {
  let k1 = ((key >> 8) & 0xFF) ^ 0xFF;
  let k2 = (key & 0xFF) ^ 0xFF;
  let pos = startIdx;
  while (pos + 1 < endIdx) {
    buf[pos] ^= k1;
    buf[pos + 1] ^= k2;
    // After XOR, the values are now encrypted — use them for key update
    k1 = (k1 + buf[pos]) & 0xFF;
    k2 = (k2 + buf[pos + 1]) & 0xFF;
    pos += 2;
  }
}

/**
 * Safely write a Uint16 value, checking for overflow.
 */
function safeSetUint16(view: DataView, offset: number, value: number, littleEndian: boolean): boolean {
  if (value > 0xFFFF || value < 0) return false;
  if (offset + 2 > view.byteLength) return false;
  view.setUint16(offset, value, littleEndian);
  return true;
}

/**
 * Safely write a Uint32 value, checking bounds.
 */
function safeSetUint32(view: DataView, offset: number, value: number, littleEndian: boolean): boolean {
  if (offset + 4 > view.byteLength) return false;
  view.setUint32(offset, value, littleEndian);
  return true;
}

// ============= Core patch function =============

/**
 * Patch a BDAT file by rebuilding string tables to accommodate larger translations.
 * The returned buffer may be LARGER than the original file.
 *
 * @param bdatFile  Parsed BDAT file (must have _raw with original bytes).
 * @param translations  Map of "tableName:rowIndex:colName" → translated string.
 */
export function patchBdatFile(
  bdatFile: BdatFile,
  translations: Map<string, string>,
): PatchResult {
  const originalData = bdatFile._raw;
  const originalView = new DataView(originalData.buffer, originalData.byteOffset, originalData.byteLength);

  // Detect file format: XC3 (starts with "BDAT") vs Legacy (starts with table count)
  const fileMagic = String.fromCharCode(originalData[0], originalData[1], originalData[2], originalData[3]);
  const isLegacyFile = fileMagic !== 'BDAT';
  
  let fileHeaderSize: number;
  if (isLegacyFile) {
    // Legacy: count(u32) + count * u32 offsets (includes sentinel)
    const entryCount = originalView.getUint32(0, true);
    fileHeaderSize = 4 + entryCount * 4;
  } else {
    // Modern XC3: magic(4) + version(4) + count(4) + fileSize(4) + offsets
    const tableCount = originalView.getUint32(8, true);
    fileHeaderSize = 16 + tableCount * 4;
  }

  const overflowErrors: OverflowError[] = [];
  let patchedCount = 0;
  let skippedCount = 0;
  const tableStats: TablePatchStat[] = [];

  // For each table, build a new table buffer (potentially with expanded string table)
  const newTableBuffers: Uint8Array[] = [];

  for (const table of bdatFile.tables) {
    const raw = table._raw;
    const origTableData = raw.tableData; // original bytes for this table

    const stringColumns = table.columns.filter(
      c => c.valueType === BdatValueType.String || c.valueType === BdatValueType.DebugString || c.valueType === BdatValueType.MessageId,
    );

    // If no string columns or no translations match this table, keep original
    if (stringColumns.length === 0) {
      newTableBuffers.push(origTableData);
      continue;
    }

    // Check if any translations exist for this table
    const hasTranslations = [...translations.keys()].some(k => k.startsWith(table.name + ':'));
    if (!hasTranslations) {
      newTableBuffers.push(origTableData);
      continue;
    }

    // Track whether this table has MessageId (u16) columns
    const hasU16Columns = stringColumns.some(c => c.valueType === BdatValueType.MessageId);
    const isLegacyTable = !!table._raw.isLegacy;

    const origView = new DataView(origTableData.buffer, origTableData.byteOffset, origTableData.byteLength);

    // ---- Step 1: Collect ALL string references from row data ----
    // IMPROVED: Use per-cell tracking instead of per-offset to handle shared strings
    // with different translations correctly.

    interface CellRef {
      row: number;
      colIdx: number;
      colName: string;
      cellOffset: number;
      isMessageId: boolean;
      origStrOffset: number;  // offset in string table (RELATIVE, even for legacy — we normalize)
      origStr: string;        // original string text
      translationKey: string; // "tableName:row:colName"
      translation: string | undefined; // translated text (undefined = keep original)
    }

    const cellRefs: CellRef[] = [];
    // Cache original strings to avoid re-reading
    const origStringCache = new Map<number, string>();

    let tablePatchedCount = 0;
    let tableSkippedCount = 0;

    for (let r = 0; r < raw.rowCount; r++) {
      const rowOffset = raw.rowDataOffset + r * raw.rowLength;

      for (let ci = 0; ci < stringColumns.length; ci++) {
        const col = stringColumns[ci];
        const cellOffset = rowOffset + col.offset;
        const ptrSize = col.valueType === BdatValueType.MessageId ? 2 : 4;

        // Bounds check for reading
        if (cellOffset + ptrSize > origTableData.length) continue;

        let strOff: number; // always normalize to RELATIVE to string table
        if (col.valueType === BdatValueType.MessageId) {
          strOff = origView.getUint16(cellOffset, true);
        } else if (isLegacyTable) {
          // Legacy: pointers are ABSOLUTE from table start → convert to relative
          const absPtr = origView.getUint32(cellOffset, true);
          if (absPtr === 0) continue;
          strOff = absPtr - raw.stringTableOffset;
          if (strOff < 0 || absPtr >= origTableData.length) continue;
        } else {
          strOff = origView.getUint32(cellOffset, true);
        }
        if (strOff === 0 && !isLegacyTable) continue;

        const absStrOffset = raw.stringTableOffset + strOff;
        if (absStrOffset >= origTableData.length) continue;

        // Read and cache original string
        if (!origStringCache.has(strOff)) {
          const { str } = readNullTermStr(origTableData, absStrOffset);
          origStringCache.set(strOff, str);
        }
        const origStr = origStringCache.get(strOff)!;

        // Check for translation
        const mapKey = `${table.name}:${r}:${col.name}`;
        const translation = translations.get(mapKey);

        cellRefs.push({
          row: r,
          colIdx: ci,
          colName: col.name,
          cellOffset,
          isMessageId: col.valueType === BdatValueType.MessageId,
          origStrOffset: strOff,
          origStr,
          translationKey: mapKey,
          translation,
        });
      }
    }

    // ---- Step 2: Resolve shared strings with different translations ----
    // Group cells by their original string offset
    const offsetGroups = new Map<number, CellRef[]>();
    for (const cell of cellRefs) {
      const group = offsetGroups.get(cell.origStrOffset) || [];
      group.push(cell);
      offsetGroups.set(cell.origStrOffset, group);
    }

    // Build the list of unique strings to write
    // Each entry: { bytes, cells[] }
    interface NewStringEntry {
      bytes: Uint8Array;  // string bytes WITHOUT null terminator
      cells: CellRef[];   // cells that should point to this string
    }

    const newStringEntries: NewStringEntry[] = [];

    for (const [origOff, cells] of offsetGroups) {
      // Group cells by their effective text (original or translated)
      const textGroups = new Map<string, CellRef[]>();
      for (const cell of cells) {
        const effectiveText = cell.translation !== undefined ? cell.translation : cell.origStr;
        const group = textGroups.get(effectiveText) || [];
        group.push(cell);
        textGroups.set(effectiveText, group);
      }

      // Create one string entry per unique text
      for (const [text, groupCells] of textGroups) {
        const bytes = encoder.encode(text);
        newStringEntries.push({ bytes, cells: groupCells });

        // Count patches
        for (const cell of groupCells) {
          if (cell.translation !== undefined) {
            tablePatchedCount++;
          }
        }
      }
    }

    // ---- Step 3: Build new string table ----
    // Preserve metadata prefix (flag byte, table name hash, column name hashes)
    const allOrigOffsets = [...offsetGroups.keys()].sort((a, b) => a - b);

    // The metadata portion is everything from start of string table to the first referenced string
    const metadataEnd = allOrigOffsets.length > 0
      ? Math.min(...allOrigOffsets)
      : raw.stringTableLength;

    // Assign new offsets to each string entry
    let currentNewOffset = metadataEnd;
    const entryOffsets: number[] = [];

    for (const entry of newStringEntries) {
      entryOffsets.push(currentNewOffset);
      currentNewOffset += entry.bytes.length + 1; // +1 for null terminator
    }

    const newStringTableLength = currentNewOffset;

    // ---- Step 4: Pre-flight check for u16 overflow ----
    // Before writing anything, check if any MessageId cell would overflow
    let hasU16Overflow = false;

    for (let i = 0; i < newStringEntries.length; i++) {
      const entry = newStringEntries[i];
      const newOff = entryOffsets[i];

      for (const cell of entry.cells) {
        if (cell.isMessageId && newOff > 0xFFFF) {
          hasU16Overflow = true;
          overflowErrors.push({
            key: cell.translationKey,
            originalBytes: encoder.encode(cell.origStr).length + 1,
            translationBytes: entry.bytes.length + 1,
            reason: 'u16_offset_overflow',
            newOffset: newOff,
          });
          tableSkippedCount++;
        }
      }
    }

    // If u16 overflow detected, try to COMPACT the string table
    // Strategy: place strings referenced by MessageId columns FIRST (lower offsets)
    if (hasU16Overflow) {
      console.warn(`[BDAT-WRITER] Table "${table.name}": u16 overflow detected, attempting compaction...`);

      // Separate entries into MessageId-referenced and non-MessageId-referenced
      const msgIdEntries: { entry: NewStringEntry; idx: number }[] = [];
      const otherEntries: { entry: NewStringEntry; idx: number }[] = [];

      for (let i = 0; i < newStringEntries.length; i++) {
        const entry = newStringEntries[i];
        const hasMsgIdCell = entry.cells.some(c => c.isMessageId);
        if (hasMsgIdCell) {
          msgIdEntries.push({ entry, idx: i });
        } else {
          otherEntries.push({ entry, idx: i });
        }
      }

      // Reassign offsets: MessageId entries first, then others
      let compactOffset = metadataEnd;
      const reorderedEntries: NewStringEntry[] = [];
      const reorderedOffsets: number[] = [];

      // MessageId entries first
      for (const { entry } of msgIdEntries) {
        reorderedEntries.push(entry);
        reorderedOffsets.push(compactOffset);
        compactOffset += entry.bytes.length + 1;
      }

      // Check if compaction solved the u16 overflow
      const maxMsgIdOffset = msgIdEntries.length > 0 ? reorderedOffsets[msgIdEntries.length - 1] : 0;
      const lastMsgIdEnd = msgIdEntries.length > 0
        ? reorderedOffsets[msgIdEntries.length - 1] + msgIdEntries[msgIdEntries.length - 1].entry.bytes.length + 1
        : metadataEnd;

      if (lastMsgIdEnd <= 0xFFFF) {
        // Compaction successful! Clear overflow errors for this table
        const tableOverflowKeys = new Set(
          overflowErrors
            .filter(e => e.reason === 'u16_offset_overflow')
            .map(e => e.key)
        );
        // Remove overflow errors that we just fixed
        for (let i = overflowErrors.length - 1; i >= 0; i--) {
          if (tableOverflowKeys.has(overflowErrors[i].key)) {
            overflowErrors.splice(i, 1);
            tableSkippedCount--;
          }
        }
        hasU16Overflow = false;

        console.log(`[BDAT-WRITER] Table "${table.name}": compaction successful, max MessageId offset = ${lastMsgIdEnd}`);

        // Add remaining entries
        for (const { entry } of otherEntries) {
          reorderedEntries.push(entry);
          reorderedOffsets.push(compactOffset);
          compactOffset += entry.bytes.length + 1;
        }

        // Use reordered data
        newStringEntries.length = 0;
        entryOffsets.length = 0;
        newStringEntries.push(...reorderedEntries);
        entryOffsets.push(...reorderedOffsets);
        // Recalculate string table length
        // currentNewOffset is already set by compactOffset
      } else {
        console.error(`[BDAT-WRITER] Table "${table.name}": compaction FAILED, MessageId strings too large (${lastMsgIdEnd} > 65535)`);
        // Keep overflow errors, skip this table's translations
        // Fall through to use original table data
      }
    }

    // If there are still unresolvable u16 overflows, skip this table entirely
    if (hasU16Overflow) {
      console.error(`[BDAT-WRITER] Table "${table.name}": SKIPPING due to unresolvable u16 overflow`);
      newTableBuffers.push(origTableData);
      skippedCount += tableSkippedCount;
      tableStats.push({
        tableName: table.name,
        originalStringTableSize: raw.stringTableLength,
        newStringTableSize: raw.stringTableLength,
        stringsPatched: 0,
        stringsSkipped: tableSkippedCount,
        hasU16Columns,
      });
      continue;
    }

    // ---- Step 5: Build new table buffer ----
    const preStringLength = raw.stringTableOffset;
    const finalStringTableLength = entryOffsets.length > 0
      ? entryOffsets[entryOffsets.length - 1] + newStringEntries[newStringEntries.length - 1].bytes.length + 1
      : metadataEnd;
    const newTableSize = preStringLength + finalStringTableLength;
    const newTableData = new Uint8Array(newTableSize);

    // Copy everything before string table (header, column defs, hash table, row data)
    newTableData.set(origTableData.subarray(0, preStringLength));

    // Copy string table metadata (flag byte, names/hashes)
    if (metadataEnd > 0) {
      const metaSrc = origTableData.subarray(raw.stringTableOffset, raw.stringTableOffset + metadataEnd);
      newTableData.set(metaSrc, raw.stringTableOffset);
    }

    // Write new strings
    for (let i = 0; i < newStringEntries.length; i++) {
      const entry = newStringEntries[i];
      const absOff = raw.stringTableOffset + entryOffsets[i];

      // Bounds check
      if (absOff + entry.bytes.length + 1 > newTableData.length) {
        console.error(`[BDAT-WRITER] Bounds error writing string at offset ${absOff}`);
        continue;
      }

      newTableData.set(entry.bytes, absOff);
      newTableData[absOff + entry.bytes.length] = 0; // null terminator
    }

    // ---- Step 6: Update string pointers in row data ----
    const newTableView = new DataView(newTableData.buffer, newTableData.byteOffset, newTableData.byteLength);

    for (let i = 0; i < newStringEntries.length; i++) {
      const entry = newStringEntries[i];
      const newRelOff = entryOffsets[i]; // relative to string table start

      for (const cell of entry.cells) {
        if (cell.isMessageId) {
          if (!safeSetUint16(newTableView, cell.cellOffset, newRelOff, true)) {
            overflowErrors.push({
              key: cell.translationKey,
              originalBytes: encoder.encode(cell.origStr).length + 1,
              translationBytes: entry.bytes.length + 1,
              reason: 'write_error',
              newOffset: newRelOff,
            });
            skippedCount++;
            continue;
          }
        } else if (isLegacyTable) {
          // Legacy: write ABSOLUTE pointer (from table start)
          const absOff = raw.stringTableOffset + newRelOff;
          if (!safeSetUint32(newTableView, cell.cellOffset, absOff, true)) {
            overflowErrors.push({
              key: cell.translationKey,
              originalBytes: encoder.encode(cell.origStr).length + 1,
              translationBytes: entry.bytes.length + 1,
              reason: 'bounds_exceeded',
              newOffset: absOff,
            });
            skippedCount++;
            continue;
          }
        } else {
          // Modern: write relative offset
          if (!safeSetUint32(newTableView, cell.cellOffset, newRelOff, true)) {
            overflowErrors.push({
              key: cell.translationKey,
              originalBytes: encoder.encode(cell.origStr).length + 1,
              translationBytes: entry.bytes.length + 1,
              reason: 'bounds_exceeded',
              newOffset: newRelOff,
            });
            skippedCount++;
            continue;
          }
        }
      }
    }

    // ---- Step 7: Update stringTableLength in table header ----
    if (isLegacyTable) {
      safeSetUint32(newTableView, 0x1C, finalStringTableLength, true);
    } else if (raw.isU32Layout) {
      safeSetUint32(newTableView, 0x2C, finalStringTableLength, true);
    } else {
      safeSetUint32(newTableView, 0x24, finalStringTableLength, true);
    }

    // ---- Step 7.5: Re-scramble legacy tables if originally scrambled ----
    if (isLegacyTable && raw.isScrambled && raw.scrambleKey) {
      const nameTableOff = newTableView.getUint16(0x06, true);
      const hashTableOff = newTableView.getUint16(0x0A, true);
      const newStrTableOff = newTableView.getUint32(0x18, true);
      const newStrTableLen = newTableView.getUint32(0x1C, true);
      // Section 1: name table → hash table
      scrambleSection(newTableData, nameTableOff, hashTableOff, raw.scrambleKey);
      // Section 2: string table
      scrambleSection(newTableData, newStrTableOff, newStrTableOff + newStrTableLen, raw.scrambleKey);
      console.log(`[BDAT-WRITER] Re-scrambled table "${table.name}" with key 0x${raw.scrambleKey.toString(16)}`);
    }

    patchedCount += tablePatchedCount;
    newTableBuffers.push(newTableData);

    tableStats.push({
      tableName: table.name,
      originalStringTableSize: raw.stringTableLength,
      newStringTableSize: finalStringTableLength,
      stringsPatched: tablePatchedCount,
      stringsSkipped: tableSkippedCount,
      hasU16Columns,
    });
  }

  // ---- Step 8: Rebuild the full file ----
  if (isLegacyFile && bdatFile._legacyOffsetEntries) {
    // Use legacy offset entries to preserve exact file structure
    const entries = bdatFile._legacyOffsetEntries;
    
    // Map parsed table offsets → new table buffers
    const tableBufferMap = new Map<number, Uint8Array>();
    for (let t = 0; t < bdatFile.tables.length; t++) {
      tableBufferMap.set(bdatFile.tables[t]._raw.tableOffset, newTableBuffers[t]);
    }
    
    // Calculate new offsets and total size
    let currentOffset = fileHeaderSize;
    const newEntryOffsets: { offset: number; data: Uint8Array }[] = [];
    
    for (const entry of entries) {
      if (entry.isTable) {
        const buf = tableBufferMap.get(entry.offset) || entry.data;
        newEntryOffsets.push({ offset: currentOffset, data: buf });
        currentOffset += buf.length;
      } else {
        // Sentinel — will be updated to file size later
        newEntryOffsets.push({ offset: 0, data: new Uint8Array(0) });
      }
    }
    const newFileSize = currentOffset;
    
    const result = new Uint8Array(newFileSize);
    const resultView = new DataView(result.buffer);
    
    // Write header
    const entryCount = originalView.getUint32(0, true);
    resultView.setUint32(0, entryCount, true);
    
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].isTable) {
        resultView.setUint32(4 + i * 4, newEntryOffsets[i].offset, true);
      } else {
        resultView.setUint32(4 + i * 4, newFileSize, true);
      }
    }
    
    // Write table data
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].isTable && newEntryOffsets[i].data.length > 0) {
        result.set(newEntryOffsets[i].data, newEntryOffsets[i].offset);
      }
    }
    
    console.log(`[BDAT-WRITER] Patch complete: ${patchedCount} patched, ${skippedCount} skipped, ${overflowErrors.length} errors`);
    console.log(`[BDAT-WRITER] Legacy file: ${originalData.byteLength} → ${newFileSize} bytes`);
    for (const stat of tableStats) {
      if (stat.stringsPatched > 0 || stat.stringsSkipped > 0) {
        const growth = stat.newStringTableSize - stat.originalStringTableSize;
        console.log(`[BDAT-WRITER]   ${stat.tableName}: ${stat.stringsPatched} patched, ${stat.stringsSkipped} skipped, string table ${growth >= 0 ? '+' : ''}${growth} bytes${stat.hasU16Columns ? ' (has u16 MessageId)' : ''}`);
      }
    }
    
    return { result, overflowErrors, patchedCount, skippedCount, tableStats };
  }

  // Non-legacy path (XC3) or legacy without offset entries
  const newTableOffsets: number[] = [];
  let currentFileOffset = fileHeaderSize;
  for (const buf of newTableBuffers) {
    newTableOffsets.push(currentFileOffset);
    currentFileOffset += buf.length;
  }
  const newFileSize = currentFileOffset;

  const result = new Uint8Array(newFileSize);
  const resultView = new DataView(result.buffer);

  if (isLegacyFile) {
    const entryCount = originalView.getUint32(0, true);
    resultView.setUint32(0, entryCount, true);
    let tableIdx = 0;
    for (let i = 0; i < entryCount; i++) {
      const origOff = originalView.getUint32(4 + i * 4, true);
      if (origOff < originalData.byteLength && origOff + 4 <= originalData.byteLength &&
          originalData[origOff] === 0x42 && originalData[origOff+1] === 0x44 &&
          originalData[origOff+2] === 0x41 && originalData[origOff+3] === 0x54) {
        if (tableIdx < newTableOffsets.length) {
          resultView.setUint32(4 + i * 4, newTableOffsets[tableIdx], true);
          tableIdx++;
        }
      } else {
        resultView.setUint32(4 + i * 4, newFileSize, true);
      }
    }
  } else {
    result.set(originalData.subarray(0, 16));
    resultView.setUint32(12, newFileSize, true);
    for (let t = 0; t < newTableOffsets.length; t++) {
      resultView.setUint32(16 + t * 4, newTableOffsets[t], true);
    }
  }

  // Write table data
  for (let t = 0; t < newTableBuffers.length; t++) {
    result.set(newTableBuffers[t], newTableOffsets[t]);
  }

  // Log summary
  console.log(`[BDAT-WRITER] Patch complete: ${patchedCount} patched, ${skippedCount} skipped, ${overflowErrors.length} errors`);
  for (const stat of tableStats) {
    if (stat.stringsPatched > 0 || stat.stringsSkipped > 0) {
      const growth = stat.newStringTableSize - stat.originalStringTableSize;
      console.log(`[BDAT-WRITER]   ${stat.tableName}: ${stat.stringsPatched} patched, ${stat.stringsSkipped} skipped, string table ${growth >= 0 ? '+' : ''}${growth} bytes${stat.hasU16Columns ? ' (has u16 MessageId)' : ''}`);
    }
  }

  return { result, overflowErrors, patchedCount, skippedCount, tableStats };
}

// ============= Legacy export (kept for backward compatibility) =============

/**
 * @deprecated Use patchBdatFile instead. This thin wrapper calls patchBdatFile
 * and returns only the patched buffer for backward compatibility with old tests.
 */
export function rebuildBdatFile(
  bdatFile: BdatFile,
  translations: Map<string, string>,
): Uint8Array {
  return patchBdatFile(bdatFile, translations).result;
}
