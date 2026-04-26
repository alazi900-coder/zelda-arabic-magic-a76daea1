/**
 * Pokémon Scarlet/Violet text parser — handles .dat (MsgDataV2) binary files.
 *
 * Supports:
 *  - Dynamic header detection (v2-u16, v2-u32, v1-flat)
 *  - XOR decryption (base key 0x7C89, advance 0x2983)
 *  - [VAR XX_YYYY:params] tag format
 *  - Gibberish detection with auto-retry without XOR
 *  - AHTB .tbl label files
 *  - Full rebuild (buildDat)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PokemonTextEntry {
  index: number;
  label: string;
  text: string;
  originalText: string;
  userParam: number;
  rawCodes: Uint16Array;
}

export interface PokemonTextFile {
  filename: string;
  headerType: 'v2-u16' | 'v2-u32' | 'v1-flat' | 'unknown';
  sectionCount: number;
  lineCount: number;
  encrypted: boolean;
  entries: PokemonTextEntry[];
  /** Raw buffer kept for rebuild */
  _rawBuffer: ArrayBuffer;
  _headerOffset: number;
}

export interface AhtbLabel {
  hash: bigint;
  name: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE_KEY   = 0x7C89;
const KEY_ADVANCE = 0x2983;

// ─── XOR Encryption / Decryption ─────────────────────────────────────────────

function rotateKey(key: number): number {
  return ((key << 3) | (key >>> 13)) & 0xFFFF;
}

function cryptLineData(data: Uint8Array<ArrayBuffer>, lineKey: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(data.length);
  let k = lineKey;
  for (let i = 0; i + 1 < data.length; i += 2) {
    out[i]     = data[i]     ^ (k & 0xFF);
    out[i + 1] = data[i + 1] ^ ((k >> 8) & 0xFF);
    k = rotateKey(k);
  }
  // Handle odd trailing byte
  if (data.length % 2 === 1) {
    out[data.length - 1] = data[data.length - 1] ^ (k & 0xFF);
  }
  return out;
}

// ─── Text Decode / Encode ────────────────────────────────────────────────────

function decodeLine(codes: Uint16Array): string {
  const parts: string[] = [];
  let i = 0;
  while (i < codes.length) {
    const c = codes[i];
    if (c === 0x0000) break; // terminator
    if (c === 0xBE00 || c === 0x000A) {
      parts.push('\n');
      i++;
      continue;
    }
    if (c === 0x0010) {
      // Variable tag: [VAR GG_TTTT:params]
      if (i + 3 < codes.length) {
        const group = codes[i + 1];
        const type  = codes[i + 2];
        const dataLen = codes[i + 3];
        const paramParts: string[] = [];
        for (let j = 0; j < dataLen && i + 4 + j < codes.length; j++) {
          paramParts.push('0x' + codes[i + 4 + j].toString(16).padStart(4, '0'));
        }
        const groupHex = group.toString(16).padStart(2, '0').toUpperCase();
        const typeHex  = type.toString(16).padStart(4, '0').toUpperCase();
        if (paramParts.length > 0) {
          parts.push(`[VAR ${groupHex}_${typeHex}:${paramParts.join(',')}]`);
        } else {
          parts.push(`[VAR ${groupHex}_${typeHex}]`);
        }
        i += 4 + dataLen;
      } else {
        parts.push(String.fromCharCode(c));
        i++;
      }
      continue;
    }
    parts.push(String.fromCharCode(c));
    i++;
  }
  return parts.join('');
}

function encodeLine(text: string): Uint16Array {
  const codes: number[] = [];
  const varRe = /\[VAR ([0-9A-Fa-f]{2})_([0-9A-Fa-f]{4})(?::([^\]]*))?\]/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = varRe.exec(text)) !== null) {
    // Characters before the tag
    for (let i = lastIdx; i < match.index; i++) {
      const ch = text.charCodeAt(i);
      if (text[i] === '\n') {
        codes.push(0xBE00);
      } else {
        codes.push(ch);
      }
    }
    const group = parseInt(match[1], 16);
    const type  = parseInt(match[2], 16);
    if (isNaN(group) || isNaN(type)) {
      console.warn("[pokemon-text-parser] تجاهل tag بقيم hex غير صالحة:", match[0]);
      lastIdx = match.index + match[0].length;
      continue;
    }
    const params = match[3]
      ? match[3].split(',').map(p => parseInt(p.trim(), 16)).filter(n => !isNaN(n))
      : [];
    codes.push(0x0010, group, type, params.length, ...params);
    lastIdx = match.index + match[0].length;
  }

  // Remaining characters
  for (let i = lastIdx; i < text.length; i++) {
    if (text[i] === '\n') {
      codes.push(0xBE00);
    } else {
      codes.push(text.charCodeAt(i));
    }
  }
  codes.push(0x0000); // terminator
  return new Uint16Array(codes);
}

