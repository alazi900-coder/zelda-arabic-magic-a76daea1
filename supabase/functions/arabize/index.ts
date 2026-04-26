import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  init,
  createDCtx,
  decompressUsingDict,
  createCCtx,
  compressUsingDict,
  decompress,
  compress,
} from "https://deno.land/x/zstd_wasm@0.0.21/deno/zstd.ts";

await init();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Check if a char is Arabic (standard range)
function isArabicCode(code: number): boolean {
  return (code >= 0x0600 && code <= 0x06FF) || (code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF);
}

function isArabicChar(ch: string): boolean {
  return isArabicCode(ch.charCodeAt(0));
}

function hasArabicChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (isArabicCode(text.charCodeAt(i))) return true;
  }
  return false;
}

// Check if text already has Arabic Presentation Forms (already reshaped/arabized)
function hasArabicPresentationForms(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if ((code >= 0xFB50 && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF)) return true;
  }
  return false;
}

// ============= Arabic Reshaping =============
// Maps base Arabic characters to their Presentation Forms-B glyphs:
// [Isolated, Final, Initial, Medial]
// null means that form doesn't exist (char doesn't connect in that direction)
const ARABIC_FORMS: Record<number, [number, number, number | null, number | null]> = {
  0x0621: [0xFE80, 0xFE80, null, null],       // ء Hamza
  0x0622: [0xFE81, 0xFE82, null, null],       // آ Alef Madda
  0x0623: [0xFE83, 0xFE84, null, null],       // أ Alef Hamza Above
  0x0624: [0xFE85, 0xFE86, null, null],       // ؤ Waw Hamza
  0x0625: [0xFE87, 0xFE88, null, null],       // إ Alef Hamza Below
  0x0626: [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C], // ئ Yeh Hamza
  0x0627: [0xFE8D, 0xFE8E, null, null],       // ا Alef
  0x0628: [0xFE8F, 0xFE90, 0xFE91, 0xFE92], // ب Beh
  0x0629: [0xFE93, 0xFE94, null, null],       // ة Teh Marbuta
  0x062A: [0xFE95, 0xFE96, 0xFE97, 0xFE98], // ت Teh
  0x062B: [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C], // ث Theh
  0x062C: [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0], // ج Jeem
  0x062D: [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4], // ح Hah
  0x062E: [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8], // خ Khah
  0x062F: [0xFEA9, 0xFEAA, null, null],       // د Dal
  0x0630: [0xFEAB, 0xFEAC, null, null],       // ذ Thal
  0x0631: [0xFEAD, 0xFEAE, null, null],       // ر Reh
  0x0632: [0xFEAF, 0xFEB0, null, null],       // ز Zain
  0x0633: [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4], // س Seen
  0x0634: [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8], // ش Sheen
  0x0635: [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC], // ص Sad
  0x0636: [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0], // ض Dad
  0x0637: [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4], // ط Tah
  0x0638: [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8], // ظ Zah
  0x0639: [0xFEC9, 0xFECA, 0xFECB, 0xFECC], // ع Ain
  0x063A: [0xFECD, 0xFECE, 0xFECF, 0xFED0], // غ Ghain
  0x0640: [0x0640, 0x0640, 0x0640, 0x0640], // ـ Tatweel
  0x0641: [0xFED1, 0xFED2, 0xFED3, 0xFED4], // ف Feh
  0x0642: [0xFED5, 0xFED6, 0xFED7, 0xFED8], // ق Qaf
  0x0643: [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC], // ك Kaf
  0x0644: [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0], // ل Lam
  0x0645: [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4], // م Meem
  0x0646: [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8], // ن Noon
  0x0647: [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC], // ه Heh
  0x0648: [0xFEED, 0xFEEE, null, null],       // و Waw
  0x0649: [0xFEEF, 0xFEF0, null, null],       // ى Alef Maksura
  0x064A: [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4], // ي Yeh
};

const LAM_ALEF_LIGATURES: Record<number, [number, number]> = {
  0x0622: [0xFEF5, 0xFEF6],
  0x0623: [0xFEF7, 0xFEF8],
  0x0625: [0xFEF9, 0xFEFA],
  0x0627: [0xFEFB, 0xFEFC],
};

function canConnectAfter(code: number): boolean {
  const forms = ARABIC_FORMS[code];
  if (!forms) return false;
  return forms[2] !== null;
}

function isTashkeel(code: number): boolean {
  return code >= 0x064B && code <= 0x065F;
}

