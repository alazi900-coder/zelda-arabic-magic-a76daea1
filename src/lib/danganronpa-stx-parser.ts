/**
 * Danganronpa V3 STX text file parser
 * Format:
 *   4B  magic "STXT"
 *   4B  lang  "JPLL"
 *   u32 unknown (1)
 *   u32 table_offset (32)
 *   u32 unknown (8)
 *   u32 table_length (string count)
 *   8B  padding
 *   String Offset Table: N × (u32 string_id, u32 string_offset)
 *   Strings: null-terminated UTF-16LE
 */

export interface StxFile {
  lang: string;
  strings: string[];
}

export function parseStx(buffer: ArrayBuffer): StxFile {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Read magic
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== "STXT") {
    throw new Error(`ليس ملف STX صالح — التوقيع: ${magic}`);
  }

  const lang = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  const tableOffset = view.getUint32(12, true);
  const tableLength = view.getUint32(20, true);

  const strings: string[] = [];

  for (let i = 0; i < tableLength; i++) {
    const entryPos = tableOffset + i * 8;
    // const stringId = view.getUint32(entryPos, true);
    const stringOffset = view.getUint32(entryPos + 4, true);

    // Read null-terminated UTF-16LE string
    let str = "";
    let pos = stringOffset;
    while (pos + 1 < bytes.length) {
      const charCode = view.getUint16(pos, true);
      if (charCode === 0) break;
      str += String.fromCharCode(charCode);
      pos += 2;
    }
    strings.push(str);
  }

  return { lang, strings };
}

export function buildStx(strings: string[]): ArrayBuffer {
  // Calculate sizes
  const indexTableSize = strings.length * 8;

  // Build string table, deduplicating identical strings
  const stringData: number[] = [];
  const stringOffsets: number[] = [];
  const seen = new Map<string, number>();
  const baseOffset = 32 + indexTableSize;

  for (const str of strings) {
    if (seen.has(str)) {
      stringOffsets.push(seen.get(str)!);
    } else {
      const offset = baseOffset + stringData.length;
      seen.set(str, offset);
      stringOffsets.push(offset);

      // Write UTF-16LE null-terminated
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        stringData.push(code & 0xff, (code >> 8) & 0xff);
      }
      // Null terminator
      stringData.push(0, 0);
    }
  }

  const totalSize = baseOffset + stringData.length;
  const out = new ArrayBuffer(totalSize);
  const outView = new DataView(out);
  const outBytes = new Uint8Array(out);

  // Header
  outBytes.set([0x53, 0x54, 0x58, 0x54], 0); // STXT
  outBytes.set([0x4a, 0x50, 0x4c, 0x4c], 4); // JPLL
  outView.setUint32(8, 1, true);              // unknown
  outView.setUint32(12, 32, true);            // table offset
  outView.setUint32(16, 8, true);             // unknown
  outView.setUint32(20, strings.length, true); // table length
  // 24-31: padding (zeros)

  // Index table
  for (let i = 0; i < strings.length; i++) {
    const entryPos = 32 + i * 8;
    outView.setUint32(entryPos, i, true);              // string ID
    outView.setUint32(entryPos + 4, stringOffsets[i], true); // string offset
  }

  // String data
  outBytes.set(new Uint8Array(stringData), baseOffset);

  return out;
}