// ─── Gibberish Detection ─────────────────────────────────────────────────────

function isGibberish(text: string): boolean {
  if (text.length === 0) return false;
  let bad = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (
      (c > 0 && c < 0x20 && c !== 0x0A && c !== 0x0D) || // control chars
      (c >= 0xD800 && c <= 0xDFFF) ||                     // surrogates
      (c >= 0xE000 && c <= 0xF8FF) ||                     // private use
      (c >= 0x3000 && c <= 0x9FFF) ||                     // CJK (unexpected for EN/AR text)
      (c >= 0xAC00 && c <= 0xD7AF)                        // Korean Hangul
    ) {
      bad++;
    }
  }
  return bad / text.length > 0.2;
}

/** Score how "readable" entries are (higher = more readable Latin/Arabic text) */
function readabilityScore(entries: PokemonTextEntry[]): number {
  let good = 0, total = 0;
  for (const e of entries) {
    for (let i = 0; i < e.text.length; i++) {
      const c = e.text.charCodeAt(i);
      total++;
      if (
        (c >= 0x20 && c <= 0x7E) ||  // Basic Latin (English)
        (c >= 0x0600 && c <= 0x06FF) || // Arabic
        (c >= 0xFE70 && c <= 0xFEFF) || // Arabic Presentation Forms
        c === 0x0A || c === 0x0D       // newlines
      ) {
        good++;
      }
    }
  }
  return total === 0 ? 0 : good / total;
}

// ─── Header Detection ────────────────────────────────────────────────────────

interface HeaderInfo {
  type: 'v2-u16' | 'v2-u32' | 'v1-flat';
  sectionCount: number;
  lineCount: number;
  sectionDataOffset: number;
  headerSize: number;
  encrypted: boolean;
}

function tryV2U16(view: DataView, base: number, bufLen: number): HeaderInfo | null {
  if (base + 16 > bufLen) return null;
  const sections = view.getUint16(base, true);
  const lines    = view.getUint16(base + 2, true);
  const totalLen = view.getUint32(base + 4, true);
  const initKey  = view.getUint32(base + 8, true);
  const sdo      = view.getUint32(base + 12, true);

  if (sections < 1 || sections > 30) return null;
  if (lines < 1 || lines > 50000) return null;
  if (initKey !== 0) return null;
  if (sdo < 16 || sdo > bufLen) return null;
  if (totalLen > bufLen * 4) return null;

  const headerSize = 16 + sections * 4; // after header come section offsets
  if (headerSize > bufLen) return null;

  return {
    type: 'v2-u16',
    sectionCount: sections,
    lineCount: lines,
    sectionDataOffset: sdo,
    headerSize,
    encrypted: true,
  };
}

function tryV2U32(view: DataView, base: number, bufLen: number): HeaderInfo | null {
  if (base + 20 > bufLen) return null;
  const sections = view.getUint16(base, true);
  // 2 bytes padding
  const lines    = view.getUint32(base + 4, true);
  const totalLen = view.getUint32(base + 8, true);
  const initKey  = view.getUint32(base + 12, true);
  const sdo      = view.getUint32(base + 16, true);

  if (sections < 1 || sections > 30) return null;
  if (lines < 1 || lines > 200000) return null;
  if (initKey !== 0) return null;
  if (sdo < 20 || sdo > bufLen) return null;
  if (totalLen > bufLen * 4) return null;

  const headerSize = 20 + sections * 4;
  if (headerSize > bufLen) return null;

  return {
    type: 'v2-u32',
    sectionCount: sections,
    lineCount: lines,
    sectionDataOffset: sdo,
    headerSize,
    encrypted: true,
  };
}

function tryV1Flat(view: DataView, base: number, bufLen: number): HeaderInfo | null {
  if (base + 4 > bufLen) return null;
  const lines = view.getUint32(base, true);
  if (lines < 1 || lines > 50000) return null;

  // In v1-flat, line table starts right after count
  const tableSize = lines * 8; // offset(u32) + length(u32) per line
  if (base + 4 + tableSize > bufLen) return null;

  return {
    type: 'v1-flat',
    sectionCount: 1,
    lineCount: lines,
    sectionDataOffset: 4,
    headerSize: 4,
    encrypted: true,
  };
}