function reshapeArabic(text: string): string {
  const len = text.length;
  const result: string[] = [];
  
  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i);
    
    if (isTashkeel(code)) {
      result.push(text[i]);
      continue;
    }
    
    // Skip PUA tag markers - pass through as-is
    if (code >= 0xE000 && code <= 0xE0FF) {
      result.push(text[i]);
      continue;
    }
    
    const forms = ARABIC_FORMS[code];
    if (!forms) {
      result.push(text[i]);
      continue;
    }
    
    if (code === 0x0644) {
      let nextIdx = i + 1;
      while (nextIdx < len && isTashkeel(text.charCodeAt(nextIdx))) nextIdx++;
      if (nextIdx < len) {
        const nextCode = text.charCodeAt(nextIdx);
        const ligature = LAM_ALEF_LIGATURES[nextCode];
        if (ligature) {
          const prevCode = getPrevArabicCodeStr(text, i);
          const prevConnects = prevCode !== null && canConnectAfter(prevCode);
          result.push(String.fromCharCode(prevConnects ? ligature[1] : ligature[0]));
          i = nextIdx;
          continue;
        }
      }
    }
    
    const prevCode = getPrevArabicCodeStr(text, i);
    const prevConnects = prevCode !== null && canConnectAfter(prevCode);
    
    const nextCode = getNextArabicCodeStr(text, i);
    const nextExists = nextCode !== null && ARABIC_FORMS[nextCode] !== undefined;
    
    let formIndex: number;
    if (prevConnects && nextExists && forms[2] !== null) {
      formIndex = 3;
      if (forms[3] === null) formIndex = 1;
    } else if (prevConnects) {
      formIndex = 1;
    } else if (nextExists && forms[2] !== null) {
      formIndex = 2;
    } else {
      formIndex = 0;
    }
    
    const glyph = forms[formIndex];
    result.push(String.fromCharCode(glyph !== null ? glyph : forms[0]));
  }
  
  return result.join('');
}

function getPrevArabicCodeStr(text: string, index: number): number | null {
  for (let i = index - 1; i >= 0; i--) {
    const c = text.charCodeAt(i);
    if (isTashkeel(c)) continue;
    if (c >= 0xE000 && c <= 0xE0FF) continue;
    if (ARABIC_FORMS[c] !== undefined) return c;
    return null;
  }
  return null;
}

function getNextArabicCodeStr(text: string, index: number): number | null {
  for (let i = index + 1; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (isTashkeel(c)) continue;
    if (c >= 0xE000 && c <= 0xE0FF) continue;
    if (ARABIC_FORMS[c] !== undefined) return c;
    return null;
  }
  return null;
}

// ============= End Arabic Reshaping =============

// BiDi reversal for LTR game engine
function reverseBidi(text: string): string {
  return text.split('\n').map(line => {
    const segments: { text: string; isLTR: boolean }[] = [];
    let current = '';
    let currentIsLTR: boolean | null = null;

    for (let ci = 0; ci < line.length; ci++) {
      const code = line.charCodeAt(ci);
      const ch = line[ci];
      // PUA tag markers are treated as neutral (stay with current segment)
      if (code >= 0xE000 && code <= 0xE0FF) {
        current += ch;
        continue;
      }
      // Unicode tag markers (FFF9-FFFC) also neutral
      if (code >= 0xFFF9 && code <= 0xFFFC) {
        current += ch;
        continue;
      }
      
      const charIsArabic = isArabicCode(code);
      const charIsLTR = (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A);
      
      if (charIsArabic) {
        if (currentIsLTR === true && current) {
          segments.push({ text: current, isLTR: true });
          current = '';
        }
        currentIsLTR = false;
        current += ch;
      } else if (charIsLTR) {
        if (currentIsLTR === false && current) {
          segments.push({ text: current, isLTR: false });
          current = '';
        }
        currentIsLTR = true;
        current += ch;
      } else {
        current += ch;
      }
    }
    if (current) segments.push({ text: current, isLTR: currentIsLTR === true });

    return segments.reverse().map(seg => {
      if (seg.isLTR) return seg.text;
      // Reverse RTL segment using chunks: consecutive PUA/tag markers stay as atomic blocks
      const chunks: string[] = [];
      let ci = 0;
      while (ci < seg.text.length) {
        const cc = seg.text.charCodeAt(ci);
        if ((cc >= 0xE000 && cc <= 0xE0FF) || (cc >= 0xFFF9 && cc <= 0xFFFC)) {
          let group = '';
          while (ci < seg.text.length) {
            const gc = seg.text.charCodeAt(ci);
            if ((gc >= 0xE000 && gc <= 0xE0FF) || (gc >= 0xFFF9 && gc <= 0xFFFC)) {
              group += seg.text[ci]; ci++;
            } else break;
          }
          chunks.push(group);
        } else {
          chunks.push(seg.text[ci]); ci++;
        }
      }
      return chunks.reverse().join('');
    }).join('');
  }).join('\n');
}

// ============= Arabic Numeral Conversion =============
const NUMERAL_MAP: Record<string, string> = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
  '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩',
};

function convertToArabicNumerals(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xE000 && code <= 0xE0FF) { result += text[i]; continue; }
    result += NUMERAL_MAP[text[i]] || text[i];
  }
  return result;
}

// ============= Punctuation Mirroring =============
function mirrorPunctuation(text: string): string {
  const PUNCT_MAP: Record<string, string> = {
    '?': '؟', ',': '،', ';': '؛',
  };
  // Swap parentheses/brackets for RTL
  const BRACKET_MAP: Record<string, string> = {
    '(': ')', ')': '(',
  };
  
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xE000 && code <= 0xE0FF) { result += text[i]; continue; }
    result += PUNCT_MAP[text[i]] || BRACKET_MAP[text[i]] || text[i];
  }
  return result;
}

/** Strip all Arabic diacritics/tashkeel (tanween, fatha, damma, kasra, shadda, sukun, etc.) */
function stripDiacritics(text: string): string {
  return text.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, '');
}

