import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ============= Arabic Reshaping (same as zelda arabize) =============
function isArabicCode(code: number): boolean {
  return (code >= 0x0600 && code <= 0x06FF) || (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF);
}

function hasArabicChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (isArabicCode(text.charCodeAt(i))) return true;
  }
  return false;
}

function hasArabicPresentationForms(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if ((code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF)) return true;
  }
  return false;
}

const ARABIC_FORMS: Record<number, [number, number, number | null, number | null]> = {
  0x0621: [0xFE80, 0xFE80, null, null],
  0x0622: [0xFE81, 0xFE82, null, null],
  0x0623: [0xFE83, 0xFE84, null, null],
  0x0624: [0xFE85, 0xFE86, null, null],
  0x0625: [0xFE87, 0xFE88, null, null],
  0x0626: [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C],
  0x0627: [0xFE8D, 0xFE8E, null, null],
  0x0628: [0xFE8F, 0xFE90, 0xFE91, 0xFE92],
  0x0629: [0xFE93, 0xFE94, null, null],
  0x062A: [0xFE95, 0xFE96, 0xFE97, 0xFE98],
  0x062B: [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C],
  0x062C: [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0],
  0x062D: [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4],
  0x062E: [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8],
  0x062F: [0xFEA9, 0xFEAA, null, null],
  0x0630: [0xFEAB, 0xFEAC, null, null],
  0x0631: [0xFEAD, 0xFEAE, null, null],
  0x0632: [0xFEAF, 0xFEB0, null, null],
  0x0633: [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4],
  0x0634: [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8],
  0x0635: [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC],
  0x0636: [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0],
  0x0637: [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4],
  0x0638: [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8],
  0x0639: [0xFEC9, 0xFECA, 0xFECB, 0xFECC],
  0x063A: [0xFECD, 0xFECE, 0xFECF, 0xFED0],
  0x0640: [0x0640, 0x0640, 0x0640, 0x0640],
  0x0641: [0xFED1, 0xFED2, 0xFED3, 0xFED4],
  0x0642: [0xFED5, 0xFED6, 0xFED7, 0xFED8],
  0x0643: [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC],
  0x0644: [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0],
  0x0645: [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4],
  0x0646: [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8],
  0x0647: [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC],
  0x0648: [0xFEED, 0xFEEE, null, null],
  0x0649: [0xFEEF, 0xFEF0, null, null],
  0x064A: [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4],
};

const LAM_ALEF_LIGATURES: Record<number, [number, number]> = {
  0x0622: [0xFEF5, 0xFEF6], 0x0623: [0xFEF7, 0xFEF8],
  0x0625: [0xFEF9, 0xFEFA], 0x0627: [0xFEFB, 0xFEFC],
};

function canConnectAfter(code: number): boolean {
  const forms = ARABIC_FORMS[code];
  return forms ? forms[2] !== null : false;
}

function isTashkeel(code: number): boolean {
  return code >= 0x064B && code <= 0x065F;
}

function getPrevArabicCode(text: string, index: number): number | null {
  for (let i = index - 1; i >= 0; i--) {
    const c = text.charCodeAt(i);
    if (isTashkeel(c) || (c >= 0xE000 && c <= 0xE0FF)) continue;
    if (ARABIC_FORMS[c] !== undefined) return c;
    return null;
  }
  return null;
}

function getNextArabicCode(text: string, index: number): number | null {
  for (let i = index + 1; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (isTashkeel(c) || (c >= 0xE000 && c <= 0xE0FF)) continue;
    if (ARABIC_FORMS[c] !== undefined) return c;
    return null;
  }
  return null;
}