function detectHeader(view: DataView, bufLen: number): { header: HeaderInfo; offset: number } | null {
  // Try at offset 0 first, but only accept validated layouts
  for (const tryFn of [tryV2U16, tryV2U32, tryV1Flat]) {
    const h = tryFn(view, 0, bufLen);
    if (h && validateTableLayout(view, bufLen, 0, h)) {
      return { header: h, offset: 0 };
    }
  }

  // Scan for valid header elsewhere (e.g. after container header)
  const scanLimit = Math.min(bufLen, 2048);
  for (let off = 4; off < scanLimit; off += 4) {
    for (const tryFn of [tryV2U16, tryV2U32, tryV1Flat]) {
      const h = tryFn(view, off, bufLen);
      if (h && validateTableLayout(view, bufLen, off, h)) {
        return { header: h, offset: off };
      }
    }
  }

  return null;
}

// ─── Table Validation ────────────────────────────────────────────────────────

function validateTableLayout(
  view: DataView,
  bufLen: number,
  base: number,
  header: HeaderInfo
): boolean {
  const sampleCount = Math.min(header.lineCount, 64);

  if (header.type === 'v1-flat') {
    const tableStart = base + header.sectionDataOffset;
    for (let i = 0; i < sampleCount; i++) {
      const entryPos = tableStart + i * 8;
      if (entryPos + 8 > bufLen) return false;

      const offset = view.getUint32(entryPos, true);
      const length = view.getUint32(entryPos + 4, true);
      if (offset > bufLen || length > bufLen) return false;
      if (length > 0 && offset + length > bufLen) return false;
    }
    return true;
  }

  const sectionOffsetsPos = base + (header.type === 'v2-u16' ? 16 : 20);
  if (sectionOffsetsPos + 4 > bufLen) return false;

  const firstSectionOffset = view.getUint32(sectionOffsetsPos, true);
  const sectionBase = firstSectionOffset > 0 ? base + firstSectionOffset : base + header.sectionDataOffset;
  if (sectionBase + 4 > bufLen) return false;

  const blockSize = view.getUint32(sectionBase, true);
  if (blockSize < 4 || sectionBase + blockSize > bufLen) return false;

  const tableStart = sectionBase + 4;
  let nonEmptySeen = 0;

  for (let i = 0; i < sampleCount; i++) {
    const entryPos = tableStart + i * 8;
    if (entryPos + 8 > bufLen) return false;

    const strOffset = view.getUint32(entryPos, true);
    const strLen = view.getUint16(entryPos + 4, true);

    if (strOffset >= blockSize) return false;
    if (strLen > 0) {
      nonEmptySeen++;
      const absOffset = sectionBase + strOffset;
      const byteLen = strLen * 2;
      if (absOffset + byteLen > sectionBase + blockSize) return false;
    }
  }

  return sampleCount === 0 || nonEmptySeen > 0;
}

// ─── Raw UTF-16LE fallback ───────────────────────────────────────────────────

function tryRawUtf16(bytes: Uint8Array): PokemonTextEntry[] {
  if (bytes.length < 4 || bytes.length % 2 !== 0) return [];
  
  const codeCount = bytes.length / 2;
  const codes = new Uint16Array(codeCount);
  for (let i = 0; i < codeCount; i++) {
    codes[i] = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
  }
  
  const entries: PokemonTextEntry[] = [];
  let start = 0;
  for (let i = 0; i <= codeCount; i++) {
    if (i === codeCount || codes[i] === 0) {
      if (i > start) {
        const slice = codes.slice(start, i);
        const text = decodeLine(slice);
        if (text.trim()) {
          entries.push({
            index: entries.length,
            label: String(entries.length),
            text,
            originalText: text,
            userParam: 0,
            rawCodes: slice,
          });
        }
      }
      start = i + 1;
    }
  }
  
  if (entries.length > 0 && readabilityScore(entries) > 0.5) return entries;
  return [];
}

// ─── Read Lines ──────────────────────────────────────────────────────────────