function processArabicText(text: string, options?: { arabicNumerals?: boolean; mirrorPunct?: boolean }): string {
  if (!hasArabicChars(text)) return text;
  // Strip diacritics first — game font cannot render combining marks (shows dotted circle)
  let result = stripDiacritics(text);
  // Reshape Arabic letters (connect them) then reverse BiDi for LTR game engine
  result = reshapeArabic(result);
  result = reverseBidi(result);
  if (options?.arabicNumerals) result = convertToArabicNumerals(result);
  if (options?.mirrorPunct) result = mirrorPunctuation(result);
  return result;
}

// ============= Tag tracking =============
interface TagInfo {
  markerCode: number; // PUA character code (0xE000+)
  bytes: Uint8Array;  // raw tag bytes from MSBT
}

interface MsbtEntry {
  label: string;
  originalText: string;
  processedText: string;
  offset: number;
  size: number;
  tags: TagInfo[];
}

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
        const nextOffset = i < entryCount - 1
          ? view.getUint32(txt2Start + 4 + (i + 1) * 4, true)
          : sectionSize;

        const absOffset = txt2Start + entryOffset;
        const textLength = nextOffset - entryOffset;

        const textParts: string[] = [];
        const tags: TagInfo[] = [];

        for (let j = 0; j < textLength - 2; j += 2) {
          const charCode = view.getUint16(absOffset + j, true);
          if (charCode === 0) break;
          if (charCode === 0x0E) {
            // Tag: 0x0E(2) + group(2) + type(2) + paramSize(2) + params(paramSize)
            const paramSize = view.getUint16(absOffset + j + 6, true);
            const totalTagBytes = 8 + paramSize;
            const markerCode = 0xE000 + tags.length;
            // Copy tag bytes using slice (faster than manual loop)
            const tagBytes = data.slice(absOffset + j, absOffset + j + totalTagBytes);
            tags.push({ markerCode, bytes: tagBytes });
            j += 6 + paramSize;
            textParts.push(String.fromCharCode(markerCode));
            continue;
          }
          textParts.push(String.fromCharCode(charCode));
        }
        const text = textParts.join('');

        // DON'T apply processArabicText here - keep raw text
        // Processing will be applied selectively in build mode
        entries.push({
          label: `entry_${i}`,
          originalText: text,
          processedText: text, // same as original - no processing yet
          offset: absOffset,
          size: textLength,
          tags,
        });
      }
      break;
    }
    pos += 16 + sectionSize;
    pos = (pos + 15) & ~15;
  }

  return { entries, raw: data };
}

// Encode a single entry's processedText to UTF-16LE bytes, restoring tag bytes
function encodeEntryToBytes(entry: MsbtEntry): Uint8Array {
  const tagMap = new Map<number, Uint8Array>();
  for (const tag of entry.tags) {
    tagMap.set(tag.markerCode, tag.bytes);
  }

  const parts: number[] = [];
  for (let i = 0; i < entry.processedText.length; i++) {
    const code = entry.processedText.charCodeAt(i);
    const tagBytes = tagMap.get(code);
    if (tagBytes) {
      for (const b of tagBytes) parts.push(b);
    } else {
      parts.push(code & 0xFF);
      parts.push((code >> 8) & 0xFF);
    }
  }
  // Null terminator (UTF-16LE)
  parts.push(0, 0);
  return new Uint8Array(parts);
}

// Pad to 16-byte alignment using 0xAB
function alignTo16(size: number): number {
  return (size + 15) & ~15;
}

function padSection(buf: Uint8Array, contentLen: number): Uint8Array {
  const aligned = alignTo16(contentLen);
  if (aligned === contentLen) return buf;
  const padded = new Uint8Array(aligned);
  padded.set(buf);
  for (let i = contentLen; i < aligned; i++) padded[i] = 0xAB;
  return padded;
}

// Parse all sections from MSBT (returns raw section data with positions)
interface MsbtSection {
  magic: string;
  data: Uint8Array; // section content (excluding the 16-byte header)
  size: number;
}

function parseMSBTSections(data: Uint8Array): MsbtSection[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const sections: MsbtSection[] = [];
  let pos = 0x20; // skip MSBT header

  while (pos < data.length - 16) {
    const magic = String.fromCharCode(...data.slice(pos, pos + 4));
    const sectionSize = view.getUint32(pos + 4, true);
    if (sectionSize === 0 && magic === '\0\0\0\0') break;
    
    sections.push({
      magic,
      data: data.slice(pos + 16, pos + 16 + sectionSize),
      size: sectionSize,
    });
    
    pos += 16 + sectionSize;
    pos = (pos + 15) & ~15; // align to 16
  }
  return sections;
}