function reshapeArabic(text: string): string {
  const len = text.length;
  const result: string[] = [];
  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i);
    if (isTashkeel(code) || (code >= 0xE000 && code <= 0xE0FF)) { result.push(text[i]); continue; }
    const forms = ARABIC_FORMS[code];
    if (!forms) { result.push(text[i]); continue; }
    if (code === 0x0644) {
      let nextIdx = i + 1;
      while (nextIdx < len && isTashkeel(text.charCodeAt(nextIdx))) nextIdx++;
      if (nextIdx < len) {
        const nextCode = text.charCodeAt(nextIdx);
        const ligature = LAM_ALEF_LIGATURES[nextCode];
        if (ligature) {
          const prevCode = getPrevArabicCode(text, i);
          const prevConnects = prevCode !== null && canConnectAfter(prevCode);
          result.push(String.fromCharCode(prevConnects ? ligature[1] : ligature[0]));
          i = nextIdx;
          continue;
        }
      }
    }
    const prevCode = getPrevArabicCode(text, i);
    const prevConnects = prevCode !== null && canConnectAfter(prevCode);
    const nextCode = getNextArabicCode(text, i);
    const nextExists = nextCode !== null && ARABIC_FORMS[nextCode] !== undefined;
    let formIndex: number;
    if (prevConnects && nextExists && forms[2] !== null) { formIndex = forms[3] !== null ? 3 : 1; }
    else if (prevConnects) { formIndex = 1; }
    else if (nextExists && forms[2] !== null) { formIndex = 2; }
    else { formIndex = 0; }
    const glyph = forms[formIndex];
    result.push(String.fromCharCode(glyph !== null ? glyph : forms[0]));
  }
  return result.join('');
}

function reverseBidi(text: string): string {
  return text.split('\n').map(line => {
    const segments: { text: string; isLTR: boolean }[] = [];
    let current = '';
    let currentIsLTR: boolean | null = null;
    for (let ci = 0; ci < line.length; ci++) {
      const code = line.charCodeAt(ci);
      const ch = line[ci];
      if ((code >= 0xE000 && code <= 0xE0FF) || (code >= 0xFFF9 && code <= 0xFFFC)) { current += ch; continue; }
      const charIsArabic = isArabicCode(code);
      const charIsLTR = (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A);
      if (charIsArabic) {
        if (currentIsLTR === true && current) { segments.push({ text: current, isLTR: true }); current = ''; }
        currentIsLTR = false; current += ch;
      } else if (charIsLTR) {
        if (currentIsLTR === false && current) { segments.push({ text: current, isLTR: false }); current = ''; }
        currentIsLTR = true; current += ch;
      } else { current += ch; }
    }
    if (current) segments.push({ text: current, isLTR: currentIsLTR === true });
    return segments.reverse().map(seg => {
      if (seg.isLTR) return seg.text;
      const chunks: string[] = [];
      let ci = 0;
      while (ci < seg.text.length) {
        const cc = seg.text.charCodeAt(ci);
        if ((cc >= 0xE000 && cc <= 0xE0FF) || (cc >= 0xFFF9 && cc <= 0xFFFC)) {
          let group = '';
          while (ci < seg.text.length) {
            const gc = seg.text.charCodeAt(ci);
            if ((gc >= 0xE000 && gc <= 0xE0FF) || (gc >= 0xFFF9 && gc <= 0xFFFC)) { group += seg.text[ci]; ci++; } else break;
          }
          chunks.push(group);
        } else { chunks.push(seg.text[ci]); ci++; }
      }
      return chunks.reverse().join('');
    }).join('');
  }).join('\n');
}

const NUMERAL_MAP: Record<string, string> = { '0':'٠','1':'١','2':'٢','3':'٣','4':'٤','5':'٥','6':'٦','7':'٧','8':'٨','9':'٩' };
function convertToArabicNumerals(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xE000 && code <= 0xE0FF) { result += text[i]; continue; }
    result += NUMERAL_MAP[text[i]] || text[i];
  }
  return result;
}

