/**
 * GFMSG Parser — reads Pokémon Scarlet/Violet .dat (MsgDataV2) and .tbl (AHTB) files.
 * 
 * Based on the GFMSG C# library by Fortelle:
 * https://github.com/Fortelle/GFMSG
 * 
 * .dat format (MsgDataV2):
 *   HeaderBlock:
 *     u16 languageNumber
 *     u16 stringNumber
 *     u32 maxLanguageBlockSize
 *     u32 dataCoding (0=plain, 1=coded)
 *     u32[] languageBlockOffsets[languageNumber]
 *   LanguageBlock (per language):
 *     u32 size
 *     StringParameter[stringNumber]:
 *       u32 offset
 *       u16 length (in u16 code units, including EOM)
 *       u16 userParam
 *     StringData: u16[] codes (XOR-encoded if dataCoding==1)
 * 
 * .tbl format (AHTB):
 *   char[4] magic = "AHTB"
 *   u32 entryCount
 *   Entry[entryCount]:
 *     u64 hash (FNV-1a)
 *     u16 nameLength (bytes, including null terminator)
 *     byte[] name[nameLength]
 */

const MASK = 0x2983;

function decodeStrings(encoded: Uint16Array, strIndex: number): Uint16Array {
  const decoded = new Uint16Array(encoded.length);
  let mask = (MASK * (strIndex + 3)) & 0xFFFF;
  for (let i = 0; i < encoded.length; i++) {
    decoded[i] = (encoded[i] ^ mask) & 0xFFFF;
    mask = ((mask & 0xE000) >>> 13) | ((mask & 0x1FFF) << 3);
    mask &= 0xFFFF;
  }
  return decoded;
}

function encodeStrings(decoded: Uint16Array, strIndex: number): Uint16Array {
  return decodeStrings(decoded, strIndex); // XOR is symmetric
}

/** Convert u16 codes to a string, handling tags as {TAG_GG_TT:params} */
function codesToText(codes: Uint16Array): string {
  const parts: string[] = [];
  let i = 0;
  while (i < codes.length) {
    const c = codes[i];
    if (c === 0) break; // null terminator
    if (c === 0x0010) {
      // Tag marker: next u16 = group, then type, then data length, then data
      if (i + 3 < codes.length) {
        const group = codes[i + 1];
        const type = codes[i + 2];
        const dataLen = codes[i + 3];
        const tagData: number[] = [];
        for (let j = 0; j < dataLen; j++) {
          if (i + 4 + j < codes.length) tagData.push(codes[i + 4 + j]);
        }
        const params = tagData.map(d => `0x${d.toString(16).padStart(4, '0')}`).join(',');
        parts.push(`{TAG_${group.toString(16).padStart(2, '0')}_${type.toString(16).padStart(2, '0')}:${params}}`);
        i += 4 + dataLen;
      } else {
        parts.push(String.fromCharCode(c));
        i++;
      }
    } else {
      parts.push(String.fromCharCode(c));
      i++;
    }
  }
  return parts.join('');
}

/** Convert text back to u16 codes */
function textToCodes(text: string): Uint16Array {
  const codes: number[] = [];
  const tagRe = /\{TAG_([0-9a-f]{2})_([0-9a-f]{2}):([^}]*)\}/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(text)) !== null) {
    // Add chars before tag
    for (let i = lastIndex; i < match.index; i++) {
      codes.push(text.charCodeAt(i));
    }
    // Add tag
    const group = parseInt(match[1], 16);
    const type = parseInt(match[2], 16);
    const params = match[3] ? match[3].split(',').map(p => parseInt(p.trim(), 16)) : [];
    codes.push(0x0010, group, type, params.length, ...params);
    lastIndex = match.index + match[0].length;
  }
  // Remaining chars
  for (let i = lastIndex; i < text.length; i++) {
    codes.push(text.charCodeAt(i));
  }
  codes.push(0); // null terminator
  return new Uint16Array(codes);
}

