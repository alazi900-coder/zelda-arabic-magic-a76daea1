/**
 * Risen 1 `strings.p00` — rebuild logic.
 *
 * Strategy:
 *   1. Rebuild each TAB0 from scratch with new string lengths.
 *   2. Preserve everything OUTSIDE the tables (pre-TAB0 header, between-table
 *      padding [confirmed 0 bytes per spec], and post-last-table trailer)
 *      byte-for-byte.
 *   3. Post-rebuild, patch any little-endian uint32 in the pre-TAB0 header and
 *      trailer that matches an original TAB0 offset — remap to new offset.
 *      This handles the file-info index table without needing its full spec.
 *   4. Patch any uint32 matching original total file size → new file size.
 *
 * The heuristic patch (step 3-4) is defensive: if the file has a stronger
 * checksum we cannot know about, the user will get a clear error on first
 * real-file test, and we adjust.
 */

import {
  parseP00,
  parseTab0,
  type Tab0Table,
} from "./risen-tab0-parser";

export interface RebuildResult {
  buffer: ArrayBuffer;
  originalSize: number;
  newSize: number;
  sizeDelta: number;
  offsetRemap: Array<{ table: string; oldOffset: number; newOffset: number }>;
  patchedU32Count: number;
  warnings: string[];
}

/**
 * Translations map keyed as `${tableName}:${fieldName}:${rowIndex}` → Arabic string.
 * Only entries whose keys are present will be written; others keep the original value.
 */
export type TranslationMap = Map<string, string>;

export function makeKey(tableName: string, fieldName: string, rowIndex: number): string {
  return `${tableName}:${fieldName}:${rowIndex}`;
}

function writeUtf16LE(view: DataView, offset: number, str: string): number {
  for (let i = 0; i < str.length; i++) {
    view.setUint16(offset + i * 2, str.charCodeAt(i), true);
  }
  return offset + str.length * 2;
}

/** Compute byte length of a rebuilt TAB0 table given its (possibly modified) field values. */
function computeTab0Size(table: Tab0Table, replacements: Map<string, string[]>): number {
  let size = 4 + 4 + 8 + 4; // magic + version(2×u16) + timestamp + field_count
  for (const field of table.fields) {
    size += 1 + 2 + 2 + field.name.length * 2 + 4; // flag+unk+name_len+name+row_count
    const values = replacements.get(field.name) ?? field.values;
    for (const v of values) {
      size += 2 + v.length * 2;
    }
  }
  return size;
}

function writeTab0(
  view: DataView,
  offset: number,
  table: Tab0Table,
  replacements: Map<string, string[]>
): number {
  let p = offset;
  view.setUint8(p, 0x54); view.setUint8(p + 1, 0x41); view.setUint8(p + 2, 0x42); view.setUint8(p + 3, 0x30);
  p += 4;
  view.setUint16(p, table.version[0], true); p += 2;
  view.setUint16(p, table.version[1], true); p += 2;
  view.setBigInt64(p, table.timestamp, true); p += 8;
  view.setUint32(p, table.fields.length, true); p += 4;

  for (const field of table.fields) {
    view.setUint8(p, 1); p += 1;
    view.setUint16(p, 1, true); p += 2;
    view.setUint16(p, field.name.length, true); p += 2;
    p = writeUtf16LE(view, p, field.name);
    const values = replacements.get(field.name) ?? field.values;
    view.setUint32(p, values.length, true); p += 4;
    for (const v of values) {
      view.setUint16(p, v.length, true); p += 2;
      p = writeUtf16LE(view, p, v);
    }
  }

  return p;
}

/** Patch every little-endian uint32 in [start, end) that equals `oldValue` → `newValue`. */
function patchU32(view: DataView, start: number, end: number, oldValue: number, newValue: number): number {
  let count = 0;
  const limit = Math.min(end, view.byteLength) - 4;
  for (let i = start; i <= limit; i++) {
    if (view.getUint32(i, true) === oldValue) {
      view.setUint32(i, newValue, true);
      count++;
    }
  }
  return count;
}

export interface RebuildOptions {
  /**
   * Which field to overwrite with the Arabic translation.
   * Default: "English_Text".
   */
  targetField?: string;
}