function mirrorPunctuation(text: string): string {
  const PUNCT_MAP: Record<string, string> = { '?':'؟', ',':'،', ';':'؛' };
  const BRACKET_MAP: Record<string, string> = { '(':')', ')':'(' };
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xE000 && code <= 0xE0FF) { result += text[i]; continue; }
    result += PUNCT_MAP[text[i]] || BRACKET_MAP[text[i]] || text[i];
  }
  return result;
}

/** Strip all Arabic diacritics/tashkeel */
function stripDiacritics(text: string): string {
  return text.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, '');
}

function processArabicText(text: string, options?: { arabicNumerals?: boolean; mirrorPunct?: boolean }): string {
  if (!hasArabicChars(text)) return text;
  // Strip diacritics first — game font cannot render combining marks
  let result = stripDiacritics(text);
  result = reshapeArabic(result);
  result = reverseBidi(result);
  if (options?.arabicNumerals) result = convertToArabicNumerals(result);
  if (options?.mirrorPunct) result = mirrorPunctuation(result);
  return result;
}

// ============= MSBT Parsing =============
interface TagInfo { markerCode: number; bytes: Uint8Array; }
interface MsbtEntry { label: string; originalText: string; processedText: string; offset: number; size: number; tags: TagInfo[]; }

function parseMSBT(data: Uint8Array): { entries: MsbtEntry[]; raw: Uint8Array } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = String.fromCharCode(...data.slice(0, 8));
  if (!magic.startsWith('MsgStdBn')) throw new Error('Not a valid MSBT file');
  const entries: MsbtEntry[] = [];
  let pos = 0x20;
  while (pos < data.length - 16) {
    const sectionMagic = String.fromCharCode(...data.slice(pos, pos + 4));
    const sectionSize = view.getUint32(pos + 4, true);
    if (sectionMagic === 'TXT2') {
      const txt2Start = pos + 16;
      const entryCount = view.getUint32(txt2Start, true);
      for (let i = 0; i < entryCount; i++) {
        const entryOffset = view.getUint32(txt2Start + 4 + i * 4, true);
        const nextOffset = i < entryCount - 1 ? view.getUint32(txt2Start + 4 + (i + 1) * 4, true) : sectionSize;
        const absOffset = txt2Start + entryOffset;
        const textLength = nextOffset - entryOffset;
        const textParts: string[] = [];
        const tags: TagInfo[] = [];
        for (let j = 0; j < textLength - 2; j += 2) {
          const charCode = view.getUint16(absOffset + j, true);
          if (charCode === 0) break;
          if (charCode === 0x0E) {
            const paramSize = view.getUint16(absOffset + j + 6, true);
            const totalTagBytes = 8 + paramSize;
            const markerCode = 0xE000 + tags.length;
            const tagBytes = data.slice(absOffset + j, absOffset + j + totalTagBytes);
            tags.push({ markerCode, bytes: tagBytes });
            j += 6 + paramSize;
            textParts.push(String.fromCharCode(markerCode));
            continue;
          }
          textParts.push(String.fromCharCode(charCode));
        }
        const text = textParts.join('');
        entries.push({ label: `entry_${i}`, originalText: text, processedText: text, offset: absOffset, size: textLength, tags });
      }
      break;
    }
    pos += 16 + sectionSize;
    pos = (pos + 15) & ~15;
  }
  return { entries, raw: data };
}

function encodeEntryToBytes(entry: MsbtEntry): Uint8Array {
  const tagMap = new Map<number, Uint8Array>();
  for (const tag of entry.tags) tagMap.set(tag.markerCode, tag.bytes);
  const parts: number[] = [];
  for (let i = 0; i < entry.processedText.length; i++) {
    const code = entry.processedText.charCodeAt(i);
    const tagBytes = tagMap.get(code);
    if (tagBytes) { for (const b of tagBytes) parts.push(b); }
    else { parts.push(code & 0xFF); parts.push((code >> 8) & 0xFF); }
  }
  parts.push(0, 0);
  return new Uint8Array(parts);
}

function alignTo16(size: number): number { return (size + 15) & ~15; }