export interface GfmsgEntry {
  index: number;
  text: string;
  label: string; // from .tbl file, or index-based fallback
  userParam: number;
  codes: Uint16Array;
}

export interface GfmsgFile {
  filename: string;
  languageCount: number;
  stringCount: number;
  dataCoding: number;
  entries: GfmsgEntry[][]; // [language][string]
}

export interface AhtbEntry {
  hash: bigint;
  name: string;
}

/** Parse a .dat file (MsgDataV2 format) */
export function parseDatFile(data: ArrayBuffer, filename: string): GfmsgFile {
  const view = new DataView(data);
  let offset = 0;

  const languageCount = view.getUint16(offset, true); offset += 2;
  const stringCount = view.getUint16(offset, true); offset += 2;
  const maxBlockSize = view.getUint32(offset, true); offset += 4;
  const dataCoding = view.getUint32(offset, true); offset += 4;

  const langOffsets: number[] = [];
  for (let i = 0; i < languageCount; i++) {
    langOffsets.push(view.getUint32(offset, true));
    offset += 4;
  }

  const allEntries: GfmsgEntry[][] = [];

  for (let lang = 0; lang < languageCount; lang++) {
    const baseOffset = langOffsets[lang];
    let pos = baseOffset;
    const blockSize = view.getUint32(pos, true); pos += 4;

    // Read string parameters
    const params: { offset: number; length: number; userParam: number }[] = [];
    for (let s = 0; s < stringCount; s++) {
      const strOffset = view.getUint32(pos, true); pos += 4;
      const strLength = view.getUint16(pos, true); pos += 2;
      const userParam = view.getUint16(pos, true); pos += 2;
      params.push({ offset: strOffset, length: strLength, userParam });
    }

    // Read string data
    const entries: GfmsgEntry[] = [];
    for (let s = 0; s < stringCount; s++) {
      const strStart = baseOffset + params[s].offset;
      const raw = new Uint16Array(params[s].length);
      for (let j = 0; j < params[s].length; j++) {
        raw[j] = view.getUint16(strStart + j * 2, true);
      }

      const codes = dataCoding === 1 ? decodeStrings(raw, s) : raw;
      const text = codesToText(codes);

      entries.push({
        index: s,
        text,
        label: `${s}`,
        userParam: params[s].userParam,
        codes,
      });
    }

    allEntries.push(entries);
  }

  return {
    filename,
    languageCount,
    stringCount,
    dataCoding,
    entries: allEntries,
  };
}

/** Parse a .tbl file (AHTB format) */
export function parseTblFile(data: ArrayBuffer): AhtbEntry[] {
  const view = new DataView(data);
  const bytes = new Uint8Array(data);

  // Check magic "AHTB"
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== "AHTB") {
    throw new Error(`Invalid .tbl file: expected "AHTB" magic, got "${magic}"`);
  }

  const entryCount = view.getUint32(4, true);
  let offset = 8;
  const entries: AhtbEntry[] = [];

  for (let i = 0; i < entryCount; i++) {
    // Read u64 hash (little-endian)
    const lo = view.getUint32(offset, true);
    const hi = view.getUint32(offset + 4, true);
    const hash = (BigInt(hi) << 32n) | BigInt(lo);
    offset += 8;

    // Read name length (u16)
    const nameLen = view.getUint16(offset, true);
    offset += 2;

    // Read name bytes (ASCII, null-terminated)
    const nameBytes = bytes.slice(offset, offset + nameLen - 1); // exclude null
    const name = Array.from(nameBytes).map(b => String.fromCharCode(b)).join('');
    offset += nameLen;

    entries.push({ hash, name });
  }

  return entries;
}

/** Apply .tbl labels to .dat entries */
export function applyLabels(datFile: GfmsgFile, tblEntries: AhtbEntry[]): GfmsgFile {
  // tbl entries map by index to string entries
  for (const langEntries of datFile.entries) {
    for (let i = 0; i < langEntries.length && i < tblEntries.length; i++) {
      langEntries[i].label = tblEntries[i].name;
    }
  }
  return datFile;
}