// Rebuild MSBT with dynamically-sized TXT2
function rebuildMSBT(data: Uint8Array, entries: MsbtEntry[], entriesToModify?: Set<number>): Uint8Array {
  const sections = parseMSBTSections(data);
  
  // Find TXT2 section and get entry count
  const txt2Section = sections.find(s => s.magic === 'TXT2');
  if (!txt2Section) {
    console.warn('No TXT2 section found, returning original');
    return data;
  }
  
  const txt2View = new DataView(txt2Section.data.buffer, txt2Section.data.byteOffset, txt2Section.data.byteLength);
  const entryCount = txt2View.getUint32(0, true);
  
  // Encode all entries to bytes
  const encodedEntries: Uint8Array[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (entriesToModify && !entriesToModify.has(i)) {
      // Use original bytes from the TXT2 section
      const origOffset = txt2View.getUint32(4 + i * 4, true);
      const nextOffset = i < entryCount - 1
        ? txt2View.getUint32(4 + (i + 1) * 4, true)
        : txt2Section.size;
      encodedEntries.push(txt2Section.data.slice(origOffset, nextOffset));
    } else {
      encodedEntries.push(encodeEntryToBytes(entries[i]));
    }
  }

  // Build new TXT2 content: entryCount(4) + offsets(N*4) + data
  const offsetTableSize = 4 + entryCount * 4;
  let dataSize = 0;
  for (const enc of encodedEntries) dataSize += enc.length;
  const txt2ContentSize = offsetTableSize + dataSize;
  
  const newTxt2Content = new Uint8Array(txt2ContentSize);
  const txt2ContentView = new DataView(newTxt2Content.buffer);
  
  // Write entry count
  txt2ContentView.setUint32(0, entryCount, true);
  
  // Write offsets and data
  let currentOffset = offsetTableSize;
  for (let i = 0; i < encodedEntries.length; i++) {
    txt2ContentView.setUint32(4 + i * 4, currentOffset, true);
    newTxt2Content.set(encodedEntries[i], currentOffset);
    currentOffset += encodedEntries[i].length;
  }

  // Reassemble MSBT: Header + sections with padding
  const sectionBuffers: Uint8Array[] = [];
  let totalContentSize = 0;
  
  for (const section of sections) {
    // 16-byte section header
    const sectionHeader = new Uint8Array(16);
    const shView = new DataView(sectionHeader.buffer);
    // Write magic
    for (let i = 0; i < 4; i++) sectionHeader[i] = section.magic.charCodeAt(i);
    
    let content: Uint8Array;
    if (section.magic === 'TXT2') {
      content = newTxt2Content;
      shView.setUint32(4, txt2ContentSize, true);
    } else {
      content = section.data;
      shView.setUint32(4, section.size, true);
    }
    // Bytes 8-15 are reserved/padding (zeros)
    
    const fullSection = new Uint8Array(16 + content.length);
    fullSection.set(sectionHeader);
    fullSection.set(content, 16);
    
    const padded = padSection(fullSection, fullSection.length);
    sectionBuffers.push(padded);
    totalContentSize += padded.length;
  }

  // Build final file
  const msbtHeader = new Uint8Array(0x20);
  msbtHeader.set(data.slice(0, 0x20)); // copy original header
  
  const fileSize = 0x20 + totalContentSize;
  const headerView = new DataView(msbtHeader.buffer);
  headerView.setUint32(18, fileSize, true); // update file size at offset 0x12
  
  const result = new Uint8Array(fileSize);
  result.set(msbtHeader);
  let writePos = 0x20;
  for (const buf of sectionBuffers) {
    result.set(buf, writePos);
    writePos += buf.length;
  }
  
  return result;
}

interface SarcFile { name: string; data: Uint8Array; }

function parseSARC(data: Uint8Array): SarcFile[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = String.fromCharCode(...data.slice(0, 4));
  if (magic !== 'SARC') throw new Error('Not a valid SARC archive');

  const headerSize = view.getUint16(4, true);
  const dataOffset = view.getUint32(0x0C, true);
  const sfatOffset = headerSize;
  const sfatMagic = String.fromCharCode(...data.slice(sfatOffset, sfatOffset + 4));
  if (sfatMagic !== 'SFAT') throw new Error('Missing SFAT section');

  const nodeCount = view.getUint16(sfatOffset + 6, true);
  const sfntOffset = sfatOffset + 12 + nodeCount * 16;
  const files: SarcFile[] = [];

  for (let i = 0; i < nodeCount; i++) {
    const nodeOffset = sfatOffset + 12 + i * 16;
    const nameOffset = (view.getUint32(nodeOffset + 4, true) & 0x00FFFFFF) * 4;
    const fileDataStart = view.getUint32(nodeOffset + 8, true);
    const fileDataEnd = view.getUint32(nodeOffset + 12, true);

    let name = '';
    let p = sfntOffset + 8 + nameOffset;
    while (p < data.length && data[p] !== 0) { name += String.fromCharCode(data[p]); p++; }

    files.push({ name, data: data.slice(dataOffset + fileDataStart, dataOffset + fileDataEnd) });
  }
  return files;
}

// Hash function for SARC file names (same as Nintendo's)
function sarcHash(name: string, multiplier: number): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * multiplier + name.charCodeAt(i)) & 0xFFFFFFFF;
  }
  return hash >>> 0;
}