function padSection(buf: Uint8Array, contentLen: number): Uint8Array {
  const aligned = alignTo16(contentLen);
  if (aligned === contentLen) return buf;
  const padded = new Uint8Array(aligned);
  padded.set(buf);
  for (let i = contentLen; i < aligned; i++) padded[i] = 0xAB;
  return padded;
}

interface MsbtSection { magic: string; data: Uint8Array; size: number; }

function parseMSBTSections(data: Uint8Array): MsbtSection[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const sections: MsbtSection[] = [];
  let pos = 0x20;
  while (pos < data.length - 16) {
    const magic = String.fromCharCode(...data.slice(pos, pos + 4));
    const sectionSize = view.getUint32(pos + 4, true);
    if (sectionSize === 0 && magic === '\0\0\0\0') break;
    sections.push({ magic, data: data.slice(pos + 16, pos + 16 + sectionSize), size: sectionSize });
    pos += 16 + sectionSize;
    pos = (pos + 15) & ~15;
  }
  return sections;
}

function rebuildMSBT(data: Uint8Array, entries: MsbtEntry[], entriesToModify?: Set<number>): Uint8Array {
  const sections = parseMSBTSections(data);
  const txt2Section = sections.find(s => s.magic === 'TXT2');
  if (!txt2Section) return data;
  const txt2View = new DataView(txt2Section.data.buffer, txt2Section.data.byteOffset, txt2Section.data.byteLength);
  const entryCount = txt2View.getUint32(0, true);
  const encodedEntries: Uint8Array[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (entriesToModify && !entriesToModify.has(i)) {
      const origOffset = txt2View.getUint32(4 + i * 4, true);
      const nextOffset = i < entryCount - 1 ? txt2View.getUint32(4 + (i + 1) * 4, true) : txt2Section.size;
      encodedEntries.push(txt2Section.data.slice(origOffset, nextOffset));
    } else {
      encodedEntries.push(encodeEntryToBytes(entries[i]));
    }
  }
  const offsetTableSize = 4 + entryCount * 4;
  let dataSize = 0;
  for (const enc of encodedEntries) dataSize += enc.length;
  const txt2ContentSize = offsetTableSize + dataSize;
  const newTxt2Content = new Uint8Array(txt2ContentSize);
  const txt2ContentView = new DataView(newTxt2Content.buffer);
  txt2ContentView.setUint32(0, entryCount, true);
  let currentOffset = offsetTableSize;
  for (let i = 0; i < encodedEntries.length; i++) {
    txt2ContentView.setUint32(4 + i * 4, currentOffset, true);
    newTxt2Content.set(encodedEntries[i], currentOffset);
    currentOffset += encodedEntries[i].length;
  }
  const sectionBuffers: Uint8Array[] = [];
  let totalContentSize = 0;
  for (const section of sections) {
    const sectionHeader = new Uint8Array(16);
    const shView = new DataView(sectionHeader.buffer);
    for (let i = 0; i < 4; i++) sectionHeader[i] = section.magic.charCodeAt(i);
    let content: Uint8Array;
    if (section.magic === 'TXT2') { content = newTxt2Content; shView.setUint32(4, txt2ContentSize, true); }
    else { content = section.data; shView.setUint32(4, section.size, true); }
    const fullSection = new Uint8Array(16 + content.length);
    fullSection.set(sectionHeader);
    fullSection.set(content, 16);
    const padded = padSection(fullSection, fullSection.length);
    sectionBuffers.push(padded);
    totalContentSize += padded.length;
  }
  const msbtHeader = new Uint8Array(0x20);
  msbtHeader.set(data.slice(0, 0x20));
  const fileSize = 0x20 + totalContentSize;
  const headerView = new DataView(msbtHeader.buffer);
  headerView.setUint32(18, fileSize, true);
  const result = new Uint8Array(fileSize);
  result.set(msbtHeader);
  let writePos = 0x20;
  for (const buf of sectionBuffers) { result.set(buf, writePos); writePos += buf.length; }
  return result;
}