function readLines(
  view: DataView,
  bytes: Uint8Array,
  base: number,
  header: HeaderInfo,
  useEncryption: boolean
): PokemonTextEntry[] {
  const entries: PokemonTextEntry[] = [];
  const tableStart = base + header.sectionDataOffset;
  let lineKey = BASE_KEY;

  for (let i = 0; i < header.lineCount; i++) {
    const entryPos = tableStart + i * 8;
    if (entryPos + 8 > bytes.length) break;

    const dataOffset = view.getUint32(entryPos, true);
    const dataLength = view.getUint32(entryPos + 4, true); // in bytes

    let text = '';
    let rawCodes = new Uint16Array(0);
    const userParam = 0;

    if (dataLength > 0 && dataOffset + dataLength <= bytes.length) {
      let lineBytes = new Uint8Array(Array.from(bytes.slice(dataOffset, dataOffset + dataLength))) as Uint8Array<ArrayBuffer>;

      if (useEncryption) {
        lineBytes = cryptLineData(lineBytes, lineKey);
      }

      // Convert to Uint16Array (UTF-16LE)
      const codeCount = Math.floor(lineBytes.length / 2);
      rawCodes = new Uint16Array(codeCount);
      for (let j = 0; j < codeCount; j++) {
        rawCodes[j] = lineBytes[j * 2] | (lineBytes[j * 2 + 1] << 8);
      }

      text = decodeLine(rawCodes);
    }

    entries.push({
      index: i,
      label: String(i),
      text,
      originalText: text,
      userParam,
      rawCodes,
    });

    lineKey = (lineKey + KEY_ADVANCE) & 0xFFFF;
  }

  return entries;
}

// ─── MsgDataV2 Section-based Reader (v2-u16, v2-u32) ────────────────────────

function readSectionBased(
  view: DataView,
  bytes: Uint8Array,
  base: number,
  header: HeaderInfo,
  useEncryption: boolean
): PokemonTextEntry[] {
  const entries: PokemonTextEntry[] = [];

  // Read section offsets
  const sectionOffsets: number[] = [];
  let pos = base + (header.type === 'v2-u16' ? 16 : 20);
  for (let s = 0; s < header.sectionCount; s++) {
    if (pos + 4 > bytes.length) break;
    sectionOffsets.push(view.getUint32(pos, true));
    pos += 4;
  }

  // Use first section (language 0) for reading
  const sectionBase = sectionOffsets.length > 0 ? base + sectionOffsets[0] : base + header.sectionDataOffset;

  if (sectionBase + 4 > bytes.length) {
    return readLines(view, bytes, base, header, useEncryption);
  }

  const blockSize = view.getUint32(sectionBase, true);
  let lineTablePos = sectionBase + 4;

  let lineKey = BASE_KEY;

  for (let i = 0; i < header.lineCount; i++) {
    if (lineTablePos + 8 > bytes.length) break;

    const strOffset = view.getUint32(lineTablePos, true);
    const strLen    = view.getUint16(lineTablePos + 4, true); // in u16 code units
    const userParam = view.getUint16(lineTablePos + 6, true);
    lineTablePos += 8;

    let text = '';
    let rawCodes = new Uint16Array(0);

    if (strLen > 0) {
      const absOffset = sectionBase + strOffset;
      const byteLen = strLen * 2;

      if (absOffset + byteLen <= bytes.length) {
        let lineBytes = new Uint8Array(Array.from(bytes.slice(absOffset, absOffset + byteLen))) as Uint8Array<ArrayBuffer>;

        if (useEncryption) {
          lineBytes = cryptLineData(lineBytes, lineKey);
        }

        rawCodes = new Uint16Array(strLen);
        for (let j = 0; j < strLen; j++) {
          rawCodes[j] = lineBytes[j * 2] | (lineBytes[j * 2 + 1] << 8);
        }

        text = decodeLine(rawCodes);
      }
    }

    entries.push({
      index: i,
      label: String(i),
      text,
      originalText: text,
      userParam,
      rawCodes,
    });

    lineKey = (lineKey + KEY_ADVANCE) & 0xFFFF;
  }

  return entries;
}

// ─── Robust File Read (Android compatibility) ────────────────────────────────

export async function readFileBufferRobust(file: File): Promise<ArrayBuffer> {
  // Strategy 1: Standard
  try {
    const buf = await file.arrayBuffer();
    if (buf.byteLength > 0 && !isAllZeros(new Uint8Array(buf, 0, Math.min(64, buf.byteLength)))) {
      return buf;
    }
  } catch { /* continue */ }

  // Strategy 2: Response wrapper
  try {
    const resp = new Response(file);
    const buf = await resp.arrayBuffer();
    if (buf.byteLength > 0 && !isAllZeros(new Uint8Array(buf, 0, Math.min(64, buf.byteLength)))) {
      return buf;
    }
  } catch { /* continue */ }

  // Strategy 3: FileReader
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader did not return ArrayBuffer'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function isAllZeros(data: Uint8Array): boolean {
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== 0) return false;
  }
  return true;
}