function rebuildSARC(files: SarcFile[], originalData: Uint8Array): Uint8Array {
  const origView = new DataView(originalData.buffer, originalData.byteOffset, originalData.byteLength);
  const headerSize = origView.getUint16(4, true); // typically 0x14 (20)
  const bom = origView.getUint16(6, true);
  const origDataOffset = origView.getUint32(0x0C, true);
  const version = origView.getUint16(0x10, true);
  
  // Read SFAT header info
  const sfatOffset = headerSize;
  const nodeCount = origView.getUint16(sfatOffset + 6, true);
  const hashMultiplier = origView.getUint32(sfatOffset + 8, true);
  
  // Read SFNT from original to get its structure
  const sfntOffset = sfatOffset + 12 + nodeCount * 16;
  
  // Build SFNT (String File Name Table) from file names
  // SFNT header: "SFNT"(4) + headerSize(2) + padding(2) = 8 bytes
  const nameBytes: Uint8Array[] = [];
  const nameOffsets: number[] = [];
  let namePos = 0;
  
  for (const file of files) {
    nameOffsets.push(namePos);
    const encoded = new TextEncoder().encode(file.name);
    const padded = new Uint8Array(alignTo16(encoded.length + 1)); // +1 for null, align to 4
    // Actually SFNT names are padded to 4-byte alignment
    const nameAligned = (encoded.length + 1 + 3) & ~3;
    const nameBuf = new Uint8Array(nameAligned);
    nameBuf.set(encoded);
    // rest is already 0 (null padding)
    nameBytes.push(nameBuf);
    namePos += nameAligned;
  }
  
  const sfntContentSize = namePos;
  const sfntTotalSize = 8 + sfntContentSize; // header + content
  const sfntAligned = alignTo16(sfntTotalSize);
  
  // Calculate data offset (must be aligned)
  const sfatTotalSize = 12 + nodeCount * 16;
  const metaSize = headerSize + sfatTotalSize + sfntAligned;
  const dataOffset = alignTo16(metaSize);
  
  // Calculate file data positions (each file aligned to 16 bytes within data section)
  const fileDataOffsets: number[] = [];
  const fileDataEnds: number[] = [];
  let filePos = 0;
  
  for (const file of files) {
    const alignedStart = (filePos + 15) & ~15; // align start to 16
    // First file starts at 0
    if (fileDataOffsets.length === 0) {
      fileDataOffsets.push(0);
      fileDataEnds.push(file.data.length);
      filePos = file.data.length;
    } else {
      fileDataOffsets.push(alignedStart);
      fileDataEnds.push(alignedStart + file.data.length);
      filePos = alignedStart + file.data.length;
    }
  }
  
  const totalDataSize = filePos;
  const totalFileSize = dataOffset + totalDataSize;
  
  // Build the output
  const result = new Uint8Array(totalFileSize);
  const resultView = new DataView(result.buffer);
  
  // SARC Header (20 bytes)
  result[0] = 0x53; result[1] = 0x41; result[2] = 0x52; result[3] = 0x43; // "SARC"
  resultView.setUint16(4, headerSize, true);
  resultView.setUint16(6, bom, true);
  resultView.setUint32(8, totalFileSize, true); // file size
  resultView.setUint32(0x0C, dataOffset, true); // data offset
  resultView.setUint16(0x10, version, true);
  // bytes 0x12-0x13: reserved (0)
  
  // SFAT Header
  let wp = headerSize;
  result[wp] = 0x53; result[wp+1] = 0x46; result[wp+2] = 0x41; result[wp+3] = 0x54; // "SFAT"
  resultView.setUint16(wp + 4, 0x0C, true); // SFAT header size
  resultView.setUint16(wp + 6, files.length, true); // node count
  resultView.setUint32(wp + 8, hashMultiplier, true);
  
  // SFAT Nodes
  wp += 12;
  for (let i = 0; i < files.length; i++) {
    const hash = sarcHash(files[i].name, hashMultiplier);
    resultView.setUint32(wp, hash, true); // name hash
    // Name offset in SFNT (divided by 4, with flag 0x01000000)
    resultView.setUint32(wp + 4, 0x01000000 | (nameOffsets[i] / 4), true);
    resultView.setUint32(wp + 8, fileDataOffsets[i], true); // data start
    resultView.setUint32(wp + 12, fileDataEnds[i], true); // data end
    wp += 16;
  }
  
  // SFNT Header + names
  result[wp] = 0x53; result[wp+1] = 0x46; result[wp+2] = 0x4E; result[wp+3] = 0x54; // "SFNT"
  resultView.setUint16(wp + 4, 0x08, true); // SFNT header size
  wp += 8;
  
  for (const nameBuf of nameBytes) {
    result.set(nameBuf, wp);
    wp += nameBuf.length;
  }
  
  // File Data
  for (let i = 0; i < files.length; i++) {
    result.set(files[i].data, dataOffset + fileDataOffsets[i]);
  }
  
  return result;
}