/** Build modified .dat file from entries */
export function buildDatFile(file: GfmsgFile, translations: Record<string, string>): ArrayBuffer {
  // We rebuild all languages. For translation, we modify only language 0
  const langCount = file.languageCount;
  const strCount = file.stringCount;

  // Prepare entry codes for each language
  const allCodes: Uint16Array[][] = [];
  for (let lang = 0; lang < langCount; lang++) {
    const langCodes: Uint16Array[] = [];
    for (let s = 0; s < strCount; s++) {
      const entry = file.entries[lang][s];
      const key = `${file.filename}.${entry.label}`;
      const altKey = entry.label;

      if (lang === 0 && (translations[key] || translations[altKey])) {
        const translated = translations[key] || translations[altKey];
        langCodes.push(textToCodes(translated));
      } else {
        // Re-encode original codes with null terminator
        const original = new Uint16Array(entry.codes.length + 1);
        original.set(entry.codes);
        original[entry.codes.length] = 0;
        langCodes.push(original);
      }
    }
    allCodes.push(langCodes);
  }

  // Calculate sizes
  const headerSize = 12 + 4 * langCount;
  const langBlockSizes: number[] = [];
  const langParamsSize = 4 + 8 * strCount; // u32 size + (u32 offset + u16 len + u16 param) * strCount

  for (let lang = 0; lang < langCount; lang++) {
    let strOffset = langParamsSize;
    for (let s = 0; s < strCount; s++) {
      const len = allCodes[lang][s].length;
      strOffset += len * 2;
      if (len % 2 === 1) strOffset += 2; // alignment padding
    }
    langBlockSizes.push(strOffset);
  }

  let totalSize = headerSize;
  const langOffsets: number[] = [];
  for (let lang = 0; lang < langCount; lang++) {
    langOffsets.push(totalSize);
    totalSize += langBlockSizes[lang];
  }

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  let pos = 0;

  // Write header
  view.setUint16(pos, langCount, true); pos += 2;
  view.setUint16(pos, strCount, true); pos += 2;
  view.setUint32(pos, Math.max(...langBlockSizes), true); pos += 4;
  view.setUint32(pos, file.dataCoding, true); pos += 4;
  for (let lang = 0; lang < langCount; lang++) {
    view.setUint32(pos, langOffsets[lang], true); pos += 4;
  }

  // Write language blocks
  for (let lang = 0; lang < langCount; lang++) {
    const blockStart = langOffsets[lang];
    view.setUint32(pos, langBlockSizes[lang], true); pos += 4;

    // Calculate string offsets within block
    let strDataOffset = 4 + 8 * strCount;
    const strOffsets: number[] = [];
    for (let s = 0; s < strCount; s++) {
      strOffsets.push(strDataOffset);
      const len = allCodes[lang][s].length;
      strDataOffset += len * 2;
      if (len % 2 === 1) strDataOffset += 2;
    }

    // Write parameters
    for (let s = 0; s < strCount; s++) {
      view.setUint32(pos, strOffsets[s], true); pos += 4;
      view.setUint16(pos, allCodes[lang][s].length, true); pos += 2;
      view.setUint16(pos, file.entries[lang][s].userParam, true); pos += 2;
    }

    // Write string data
    for (let s = 0; s < strCount; s++) {
      const codes = file.dataCoding === 1
        ? encodeStrings(allCodes[lang][s], s)
        : allCodes[lang][s];
      for (let j = 0; j < codes.length; j++) {
        view.setUint16(pos, codes[j], true); pos += 2;
      }
      if (codes.length % 2 === 1) {
        view.setUint16(pos, 0, true); pos += 2; // padding
      }
    }
  }

  return buffer;
}

/** Export entries as JSON for easy editing */
export function exportAsJson(file: GfmsgFile, langIndex = 0): Record<string, string> {
  const result: Record<string, string> = {};
  const entries = file.entries[langIndex] || [];
  for (const entry of entries) {
    result[entry.label] = entry.text;
  }
  return result;
}