// ============= Simple ZIP builder =============
function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    // Local file header (30 + nameLen + data)
    const local = new Uint8Array(30 + nameBytes.length + file.data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034B50, true); // signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(8, 0, true); // compression: store
    lv.setUint32(18, file.data.length, true); // compressed size
    lv.setUint32(22, file.data.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(file.data, 30 + nameBytes.length);
    localHeaders.push(local);

    // Central directory header (46 + nameLen)
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014B50, true); // signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(10, 0, true); // compression: store
    cv.setUint32(20, file.data.length, true); // compressed size
    cv.setUint32(24, file.data.length, true); // uncompressed size
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true); // offset of local header
    central.set(nameBytes, 46);
    centralHeaders.push(central);

    offset += local.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const c of centralHeaders) centralDirSize += c.length;

  // End of central directory (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054B50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);

  const totalSize = offset + centralDirSize + 22;
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const l of localHeaders) { result.set(l, pos); pos += l.length; }
  for (const c of centralHeaders) { result.set(c, pos); pos += c.length; }
  result.set(eocd, pos);
  return result;
}

// ============= BDAT JSON helpers =============
// bdat-toolset extracts BDAT tables to JSON. Each JSON file contains one table
// with an array of rows. Text fields are strings we can translate.
// Structure: { "rows": [ { "col1": "value", "col2": 123, ... }, ... ] }
// or: [ { "col1": "value", ... }, ... ]

interface BdatJsonEntry {
  bdatFile: string;    // source JSON filename
  tableName: string;   // table name (from filename)
  rowIndex: number;
  columnName: string;
  original: string;
}

function extractBdatJsonEntries(fileName: string, jsonText: string): BdatJsonEntry[] {
  const entries: BdatJsonEntry[] = [];
  const tableName = fileName.replace(/\.json$/i, '');

  try {
    const parsed = JSON.parse(jsonText);
    // Support both { rows: [...] } and direct array formats
    const rows: Record<string, unknown>[] = Array.isArray(parsed)
      ? parsed
      : (parsed.rows && Array.isArray(parsed.rows))
        ? parsed.rows
        : Object.values(parsed).find(v => Array.isArray(v)) as Record<string, unknown>[] || [];

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      if (!row || typeof row !== 'object') continue;
      for (const [col, val] of Object.entries(row)) {
        if (typeof val === 'string' && val.trim().length > 0) {
          // Skip pure numeric or hex hash strings
          if (/^[0-9a-fA-Fx<>]+$/.test(val.trim())) continue;
          entries.push({
            bdatFile: fileName,
            tableName,
            rowIndex: ri,
            columnName: col,
            original: val,
          });
        }
      }
    }
  } catch (e) {
    console.warn(`Failed to parse BDAT JSON ${fileName}: ${e}`);
  }

  return entries;
}

function applyBdatJsonTranslations(
  fileName: string,
  jsonText: string,
  translations: Record<string, string>,
  protectedEntries: Set<string>,
  processOptions: { arabicNumerals: boolean; mirrorPunct: boolean },
): { json: string; modifiedCount: number } {
  const parsed = JSON.parse(jsonText);
  const rows: Record<string, unknown>[] = Array.isArray(parsed)
    ? parsed
    : (parsed.rows && Array.isArray(parsed.rows))
      ? parsed.rows
      : Object.values(parsed).find(v => Array.isArray(v)) as Record<string, unknown>[] || [];

  let modifiedCount = 0;

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row || typeof row !== 'object') continue;
    for (const col of Object.keys(row)) {
      if (typeof row[col] !== 'string') continue;
      const key = `bdat:${fileName}:${ri}:${col}`;
      const trans = translations[key];
      if (trans !== undefined && trans !== '') {
        if (protectedEntries.has(key)) {
          let processed = reshapeArabic(trans);
          if (processOptions.arabicNumerals) processed = convertToArabicNumerals(processed);
          if (processOptions.mirrorPunct) processed = mirrorPunctuation(processed);
          row[col] = processed;
        } else if (hasArabicPresentationForms(trans)) {
          row[col] = trans;
        } else {
          row[col] = processArabicText(trans, processOptions);
        }
        modifiedCount++;
      }
    }
  }

  // Reconstruct the JSON preserving original structure
  let result: unknown;
  if (Array.isArray(parsed)) {
    result = rows;
  } else if (parsed.rows) {
    result = { ...parsed, rows };
  } else {
    // Find which key held the array
    const arrayKey = Object.entries(parsed).find(([, v]) => Array.isArray(v));
    if (arrayKey) {
      result = { ...parsed, [arrayKey[0]]: rows };
    } else {
      result = parsed;
    }
  }

  return { json: JSON.stringify(result, null, 2), modifiedCount };
}