// ─── Main Parse Function ─────────────────────────────────────────────────────

export function loadPokemonTextFile(
  buffer: ArrayBuffer,
  tblLabels: AhtbLabel[] | null,
  filename: string
): PokemonTextFile {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const detected = detectHeader(view, buffer.byteLength);

  if (!detected) {
    // Fallback: try as raw UTF-16LE text file
    const fallbackEntries = tryRawUtf16(bytes);
    if (fallbackEntries.length > 0) {
      return {
        filename,
        headerType: 'unknown' as const,
        sectionCount: 1,
        lineCount: fallbackEntries.length,
        encrypted: false,
        entries: fallbackEntries,
        _rawBuffer: buffer,
        _headerOffset: 0,
      };
    }
    throw new Error(`لم يتم التعرف على صيغة الملف: ${filename}`);
  }

  const { header, offset: headerOffset } = detected;

  // Try BOTH encrypted and unencrypted, pick the best result
  const readFn = header.type === 'v1-flat' ? readLines : readSectionBased;

  const entriesEncrypted = readFn(view, bytes, headerOffset, header, true);
  const entriesPlain = readFn(view, bytes, headerOffset, header, false);

  const scoreEncrypted = readabilityScore(entriesEncrypted);
  const scorePlain = readabilityScore(entriesPlain);

  let entries: PokemonTextEntry[];
  let encrypted: boolean;

  if (scorePlain >= scoreEncrypted) {
    entries = entriesPlain;
    encrypted = false;
  } else {
    entries = entriesEncrypted;
    encrypted = true;
  }

  // Apply TBL labels if provided
  if (tblLabels) {
    for (let i = 0; i < entries.length && i < tblLabels.length; i++) {
      entries[i].label = tblLabels[i].name;
    }
  }

  return {
    filename,
    headerType: header.type,
    sectionCount: header.sectionCount,
    lineCount: header.lineCount,
    encrypted,
    entries,
    _rawBuffer: buffer,
    _headerOffset: headerOffset,
  };
}

// ─── AHTB .tbl Parser ───────────────────────────────────────────────────────

export function parseTblFile(data: ArrayBuffer): AhtbLabel[] {
  const view = new DataView(data);
  const bytes = new Uint8Array(data);

  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'AHTB') {
    throw new Error(`ملف .tbl غير صالح: توقّعنا "AHTB"، وجدنا "${magic}"`);
  }

  const entryCount = view.getUint32(4, true);
  let offset = 8;
  const entries: AhtbLabel[] = [];

  for (let i = 0; i < entryCount; i++) {
    if (offset + 10 > data.byteLength) break;

    const lo = view.getUint32(offset, true);
    const hi = view.getUint32(offset + 4, true);
    const hash = (BigInt(hi) << 32n) | BigInt(lo);
    offset += 8;

    const nameLen = view.getUint16(offset, true);
    offset += 2;

    const nameBytes = Array.from(bytes.slice(offset, offset + nameLen - 1));
    const name = nameBytes.map(b => String.fromCharCode(b)).join('');
    offset += nameLen;

    entries.push({ hash, name });
  }

  return entries;
}

// ─── Build / Rebuild .dat ────────────────────────────────────────────────────

export function buildDat(
  parsed: PokemonTextFile,
  newTexts: string[]
): ArrayBuffer {
  const header = detectHeader(
    new DataView(parsed._rawBuffer),
    parsed._rawBuffer.byteLength
  );

  if (!header) {
    throw new Error('Cannot rebuild: original header not found');
  }

  const { header: hdr, offset: base } = header;

  // Encode all texts
  const encodedLines: Uint8Array[] = [];
  let lineKey = BASE_KEY;

  for (let i = 0; i < parsed.lineCount; i++) {
    const text = i < newTexts.length ? newTexts[i] : (parsed.entries[i]?.text ?? '');
    const codes = encodeLine(text);

    // Convert to bytes (UTF-16LE)
    const lineBytes = new Uint8Array(codes.length * 2);
    for (let j = 0; j < codes.length; j++) {
      lineBytes[j * 2]     = codes[j] & 0xFF;
      lineBytes[j * 2 + 1] = (codes[j] >> 8) & 0xFF;
    }

    // Encrypt if original was encrypted
    const finalBytes = parsed.encrypted
      ? cryptLineData(lineBytes, lineKey)
      : lineBytes;

    encodedLines.push(finalBytes);
    lineKey = (lineKey + KEY_ADVANCE) & 0xFFFF;
  }

  if (hdr.type === 'v1-flat') {
    return buildV1Flat(encodedLines, parsed);
  } else {
    return buildV2Section(encodedLines, parsed, hdr);
  }
}

