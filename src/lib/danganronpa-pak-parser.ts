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
export function parsePak(buffer: ArrayBuffer): PakEntry[] {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  if (bytes.length < 8) {
    throw new Error("ملف PAK قصير جداً");
  }

  const firstU32 = view.getUint32(0, true);

  // Heuristic: if first u32 is a reasonable file count and subsequent values
  // look like offsets, treat as simple offset-based PAK
  if (firstU32 > 0 && firstU32 < 10000) {
    // Try Type 2 (script PAK with embedded file sizes + names)
    const type2Result = tryParseType2Pak(buffer, firstU32);
    if (type2Result) return type2Result;

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