// ============= Main Handler =============
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') || 'extract';
    const formData = await req.formData();

    // Collect all files from FormData
    const msbtFiles: { name: string; data: Uint8Array }[] = [];
    const bdatJsonFiles: { name: string; text: string }[] = [];

    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        if (key.startsWith('msbt_')) {
          const data = new Uint8Array(await value.arrayBuffer());
          msbtFiles.push({ name: value.name, data });
        } else if (key.startsWith('bdat_')) {
          const text = await value.text();
          bdatJsonFiles.push({ name: value.name, text });
        }
      }
    }

    const totalFiles = msbtFiles.length + bdatJsonFiles.length;
    if (totalFiles === 0) {
      return new Response(
        JSON.stringify({ error: 'يجب رفع ملف MSBT أو BDAT JSON واحد على الأقل' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${mode.toUpperCase()}] Received ${msbtFiles.length} MSBT + ${bdatJsonFiles.length} BDAT JSON files`);

    // ===== EXTRACT MODE =====
    if (mode === 'extract') {
      const allEntries: { msbtFile: string; index: number; label: string; original: string; maxBytes: number; type: string; columnName?: string }[] = [];

      // Extract MSBT entries
      for (const file of msbtFiles) {
        try {
          const { entries } = parseMSBT(file.data);
          for (let i = 0; i < entries.length; i++) {
            allEntries.push({
              msbtFile: file.name,
              index: i,
              label: entries[i].label,
              original: entries[i].originalText,
              maxBytes: entries[i].size * 3,
              type: 'msbt',
            });
          }
          console.log(`Parsed MSBT ${file.name}: ${entries.length} entries`);
        } catch (e) {
          console.warn(`Failed to parse MSBT ${file.name}: ${e instanceof Error ? e.message : 'unknown'}`);
        }
      }

      // Extract BDAT JSON entries
      for (const file of bdatJsonFiles) {
        const bdatEntries = extractBdatJsonEntries(file.name, file.text);
        for (let i = 0; i < bdatEntries.length; i++) {
          const e = bdatEntries[i];
          allEntries.push({
            msbtFile: `bdat:${e.bdatFile}`,
            index: i,
            label: `${e.tableName}[${e.rowIndex}].${e.columnName}`,
            original: e.original,
            maxBytes: 9999, // JSON has no byte limit
            type: 'bdat',
            columnName: e.columnName,
          });
        }
        console.log(`Parsed BDAT JSON ${file.name}: ${bdatEntries.length} text entries`);
      }

      console.log(`Extract mode: found ${allEntries.length} entries total`);

      return new Response(JSON.stringify({
        entries: allEntries,
        fileCount: totalFiles,
        msbtCount: msbtFiles.length,
        bdatCount: bdatJsonFiles.length,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== BUILD MODE =====
    const translationsRaw = formData.get('translations') as string | null;
    const protectedRaw = formData.get('protectedEntries') as string | null;
    const arabicNumerals = formData.get('arabicNumerals') === 'true';
    const mirrorPunct = formData.get('mirrorPunctuation') === 'true';
    const processOptions = { arabicNumerals, mirrorPunct };
    const translations: Record<string, string> = translationsRaw ? JSON.parse(translationsRaw) : {};
    const protectedEntries = new Set<string>(protectedRaw ? JSON.parse(protectedRaw) : []);
    const hasCustomTranslations = Object.keys(translations).length > 0;

    console.log(`[BUILD] Received ${Object.keys(translations).length} translations, ${protectedEntries.size} protected`);

    let modifiedCount = 0;
    let expandedCount = 0;

    const processedFiles: { name: string; data: Uint8Array }[] = [];

    // Process MSBT files
    for (const file of msbtFiles) {
      try {
        const { entries, raw } = parseMSBT(file.data);
        const entriesToModify = new Set<number>();

        if (hasCustomTranslations) {
          for (let i = 0; i < entries.length; i++) {
            const key = `${file.name}:${i}`;
            if (translations[key] !== undefined && translations[key] !== '') {
              let translationText = translations[key];

              const hasLegacyMarkers = /[\uFFF9-\uFFFC]/.test(translationText);
              let tagIdx = 0;
              if (hasLegacyMarkers && entries[i].tags.length > 0) {
                translationText = translationText.replace(/[\uFFF9\uFFFA\uFFFB\uFFFC]/g, () => {
                  if (tagIdx < entries[i].tags.length) return String.fromCharCode(entries[i].tags[tagIdx++].markerCode);
                  return '';
                });
              }

              if (protectedEntries.has(key)) {
                let processed = reshapeArabic(translationText);
                if (processOptions.arabicNumerals) processed = convertToArabicNumerals(processed);
                if (processOptions.mirrorPunct) processed = mirrorPunctuation(processed);
                entries[i].processedText = processed;
              } else if (hasArabicPresentationForms(translationText)) {
                entries[i].processedText = translationText;
              } else {
                entries[i].processedText = processArabicText(translationText, processOptions);
              }
              entriesToModify.add(i);
              modifiedCount++;
              const encoded = encodeEntryToBytes(entries[i]);
              if (encoded.length > entries[i].size) expandedCount++;
            }
          }
        } else {
          for (let i = 0; i < entries.length; i++) {
            if (hasArabicPresentationForms(entries[i].originalText)) continue;
            entries[i].processedText = processArabicText(entries[i].originalText, processOptions);
            entriesToModify.add(i);
            modifiedCount++;
          }
        }

        const injected = rebuildMSBT(raw, entries, entriesToModify);
        processedFiles.push({ name: file.name, data: injected });
      } catch (e) {
        console.warn(`Failed to process MSBT ${file.name}: ${e instanceof Error ? e.message : 'unknown'}`);
        processedFiles.push(file);
      }
    }

    // Process BDAT JSON files
    for (const file of bdatJsonFiles) {
      try {
        const { json, modifiedCount: mc } = applyBdatJsonTranslations(
          file.name, file.text, translations, protectedEntries, processOptions
        );
        modifiedCount += mc;
        const jsonBytes = new TextEncoder().encode(json);
        processedFiles.push({ name: file.name, data: jsonBytes });
      } catch (e) {
        console.warn(`Failed to process BDAT JSON ${file.name}: ${e instanceof Error ? e.message : 'unknown'}`);
        processedFiles.push({ name: file.name, data: new TextEncoder().encode(file.text) });
      }
    }

    console.log(`Modified ${modifiedCount} entries (${expandedCount} expanded)`);

    const zipData = buildZip(processedFiles);

    return new Response(zipData, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="xenoblade_arabized.zip"',
        'Access-Control-Expose-Headers': 'X-Modified-Count, X-Expanded-Count, X-File-Count',
        'X-Modified-Count': String(modifiedCount),
        'X-Expanded-Count': String(expandedCount),
        'X-File-Count': String(processedFiles.length),
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'خطأ غير معروف' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