function decompressLangFile(langData: Uint8Array, dictData: Uint8Array, langFileName: string): { sarcData: Uint8Array; rawDict: Uint8Array | null } {
  const isSARC = String.fromCharCode(...langData.slice(0, 4)) === 'SARC';
  if (isSARC) return { sarcData: langData, rawDict: null };

  const isZstd = langData[0] === 0x28 && langData[1] === 0xB5 && langData[2] === 0x2F && langData[3] === 0xFD;
  if (!isZstd) throw new Error('الملف غير معروف: لا يبدو أنه SARC مضغوط أو SARC غير مضغوط');

  let dictSarcData: Uint8Array;
  try { dictSarcData = new Uint8Array(decompress(dictData as unknown as ArrayBuffer) as unknown as ArrayBuffer); } catch { dictSarcData = dictData; }

  const dictFiles = parseSARC(dictSarcData);
  console.log(`Found ${dictFiles.length} dictionaries: ${dictFiles.map(f => f.name).join(', ')}`);

  let rawDict: Uint8Array | null = null;
  let selectedDictName = '';
  const lowerName = langFileName.toLowerCase();

  if (lowerName.includes('.pack.')) {
    const f = dictFiles.find(f => f.name.endsWith('pack.zsdic'));
    if (f) { rawDict = f.data; selectedDictName = f.name; }
  }
  if (!rawDict && lowerName.includes('.bcett.byml.')) {
    const f = dictFiles.find(f => f.name.endsWith('bcett.byml.zsdic'));
    if (f) { rawDict = f.data; selectedDictName = f.name; }
  }
  if (!rawDict) {
    const f = dictFiles.find(f => f.name.endsWith('zs.zsdic') && !f.name.includes('pack') && !f.name.includes('bcett'));
    if (f) { rawDict = f.data; selectedDictName = f.name; }
  }
  if (!rawDict && dictFiles.length > 0) { rawDict = dictFiles[0].data; selectedDictName = dictFiles[0].name; }
  if (!rawDict) throw new Error('لم يتم العثور على قاموس .zsdic في ملف القاموس');

  console.log(`Using dictionary: ${selectedDictName} (${rawDict.length} bytes)`);
  const dctx = createDCtx();
  const sarcDataRaw = decompressUsingDict(dctx, langData as unknown as ArrayBuffer, rawDict as unknown as ArrayBuffer);
  const sarcData = new Uint8Array(sarcDataRaw as unknown as ArrayBuffer);
  console.log(`Decompressed: ${langData.length} -> ${sarcData.length} bytes`);

  return { sarcData, rawDict };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') || 'auto';

    const formData = await req.formData();
    const langFile = formData.get('langFile') as File;
    const dictFile = formData.get('dictFile') as File;

    if (!langFile || !dictFile) {
      return new Response(
        JSON.stringify({ error: 'يجب رفع ملف اللغة وملف القاموس' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const langData = new Uint8Array(await langFile.arrayBuffer());
    const dictData = new Uint8Array(await dictFile.arrayBuffer());

    const { sarcData, rawDict } = decompressLangFile(langData, dictData, langFile.name || '');

    const files = parseSARC(sarcData);
    console.log(`Extracted ${files.length} files from SARC`);

    // ===== EXTRACT MODE =====
    if (mode === 'extract') {
      const allEntries: { msbtFile: string; index: number; label: string; original: string; maxBytes: number }[] = [];

      for (const file of files) {
        if (file.name.endsWith('.msbt')) {
          try {
            const { entries } = parseMSBT(file.data);
            for (let i = 0; i < entries.length; i++) {
              // Keep original PUA markers (E000, E001, ...) — lossless 1:1 mapping
              // No conversion to FFF9/FFFA/FFFB — each PUA marker is unique per entry
              allEntries.push({
                msbtFile: file.name,
                index: i,
                label: entries[i].label,
                original: entries[i].originalText,
                maxBytes: entries[i].size * 3,
              });
            }
          } catch (e) {
            console.warn(`Failed to parse MSBT ${file.name}: ${e instanceof Error ? e.message : 'unknown'}`);
          }
        }
      }

      console.log(`Extract mode: found ${allEntries.length} entries across ${files.filter(f => f.name.endsWith('.msbt')).length} MSBT files`);

      return new Response(JSON.stringify({
        entries: allEntries,
        fileCount: files.length,
        msbtCount: files.filter(f => f.name.endsWith('.msbt')).length,
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
    const protectedEntries = new Set(protectedRaw ? JSON.parse(protectedRaw) : []);
    const hasCustomTranslations = Object.keys(translations).length > 0;

    console.log(`[BUILD] Received ${Object.keys(translations).length} translations, ${protectedEntries.size} protected`);
    console.log(`[BUILD] Sample translation keys: ${Object.keys(translations).slice(0, 5).join(', ')}`);
    console.log(`[BUILD] Total MSBT files in SARC: ${files.filter(f => f.name.endsWith('.msbt')).length}`);

    // ===== DIAGNOSTIC: Validate tag roundtrip =====
    let diagTagEntries = 0;
    let diagTagMismatch = 0;
    let diagTagOk = 0;
    let diagSampleLogged = 0;

    let modifiedCount = 0;
    const skippedOversize = 0;
    let skippedAlreadyArabized = 0;
    let expandedCount = 0;
    let totalByteRatio = 0;
    let maxByteRatio = 0;
    let longestEntry = { key: '', bytes: 0 };
    let shortestEntry = { key: '', bytes: Infinity };
    const categoryStats: Record<string, { total: number; modified: number }> = {};

    const processedFiles = files.map(file => {
      if (file.name.endsWith('.msbt')) {
        try {
          const { entries, raw } = parseMSBT(file.data);
          const entriesToModify = new Set<number>();

          console.log(`[BUILD] MSBT file: ${file.name}, entries: ${entries.length}`);

          if (hasCustomTranslations) {
            // Count matching keys for this file
            let matchCount = 0;
            for (let i = 0; i < entries.length; i++) {
              const key = `${file.name}:${i}`;
              if (translations[key] !== undefined && translations[key] !== '') matchCount++;
            }
            console.log(`[BUILD] File ${file.name}: ${matchCount} matching translations`);

            // BUILD mode with custom translations
            for (let i = 0; i < entries.length; i++) {
              const key = `${file.name}:${i}`;
              if (translations[key] !== undefined && translations[key] !== '') {
                // Convert \uFFFC in translation back to PUA markers from original entry
                let translationText = translations[key];
                
                // DIAGNOSTIC: Count markers before replacement
                const markersBefore = (translationText.match(/[\uFFF9-\uFFFC]/g) || []).length;
                const puaBefore = (translationText.match(/[\uE000-\uE0FF]/g) || []).length;
                const tagCount = entries[i].tags.length;
                
                if (tagCount > 0 || markersBefore > 0 || puaBefore > 0) {
                  diagTagEntries++;
                  if (diagSampleLogged < 10) {
                    console.log(`[DIAG-TAG] Key: ${key}, tags: ${tagCount}, markers(FFF9-FFFC): ${markersBefore}, PUA(E000+): ${puaBefore}`);
                    if (tagCount > 0) {
                      const tagHex = entries[i].tags.map(t => `E${(t.markerCode-0xE000).toString(16).padStart(3,'0')}=[${[...t.bytes].map(b=>b.toString(16).padStart(2,'0')).join(' ')}]`).join(', ');
                      console.log(`[DIAG-TAG] Tag bytes: ${tagHex}`);
                    }
                    // Show first 80 chars of translation as hex codes
                    const transHex = [...translationText.substring(0, 40)].map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join(' ');
                    console.log(`[DIAG-TAG] Trans hex: ${transHex}`);
                  }
                }
                
                // Handle both PUA-native (new) and legacy FFF9-FFFC (old) marker formats
                const hasLegacyMarkers = /[\uFFF9-\uFFFC]/.test(translationText);
                let tagIdx = 0;
                if (hasLegacyMarkers && entries[i].tags.length > 0) {
                  // Legacy format: sequentially replace FFF9-FFFC with PUA markers
                  translationText = translationText.replace(/[\uFFF9\uFFFA\uFFFB\uFFFC]/g, () => {
                    if (tagIdx < entries[i].tags.length) {
                      return String.fromCharCode(entries[i].tags[tagIdx++].markerCode);
                    }
                    return ''; // no corresponding tag, remove marker
                  });
                }
                // PUA markers (E000+) are already correct — encodeEntryToBytes maps them directly
                
                // DIAGNOSTIC: Verify after replacement
                const markersAfter = (translationText.match(/[\uFFF9-\uFFFC]/g) || []).length;
                const puaAfter = (translationText.match(/[\uE000-\uE0FF]/g) || []).length;
                
                if (tagCount > 0 && diagSampleLogged < 10) {
                  console.log(`[DIAG-TAG] After replace: markers(FFF9-FFFC): ${markersAfter}, PUA(E000+): ${puaAfter}, tagIdx used: ${tagIdx}`);
                  if (markersBefore !== tagCount) {
                    console.log(`[DIAG-TAG] ⚠️ MISMATCH: translation had ${markersBefore} markers but entry has ${tagCount} tags`);
                    diagTagMismatch++;
                  } else {
                    diagTagOk++;
                  }
                  diagSampleLogged++;
                }

                if (protectedEntries.has(key)) {
                  // Protected entry: apply reshaping only (NO BiDi reversal)
                  let processed = reshapeArabic(translationText);
                  if (processOptions.arabicNumerals) processed = convertToArabicNumerals(processed);
                  if (processOptions.mirrorPunct) processed = mirrorPunctuation(processed);
                  entries[i].processedText = processed;
                } else if (hasArabicPresentationForms(translationText)) {
                  // Already processed (has presentation forms from manual processing or external tool)
                  // Just inject as-is, no re-processing needed
                  entries[i].processedText = translationText;
                } else {
                  entries[i].processedText = processArabicText(translationText, processOptions);
                }
                entriesToModify.add(i);
                modifiedCount++;
                // Check if translation is larger than original slot
                const encoded = encodeEntryToBytes(entries[i]);
                if (encoded.length > entries[i].size) expandedCount++;
                
                // DIAGNOSTIC: Roundtrip validation for entries with tags
                if (tagCount > 0 && diagSampleLogged <= 10) {
                  // Check that tag bytes appear correctly in encoded output
                  const encodedHex = [...encoded.slice(0, Math.min(60, encoded.length))].map(b => b.toString(16).padStart(2, '0')).join(' ');
                  console.log(`[DIAG-TAG] Encoded first 60 bytes: ${encodedHex}`);
                  // Verify each tag's bytes appear in the encoded output
                  for (const tag of entries[i].tags) {
                    const tagSig = tag.bytes.slice(0, 4); // first 4 bytes: 0E 00 GG 00
                    let found = false;
                    for (let bi = 0; bi < encoded.length - tagSig.length; bi++) {
                      if (encoded[bi] === tagSig[0] && encoded[bi+1] === tagSig[1] && 
                          encoded[bi+2] === tagSig[2] && encoded[bi+3] === tagSig[3]) {
                        found = true;
                        break;
                      }
                    }
                    if (!found) {
                      console.log(`[DIAG-TAG] ❌ Tag E${(tag.markerCode-0xE000).toString(16)} NOT found in encoded output!`);
                    }
                  }
                }
                
                // Collect detailed stats
                const ratio = entries[i].size > 0 ? encoded.length / entries[i].size : 0;
                totalByteRatio += ratio;
                if (ratio > maxByteRatio) maxByteRatio = ratio;
                if (encoded.length > longestEntry.bytes) longestEntry = { key, bytes: encoded.length };
                if (encoded.length < shortestEntry.bytes) shortestEntry = { key, bytes: encoded.length };
                // Category stats
                const catParts = file.name.split('/');
                const cat = catParts.length > 1 ? catParts[0] : 'Other';
                if (!categoryStats[cat]) categoryStats[cat] = { total: 0, modified: 0 };
                categoryStats[cat].modified++;
              }
              // Entries WITHOUT translations are NOT modified at all
            }
          } else {
            // AUTO mode (no custom translations) - process all non-arabized entries
            for (let i = 0; i < entries.length; i++) {
              if (hasArabicPresentationForms(entries[i].originalText)) {
                // Already arabized (has presentation forms) - skip to avoid double processing
                skippedAlreadyArabized++;
                continue;
              }
              entries[i].processedText = processArabicText(entries[i].originalText, processOptions);
              entriesToModify.add(i);
              modifiedCount++;
            }
          }

          // Only inject entries that were actually modified
          const injected = rebuildMSBT(raw, entries, entriesToModify);
          return { ...file, data: injected };
        } catch (e) {
          console.warn(`Failed to process MSBT ${file.name}: ${e instanceof Error ? e.message : 'unknown'}`);
          return file;
        }
      }
      return file;
    });

    let totalMatchedTranslations = 0;
    for (const file of files) {
      if (!file.name.endsWith('.msbt')) continue;
      for (let i = 0; i < 999; i++) {
        const key = `${file.name}:${i}`;
        if (translations[key] !== undefined && translations[key] !== '') totalMatchedTranslations++;
        else if (translations[key] === undefined) break;
      }
    }

    console.log(`Modified ${modifiedCount} entries (${expandedCount} expanded), skipped already-arabized: ${skippedAlreadyArabized}`);
    console.log(`[BUILD-SUMMARY] Translations received: ${Object.keys(translations).length}, matched to MSBT: ${totalMatchedTranslations}, modified: ${modifiedCount}`);
    console.log(`[DIAG-SUMMARY] Tagged entries: ${diagTagEntries}, OK: ${diagTagOk}, MISMATCH: ${diagTagMismatch}`);

    // Build stats JSON
    const avgRatio = modifiedCount > 0 ? Math.round((totalByteRatio / modifiedCount) * 100) : 0;
    const buildStats = {
      expanded: expandedCount,
      avgBytePercent: avgRatio,
      maxBytePercent: Math.round(maxByteRatio * 100),
      longest: longestEntry.key ? longestEntry : null,
      shortest: shortestEntry.bytes < Infinity ? shortestEntry : null,
      categories: categoryStats,
    };

    const repackedData = rebuildSARC(processedFiles, sarcData);

    let outputData: Uint8Array = repackedData;
    let isCompressed = false;
    try {
      console.log(`Re-compressing SARC (${repackedData.length} bytes)...`);
      if (rawDict) {
        const cctx = createCCtx();
        outputData = new Uint8Array(compressUsingDict(cctx, repackedData as unknown as ArrayBuffer, rawDict as unknown as ArrayBuffer, 3) as unknown as ArrayBuffer);
        isCompressed = true;
        console.log(`Compressed with dict: ${repackedData.length} -> ${outputData.length} bytes`);
      } else {
        outputData = new Uint8Array(compress(repackedData as unknown as ArrayBuffer) as unknown as ArrayBuffer);
        isCompressed = true;
        console.log(`Compressed: ${repackedData.length} -> ${outputData.length} bytes`);
      }
    } catch (e) {
      console.error(`Re-compression failed: ${e instanceof Error ? e.message : 'Unknown'}`);
    }

    let entriesPreview: { label: string; original: string; processed: string }[] = [];
    try {
      for (const f of processedFiles) {
        if (f.name.endsWith('.msbt')) {
          const parsed = parseMSBT(f.data);
          entriesPreview = parsed.entries.slice(0, 20).map(e => ({
            label: e.label,
            original: e.originalText.substring(0, 100),
            processed: e.processedText.substring(0, 100),
          }));
          break;
        }
      }
    } catch { /* ignore */ }

    return new Response(outputData as BodyInit, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="arabized_output.zs"',
        'Access-Control-Expose-Headers': 'X-Modified-Count, X-Expanded-Count, X-File-Size, X-Compressed-Size, X-Build-Stats, X-Entries-Preview, X-Skipped-Already-Arabized, X-Is-Compressed',
        'X-Modified-Count': String(modifiedCount),
        'X-Expanded-Count': String(expandedCount),
        'X-Skipped-Already-Arabized': String(skippedAlreadyArabized),
        'X-File-Size': String(repackedData.length),
        'X-Compressed-Size': isCompressed ? String(outputData.length) : '',
        'X-Is-Compressed': String(isCompressed),
        'X-Entries-Preview': encodeURIComponent(JSON.stringify(entriesPreview)),
        'X-Build-Stats': encodeURIComponent(JSON.stringify(buildStats)),
      },
    });
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