function buildV1Flat(lines: Uint8Array[], parsed: PokemonTextFile): ArrayBuffer {
  // Calculate total size
  const lineCount = lines.length;
  const tableSize = lineCount * 8; // offset(u32) + length(u32)
  let dataOffset = 4 + tableSize;

  const offsets: number[] = [];
  const lengths: number[] = [];

  for (const line of lines) {
    offsets.push(dataOffset);
    lengths.push(line.length);
    dataOffset += line.length;
    // Align to 2 bytes
    if (line.length % 2 === 1) dataOffset++;
  }

  const totalSize = dataOffset;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);

  // Write line count
  view.setUint32(0, lineCount, true);

  // Write table
  for (let i = 0; i < lineCount; i++) {
    view.setUint32(4 + i * 8, offsets[i], true);
    view.setUint32(4 + i * 8 + 4, lengths[i], true);
  }

  // Write line data
  for (let i = 0; i < lineCount; i++) {
    out.set(lines[i], offsets[i]);
  }

  return buffer;
}

function buildV2Section(
  lines: Uint8Array[],
  parsed: PokemonTextFile,
  hdr: HeaderInfo
): ArrayBuffer {
  const lineCount = lines.length;
  const sectionCount = parsed.sectionCount;

  // We only modify section 0 (language 0), copy other sections as-is
  const paramTableSize = lineCount * 8; // offset(u32) + length(u16) + userParam(u16)
  const strDataStart = 4 + paramTableSize; // 4 = block size u32

  // Calculate string data size
  let strDataSize = 0;
  for (let i = 0; i < lineCount; i++) {
    const codeUnits = lines[i].length / 2;
    strDataSize += codeUnits * 2;
    if (codeUnits % 2 === 1) strDataSize += 2; // padding
  }

  const blockSize = strDataStart + strDataSize;

  // For simplicity, rebuild with single section
  const headerSize = hdr.type === 'v2-u16' ? 16 : 20;
  const sectionOffsetsSize = sectionCount * 4;
  const totalHeaderSize = headerSize + sectionOffsetsSize;
  const totalSize = totalHeaderSize + blockSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);

  // Copy original header
  const origBytes = new Uint8Array(parsed._rawBuffer);
  const copyLen = Math.min(headerSize, origBytes.length);
  out.set(new Uint8Array(origBytes.buffer, origBytes.byteOffset + parsed._headerOffset, copyLen), 0);

  // Update line count if needed
  if (hdr.type === 'v2-u16') {
    view.setUint16(2, lineCount, true);
  } else {
    view.setUint32(4, lineCount, true);
  }

  // Write section offset (pointing to right after header + offsets)
  for (let s = 0; s < sectionCount; s++) {
    view.setUint32(headerSize + s * 4, totalHeaderSize, true);
  }

  // Write section block
  const sectionStart = totalHeaderSize;
  view.setUint32(sectionStart, blockSize, true);

  // Write string parameters and data
  let strOffset = strDataStart;
  for (let i = 0; i < lineCount; i++) {
    const paramPos = sectionStart + 4 + i * 8;
    const codeUnits = lines[i].length / 2;

    view.setUint32(paramPos, strOffset, true);
    view.setUint16(paramPos + 4, codeUnits, true);
    view.setUint16(paramPos + 6, parsed.entries[i]?.userParam ?? 0, true);

    // Write string data
    out.set(lines[i], sectionStart + strOffset);
    strOffset += codeUnits * 2;
    if (codeUnits % 2 === 1) {
      strOffset += 2; // padding
    }
  }

  return buffer;
}

// ─── Export for Editor ───────────────────────────────────────────────────────

export function exportAsJson(file: PokemonTextFile): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of file.entries) {
    if (entry.text.trim()) {
      result[entry.label] = entry.text;
    }
  }
  return result;
}
