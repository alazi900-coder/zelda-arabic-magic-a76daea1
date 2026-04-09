/**
 * Danganronpa 1/2 PAK archive parser
 * 
 * PAK Type 2 (script PAK) format:
 *   u32 file_count
 *   For each file:
 *     u32 file_size
 *     u16[] file_name (null-terminated, padded to even)
 *     u8[] file_data
 *
 * PAK Type 1 (simple PAK) format:
 *   u32 magic / file_count
 *   u32[] file_offsets
 *   file data blocks
 *
 * This parser auto-detects the format by heuristics.
 *
 * LIN0 container format (Switch/Unity):
 *   4 bytes magic "LIN0"
 *   u32 file_count (LE)
 *   For each file:
 *     u32 name_length (byte count of null-terminated UTF-8 name)
 *     u8[] name (null-terminated)
 *     u32 data_length
 *     u8[] data
 */

export interface PakEntry {
  name: string;
  data: ArrayBuffer;
  index: number;
}

/**
 * Parse a DR1/DR2 PAK archive containing LIN or other files.
 * Uses heuristic detection since PAK has no magic bytes.
 */
/**
 * Check if buffer starts with a known magic string
 */
function getMagic(bytes: Uint8Array, len: number): string {
  let s = "";
  for (let i = 0; i < Math.min(len, bytes.length); i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

/**
 * Parse a LIN0 container (Switch/Unity).
 * Format: "LIN0" + u32 fileCount + for each: u32 nameLen, name bytes, u32 dataLen, data bytes
 */
export function parseLin0Container(buffer: ArrayBuffer): PakEntry[] | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 8) return null;
  const magic = getMagic(bytes, 4);
  if (magic !== "LIN0") return null;

  const view = new DataView(buffer);
  const fileCount = view.getUint32(4, true);
  if (fileCount === 0 || fileCount > 100000) return null;

  const entries: PakEntry[] = [];
  let pos = 8;

  try {
    for (let i = 0; i < fileCount; i++) {
      if (pos + 4 > bytes.length) return null;
      const nameLen = view.getUint32(pos, true);
      pos += 4;
      if (nameLen > 1024 || pos + nameLen > bytes.length) return null;

      // Read null-terminated UTF-8 name
      const nameBytes = bytes.slice(pos, pos + nameLen);
      let name = new TextDecoder("utf-8", { fatal: false }).decode(nameBytes).replace(/\0+$/, "");
      pos += nameLen;

      if (pos + 4 > bytes.length) return null;
      const dataLen = view.getUint32(pos, true);
      pos += 4;
      if (pos + dataLen > bytes.length) return null;

      const data = buffer.slice(pos, pos + dataLen);
      pos += dataLen;

      entries.push({ name: name || `file_${i}`, data, index: i });
    }
    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

/**
 * Try alternative LIN0 layout: "LIN0" + entries as (offset, size) pairs after header
 */
function tryLin0OffsetSize(buffer: ArrayBuffer): PakEntry[] | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 8) return null;
  const magic = getMagic(bytes, 4);
  if (magic !== "LIN0") return null;

  const view = new DataView(buffer);
  const fileCount = view.getUint32(4, true);
  if (fileCount === 0 || fileCount > 10000) return null;

  const headerSize = 8 + fileCount * 8;
  if (headerSize > buffer.byteLength) return null;

  const entries: PakEntry[] = [];
  try {
    for (let i = 0; i < fileCount; i++) {
      const offset = view.getUint32(8 + i * 8, true);
      const size = view.getUint32(8 + i * 8 + 4, true);
      if (offset + size > buffer.byteLength) return null;
      entries.push({ name: `file_${i.toString().padStart(3, "0")}`, data: buffer.slice(offset, offset + size), index: i });
    }
    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

/**
 * Parse PAK0 format (Switch): "PAK0" magic + u32 fileCount + N × (u32 offset, u32 size)
 */
function tryParsePak0WithMagic(buffer: ArrayBuffer): PakEntry[] | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 8) return null;
  const magic = getMagic(bytes, 4);
  if (magic !== "PAK0") return null;

  const view = new DataView(buffer);
  const fileCount = view.getUint32(4, true);
  if (fileCount === 0 || fileCount > 100000) return null;

  const tableStart = 8;
  const headerSize = tableStart + fileCount * 8;
  if (headerSize > buffer.byteLength) return null;

  const entries: PakEntry[] = [];
  try {
    for (let i = 0; i < fileCount; i++) {
      const offset = view.getUint32(tableStart + i * 8, true);
      const size = view.getUint32(tableStart + i * 8 + 4, true);
      if (offset + size > buffer.byteLength) return null;
      if (size === 0) continue;
      entries.push({
        name: `file_${i.toString().padStart(3, "0")}`,
        data: buffer.slice(offset, offset + size),
        index: i,
      });
    }
    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

export function parsePak(buffer: ArrayBuffer): PakEntry[] {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  if (bytes.length < 8) {
    throw new Error("ملف PAK قصير جداً");
  }

  const magic4 = getMagic(bytes, 4);

  // Check for PAK0 magic (Switch format)
  if (magic4 === "PAK0") {
    const pak0Result = tryParsePak0WithMagic(buffer);
    if (pak0Result) return pak0Result;
  }

  // Check for LIN0 magic
  if (magic4 === "LIN0") {
    const lin0Result = parseLin0Container(buffer);
    if (lin0Result) return lin0Result;
    const lin0Alt = tryLin0OffsetSize(buffer);
    if (lin0Alt) return lin0Alt;
  }

  const firstU32 = view.getUint32(0, true);

  // Heuristic: if first u32 is a reasonable file count and subsequent values
  // look like offsets, treat as simple offset-based PAK
  if (firstU32 > 0 && firstU32 < 100000) {
    // Try Type 2 (script PAK with embedded file sizes + names)
    const type2Result = tryParseType2Pak(buffer, firstU32);
    if (type2Result) return type2Result;

    // Try offset+size PAK (Switch format: each entry = offset u32 + size u32)
    const offsetSizeResult = tryParseOffsetSizePak(buffer, firstU32);
    if (offsetSizeResult) return offsetSizeResult;

    // Try simple offset-based PAK  
    const offsetResult = tryParseOffsetPak(buffer, firstU32);
    if (offsetResult) return offsetResult;
  }

  throw new Error("لم يتم التعرف على صيغة PAK");
}

function tryParseType2Pak(buffer: ArrayBuffer, fileCount: number): PakEntry[] | null {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entries: PakEntry[] = [];

  try {
    let pos = 4;
    for (let i = 0; i < fileCount; i++) {
      if (pos + 4 > bytes.length) return null;
      const fileSize = view.getUint32(pos, true);
      pos += 4;

      // Sanity check
      if (fileSize > bytes.length) return null;

      // Skip padding (2 bytes)
      pos += 2;

      // Read null-terminated UTF-16LE filename
      let name = "";
      while (pos + 1 < bytes.length) {
        const ch = view.getUint16(pos, true);
        pos += 2;
        if (ch === 0) break;
        name += String.fromCharCode(ch);
      }

      // If name is empty, this isn't type 2
      if (!name && i === 0) return null;

      // Pad to 16-byte boundary if needed
      // const alignedPos = (pos + 15) & ~15;
      // pos = alignedPos;

      if (pos + fileSize > bytes.length) return null;
      const data = buffer.slice(pos, pos + fileSize);
      pos += fileSize;

      entries.push({ name: name || `file_${i}`, data, index: i });
    }

    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

/**
 * Switch format PAK: header = fileCount, then N × (offset u32, size u32)
 */
function tryParseOffsetSizePak(buffer: ArrayBuffer, fileCount: number): PakEntry[] | null {
  const view = new DataView(buffer);
  const entries: PakEntry[] = [];

  try {
    const headerSize = 4 + fileCount * 8;
    if (headerSize > buffer.byteLength) return null;

    const fileEntries: { offset: number; size: number }[] = [];
    for (let i = 0; i < fileCount; i++) {
      const offset = view.getUint32(4 + i * 8, true);
      const size = view.getUint32(4 + i * 8 + 4, true);
      // Sanity: offset should be >= headerSize and within buffer
      if (offset < headerSize || size > buffer.byteLength || offset + size > buffer.byteLength) return null;
      fileEntries.push({ offset, size });
    }

    for (let i = 0; i < fileEntries.length; i++) {
      const { offset, size } = fileEntries[i];
      const data = buffer.slice(offset, offset + size);
      entries.push({ name: `file_${i.toString().padStart(3, "0")}`, data, index: i });
    }

    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

function tryParseOffsetPak(buffer: ArrayBuffer, fileCount: number): PakEntry[] | null {
  const view = new DataView(buffer);
  const entries: PakEntry[] = [];

  try {
    if (4 + fileCount * 4 > buffer.byteLength) return null;

    const offsets: number[] = [];
    for (let i = 0; i < fileCount; i++) {
      const offset = view.getUint32(4 + i * 4, true);
      if (offset > buffer.byteLength) return null;
      offsets.push(offset);
    }

    // Validate offsets are ascending
    for (let i = 1; i < offsets.length; i++) {
      if (offsets[i] < offsets[i - 1]) return null;
    }

    for (let i = 0; i < fileCount; i++) {
      const start = offsets[i];
      const end = i + 1 < fileCount ? offsets[i + 1] : buffer.byteLength;
      const data = buffer.slice(start, end);
      entries.push({ name: `file_${i.toString().padStart(3, "0")}`, data, index: i });
    }

    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

export function buildPak(entries: PakEntry[]): ArrayBuffer {
  // Build simple offset-based PAK
  const headerSize = 4 + entries.length * 4;
  const totalSize = headerSize + entries.reduce((s, e) => s + e.data.byteLength, 0);
  const out = new Uint8Array(totalSize);
  const outView = new DataView(out.buffer);

  outView.setUint32(0, entries.length, true);

  let dataPos = headerSize;
  for (let i = 0; i < entries.length; i++) {
    outView.setUint32(4 + i * 4, dataPos, true);
    out.set(new Uint8Array(entries[i].data), dataPos);
    dataPos += entries[i].data.byteLength;
  }

  return out.buffer as ArrayBuffer;
}