export function rebuildP00(
  originalBuffer: ArrayBuffer,
  translations: TranslationMap,
  options: RebuildOptions = {}
): RebuildResult {
  const parsed = parseP00(originalBuffer);
  const targetField = options.targetField ?? "English_Text";
  const warnings: string[] = [];

  // Build replacement value arrays per (table, field).
  const perTableReplacements = new Map<string, Map<string, string[]>>();
  for (const table of parsed.tables) {
    const map = new Map<string, string[]>();
    const field = table.fields.find((f) => f.name === targetField);
    if (!field) continue;
    const newValues = field.values.slice();
    for (let r = 0; r < field.rowCount; r++) {
      const key = makeKey(table.name, targetField, r);
      const t = translations.get(key);
      if (t !== undefined && t !== "") {
        newValues[r] = t;
      }
    }
    map.set(targetField, newValues);
    perTableReplacements.set(table.name, map);
  }

  // Compute new table sizes and new offsets.
  const oldFirstTableOffset = parsed.tables[0].offset;
  const oldTrailerOffset = parsed.trailerOffset;
  const oldTotalSize = parsed.totalSize;

  const newSizes: number[] = [];
  let cursor = oldFirstTableOffset;
  const newTableOffsets: number[] = [];
  for (const table of parsed.tables) {
    const replacements = perTableReplacements.get(table.name) ?? new Map();
    const size = computeTab0Size(table, replacements);
    newSizes.push(size);
    newTableOffsets.push(cursor);
    cursor += size;
  }
  const newTrailerOffset = cursor;
  const trailerSize = oldTotalSize - oldTrailerOffset;
  const newTotalSize = newTrailerOffset + trailerSize;

  // Assemble the new buffer.
  const out = new ArrayBuffer(newTotalSize);
  const outView = new DataView(out);
  const outBytes = new Uint8Array(out);
  const origBytes = new Uint8Array(originalBuffer);

  // 1. Copy pre-TAB0 header verbatim.
  outBytes.set(origBytes.subarray(0, oldFirstTableOffset), 0);

  // 2. Write each rebuilt table.
  for (let i = 0; i < parsed.tables.length; i++) {
    const replacements = perTableReplacements.get(parsed.tables[i].name) ?? new Map();
    writeTab0(outView, newTableOffsets[i], parsed.tables[i], replacements);
  }

  // 3. Copy trailer (post-last-table region: gap + FileInfoHdr) verbatim.
  outBytes.set(origBytes.subarray(oldTrailerOffset, oldTotalSize), newTrailerOffset);

  // 4. Verify by re-parsing rebuilt tables (structural roundtrip check).
  for (let i = 0; i < parsed.tables.length; i++) {
    try {
      const reparsed = parseTab0(out, newTableOffsets[i], parsed.tables[i].name);
      if (reparsed.fields.length !== parsed.tables[i].fields.length) {
        throw new Error(
          `field_count mismatch after rebuild for ${parsed.tables[i].name}`
        );
      }
    } catch (e) {
      throw new Error(
        `Rebuild verification failed for table ${parsed.tables[i].name}: ${(e as Error).message}`
      );
    }
  }

  // 5. Heuristic patch: fix offset references in the post-trailer region
  // (the file-info index) and in the pre-TAB0 header, and update total_filesize.
  const offsetRemap: Array<{ table: string; oldOffset: number; newOffset: number }> = [];
  let patchedU32Count = 0;

  // Table offsets rarely change for the first table; the rest shift.
  for (let i = 0; i < parsed.tables.length; i++) {
    const oldO = parsed.tables[i].offset;
    const newO = newTableOffsets[i];
    if (oldO === newO) continue;
    offsetRemap.push({ table: parsed.tables[i].name, oldOffset: oldO, newOffset: newO });
    // Patch inside pre-TAB0 header
    patchedU32Count += patchU32(outView, 0, oldFirstTableOffset, oldO, newO);
    // Patch inside trailer
    patchedU32Count += patchU32(outView, newTrailerOffset, newTotalSize, oldO, newO);
  }

  // Patch total file size (if the header stores it).
  if (oldTotalSize !== newTotalSize) {
    const sizePatches =
      patchU32(outView, 0, oldFirstTableOffset, oldTotalSize, newTotalSize) +
      patchU32(outView, newTrailerOffset, newTotalSize, oldTotalSize, newTotalSize);
    patchedU32Count += sizePatches;
    if (sizePatches === 0) {
      warnings.push(
        "Could not locate an original total_filesize field to patch — the game may reject the file if it validates size."
      );
    }
  }

  return {
    buffer: out,
    originalSize: oldTotalSize,
    newSize: newTotalSize,
    sizeDelta: newTotalSize - oldTotalSize,
    offsetRemap,
    patchedU32Count,
    warnings,
  };
}
