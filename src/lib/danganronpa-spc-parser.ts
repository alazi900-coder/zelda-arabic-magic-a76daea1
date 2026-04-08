/**
 * Danganronpa V3 SPC archive parser
 * Format:
 *   4B  magic "CPS."
 *   36B padding
 *   u32 file_count
 *   u32 unknown
 *   16B padding
 *   4B  "Root"
 *   12B padding
 *   File entries: compression_flag(u16), unknown(u16), cmp_size(u32),
 *                 dec_size(u32), name_len(u32), 16B padding,
 *                 name (padded to 16B), compressed data (padded to 16B)
 */

export interface SpcEntry {
  name: string;
  data: ArrayBuffer;
  compressionFlag: number;
}

function bitReverse(b: number): number {
  return ((b * 0x0202020202) & 0x010884422010) % 1023;
}

function spcDecompress(data: Uint8Array): Uint8Array {
  const res: number[] = [];
  let flag = 1;
  let p = 0;

  while (p < data.length) {
    if (flag === 1) {
      flag = 0x100 | bitReverse(data[p]);
      p++;
    }
    if (p >= data.length) break;

    if (flag & 1) {
      res.push(data[p]);
      p++;
    } else {
      if (p + 1 >= data.length) break;
      const b = (data[p + 1] << 8) | data[p];
      p += 2;
      const count = (b >> 10) + 2;
      const offset = b & 0x3ff;
      for (let i = 0; i < count; i++) {
        res.push(res[res.length - 1024 + offset] ?? 0);
      }
    }
    flag >>= 1;
  }

  return new Uint8Array(res);
}

function spcCompress(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let pos = 0;
  const dataLen = data.length;

  while (pos < dataLen) {
    let flag = 0;
    let flagBit = 0;
    const block: number[] = [];

    while (flagBit < 8 && pos < dataLen) {
      let bestLen = 0;
      let bestOffset = 0;
      const searchBackLen = Math.min(pos, 1024);

      // Try to find a match in the sliding window
      for (let seqLen = 2; seqLen <= 65 && seqLen <= dataLen - pos; seqLen++) {
        let found = -1;
        for (let j = 1; j <= searchBackLen; j++) {
          let match = true;
          for (let k = 0; k < seqLen; k++) {
            if (data[pos + k] !== data[pos - j + k]) {
              match = false;
              break;
            }
          }
          if (match) {
            found = j;
            break;
          }
        }
        if (found !== -1) {
          bestLen = seqLen;
          bestOffset = found;
        } else {
          break;
        }
      }

      if (bestLen >= 2) {
        // Compressed reference
        const windowOffset = (1024 - bestOffset) & 0x3ff;
        const b = ((bestLen - 2) << 10) | windowOffset;
        block.push(b & 0xff, (b >> 8) & 0xff);
        pos += bestLen;
      } else {
        // Raw byte
        flag |= (1 << flagBit);
        block.push(data[pos]);
        pos++;
      }
      flagBit++;
    }

    out.push(bitReverse(flag & 0xff) & 0xff);
    out.push(...block);
  }

  return new Uint8Array(out);
}

export function parseSpc(buffer: ArrayBuffer): SpcEntry[] {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== "CPS.") {
    throw new Error(`ليس ملف SPC صالح — التوقيع: ${magic}`);
  }

  let pos = 4 + 36; // skip magic + padding
  const fileCount = view.getUint32(pos, true);
  pos += 4;
  pos += 4; // unknown
  pos += 16; // padding
  pos += 4; // "Root"
  pos += 12; // padding

  const entries: SpcEntry[] = [];

  for (let i = 0; i < fileCount; i++) {
    const compressionFlag = view.getUint16(pos, true);
    pos += 2;
    pos += 2; // unknown
    const compressedSize = view.getUint32(pos, true);
    pos += 4;
    const decompressedSize = view.getUint32(pos, true);
    pos += 4;
    const nameLength = view.getUint32(pos, true) + 1; // null terminated
    pos += 4;
    pos += 16; // padding

    const namePadding = (16 - (nameLength % 16)) % 16;
    const filePadding = (16 - (compressedSize % 16)) % 16;

    // Read name
    let name = "";
    for (let j = 0; j < nameLength - 1; j++) {
      name += String.fromCharCode(bytes[pos + j]);
    }
    pos += nameLength + namePadding;

    // Read file data
    const compressedData = bytes.slice(pos, pos + compressedSize);
    pos += compressedSize + filePadding;

    let fileData: ArrayBuffer;
    if (compressionFlag === 2 || compressionFlag === 1) {
      const decompressed = spcDecompress(compressedData);
      fileData = decompressed.buffer.slice(
        decompressed.byteOffset,
        decompressed.byteOffset + Math.min(decompressed.byteLength, decompressedSize)
      ) as ArrayBuffer;
    } else {
      fileData = compressedData.buffer.slice(
        compressedData.byteOffset,
        compressedData.byteOffset + compressedData.byteLength
      );
    }

    entries.push({ name, data: fileData, compressionFlag });
  }

  return entries;
}

export function buildSpc(entries: SpcEntry[]): ArrayBuffer {
  const parts: Uint8Array[] = [];

  // Header
  const header = new Uint8Array(4 + 36 + 4 + 4 + 16 + 4 + 12);
  const hView = new DataView(header.buffer);
  header.set([0x43, 0x50, 0x53, 0x2e], 0); // CPS.
  hView.setUint32(40, entries.length, true); // file count
  header.set([0x52, 0x6f, 0x6f, 0x74], 60); // Root
  parts.push(header);

  for (const entry of entries) {
    const rawData = new Uint8Array(entry.data);
    const compressed = spcCompress(rawData);
    const nameBytes = new TextEncoder().encode(entry.name);
    const nameLen = nameBytes.length;
    const namePadding = (16 - ((nameLen + 1) % 16)) % 16;
    const filePadding = (16 - (compressed.length % 16)) % 16;

    const entryHeader = new Uint8Array(2 + 2 + 4 + 4 + 4 + 16);
    const eView = new DataView(entryHeader.buffer);
    eView.setUint16(0, 2, true); // compression flag
    eView.setUint16(2, 1, true); // unknown
    eView.setUint32(4, compressed.length, true);
    eView.setUint32(8, rawData.length, true);
    eView.setUint32(12, nameLen, true);
    parts.push(entryHeader);

    const nameBlock = new Uint8Array(nameLen + 1 + namePadding);
    nameBlock.set(nameBytes, 0);
    parts.push(nameBlock);

    const dataBlock = new Uint8Array(compressed.length + filePadding);
    dataBlock.set(compressed, 0);
    parts.push(dataBlock);
  }

  const totalSize = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(totalSize);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out.buffer as ArrayBuffer;
}
