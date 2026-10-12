/**
 * Golden Sun: The Lost Age (AGFE) genuine Huffman dialogue table.
 *
 * Addresses established and tested against the 16 MiB US/Europe AGFE ROM:
 *   0x060C30: { treeDataPtr=0x0805F914, treeOffsetsPtr=0x08060A4C }
 *   0x0A9F54: 48 pairs of { compressedChunkPtr, 256 byte-lengthsPtr }
 *   48*256 = 12288 messages.
 *
 * This is the SAME Huffman WIRE FORMAT as Golden Sun 1, but DIFFERENT
 * physical tables, string count, font and ROM size. Never use AGSE pointers.
 */
import { reshapeArabic, stripDiacritics } from "@/lib/arabic-processing";
import { buildTrees, compressString, decompressString } from "./goldensun-huffman";
import { validateGoldenSun2Translation } from "./goldensun2-editor-bridge";
import { tokenizeGoldenSunBytes, isGoldenSunPlainAscii } from "./goldensun-tags";
import { GOLDENSUN_ARABIC_BYTE_MAP } from "./goldensun-arabic-font";

export const GS2_STRING_COUNT = 12288;
export const GS2_CHUNK_COUNT = 48;
export const GS2_CHUNK_SIZE = 256;
export const GS2_TREE_POINTERS = 0x60c30;
export const GS2_STRING_POINTERS = 0xa9f54;
export const GS2_ORIGINAL_ROM_SIZE = 0x1000000;
export const GS2_MAX_ROM_SIZE = 0x2000000;
export const GS2_TEXT_FILE = "goldensun/lost-age/strings";

export interface GoldenSun2TextEntry {
  index: number;
  msbtFile: string;
  original: string;
  /** Pre-fix appearance, used only to migrate a saved editor snapshot. */
  legacyOriginal?: string;
}

function read32(b: Uint8Array, p: number): number {
  if (p < 0 || p + 4 > b.length) throw new Error("GS2: pointer read outside ROM");
  return (b[p] | b[p + 1] << 8 | b[p + 2] << 16 | b[p + 3] << 24) >>> 0;
}
function write32(b: Uint8Array, p: number, v: number): void {
  b[p] = v & 255;
  b[p + 1] = v >>> 8 & 255;
  b[p + 2] = v >>> 16 & 255;
  b[p + 3] = v >>> 24 & 255;
}
function offsetOf(ptr: number, length: number): number {
  if (ptr < 0x08000000 || ptr >= 0x0a000000) {
    throw new Error("GS2: not a GBA ROM address: 0x" + ptr.toString(16));
  }
  const off = ptr - 0x08000000;
  if (off >= length) throw new Error("GS2: pointer outside the uploaded ROM");
  return off;
}
function asPtr(offset: number): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= GS2_MAX_ROM_SIZE) {
    throw new Error("GS2: output data exceeds the GBA 32 MiB limit");
  }
  return (0x08000000 + offset) >>> 0;
}
const align2 = (v: number) => (v + 1) & ~1;

export function isGoldenSun2ArabicFontRom(rom: Uint8Array): boolean {
  // Signature from the previously tested experimental AGFE RTL/font v1 patch.
  // Not a general declaration that every Arabic letter displays correctly.
  // Require the ported menu renderer and both large/small GS1 font slots,
  // not merely the older dialogue-only RTL experiment.
  return rom.length >= GS2_ORIGINAL_ROM_SIZE &&
    rom[0x10d000] === 0xf0 && rom[0x10d001] === 0xb5 &&
    rom[0x10d002] === 0x04 && rom[0x10d003] === 0x1c &&
    rom[0x39e00] === 0xd3 &&
    rom[0x10d100] === 0xf0 && rom[0x10d101] === 0xb5 &&
    rom[0x10d102] === 0xff && rom[0x10d103] === 0xb0 &&
    rom[0x682010 + 0xf0 * 32] === 0x44 &&
    rom[0x5a4e0 + (0xf0 - 0x20) * 32] === 4 &&
    // All four calls are rerouted to the relocated menu RTL renderer.
    rom[0x3accc] === 0xd2 && rom[0x3accd] === 0xf0 &&
    rom[0x3acce] === 0x18 && rom[0x3accf] === 0xfa &&
    rom[0x4209a] === 0xcb && rom[0x4209b] === 0xf0 &&
    rom[0x4209c] === 0x31 && rom[0x4209d] === 0xf8 &&
    rom[0x42174] === 0xca && rom[0x42175] === 0xf0 &&
    rom[0x42176] === 0xc4 && rom[0x42177] === 0xff &&
    rom[0x422fe] === 0xca && rom[0x422ff] === 0xf0 &&
    rom[0x42300] === 0xff && rom[0x42301] === 0xfe;
}

export function hasGoldenSun2TextTables(rom: Uint8Array): boolean {
  try {
    if (rom.length < GS2_ORIGINAL_ROM_SIZE || rom.length > GS2_MAX_ROM_SIZE) return false;
    if (String.fromCharCode(...rom.subarray(0xac, 0xb0)) !== "AGFE") return false;
    const tree = offsetOf(read32(rom, GS2_TREE_POINTERS), rom.length);
    const offsets = offsetOf(read32(rom, GS2_TREE_POINTERS + 4), rom.length);
    if (tree + 16 > rom.length || offsets + 512 > rom.length) return false;
    let previousEnd = 0;
    for (let chunk = 0; chunk < GS2_CHUNK_COUNT; chunk++) {
      const table = GS2_STRING_POINTERS + chunk * 8;
      const data = offsetOf(read32(rom, table), rom.length);
      const lengths = offsetOf(read32(rom, table + 4), rom.length);
      if (lengths + GS2_CHUNK_SIZE > rom.length || data >= lengths) return false;
      if (data < previousEnd) return false;
      let sum = 0;
      for (let j = 0; j < GS2_CHUNK_SIZE; j++) {
        const n = rom[lengths + j];
        if (!n || n === 255) return false;
        sum += n;
      }
      if (data + sum > lengths) return false;
      previousEnd = lengths + GS2_CHUNK_SIZE;
    }
    return true;
  } catch {
    return false;
  }
}

/** No visual reversal: the AGFE right-to-left hook owns screen flow. */
const GS2_ARABIC_BYTE_TO_CODEPOINT: Record<number, number> = Object.fromEntries(
  Object.entries(GOLDENSUN_ARABIC_BYTE_MAP).map(([cp, byte]) => [Number(byte), Number(cp)])
);

/**
 * The original English AGFE cartridge contains a handful of Japanese test
 * lines, encoded in Shift-JIS, as well as ordinary single-byte special
 * punctuation (notably 0xB0). The old decoder displayed Japanese as
 * \x83A\x83C... and incorrectly called isolated 0xB0 an Arabic glyph on
 * ROMs containing the Arabic font patch.
 *
 * Decode only provably-valid multi-byte Shift-JIS character pairs. Every
 * ambiguous byte stays an editable \xNN escape. Control codes and their
 * raw argument bytes are NEVER passed through this character decoder.
 */
const GS2_JAPANESE_LEADS = new Set([0x81, 0x82, 0x83, 0x96]);
let japaneseDecoder: TextDecoder | null | undefined;

function decodeJapanesePair(first: number, second: number): string | null {
  if (!GS2_JAPANESE_LEADS.has(first) || second < 0x40 || second > 0xfc || second === 0x7f) return null;
  if (japaneseDecoder === undefined) {
    try { japaneseDecoder = new TextDecoder("shift_jis", { fatal: true }); }
    catch { japaneseDecoder = null; }
  }
  if (!japaneseDecoder) return null;
  try {
    const text = japaneseDecoder.decode(new Uint8Array([first, second]));
    return text.length > 0 && !text.includes("\uFFFD") ? text : null;
  } catch {
    return null;
  }
}

const asHexTag = (byte: number): string =>
  "\\x" + byte.toString(16).toUpperCase().padStart(2, "0");

function legacyGoldenSun2BytesToText(bytes: number[], arabicFont: boolean): string {
  let result = "";
  for (const token of tokenizeGoldenSunBytes(bytes)) {
    for (const b of token.bytes) {
      if (token.kind === "code") result += asHexTag(b);
      else if (arabicFont && GS2_ARABIC_BYTE_TO_CODEPOINT[b] !== undefined) {
        result += String.fromCharCode(GS2_ARABIC_BYTE_TO_CODEPOINT[b]);
      } else if (isGoldenSunPlainAscii(b)) result += String.fromCharCode(b);
      else result += asHexTag(b);
    }
  }
  return result;
}

/** Detect Arabic byte runs, not isolated English punctuation in a patched ROM. */
function hasEncodedArabicRun(bytes: number[]): boolean {
  let consecutiveHigh = 0;
  for (const b of bytes) {
    if (b >= 0x90 && GS2_ARABIC_BYTE_TO_CODEPOINT[b] !== undefined) {
      if (++consecutiveHigh >= 2) return true;
    } else {
      consecutiveHigh = 0;
    }
  }
  return false;
}

/** Readable dialogue source: Japanese -> Unicode, verified Arabic -> normal
 * Arabic letters, genuine game controls -> protected literal \xNN.
 * Remaining unknown bytes are ALWAYS escaped instead of guessed.
 */
export function goldenSun2BytesToText(bytes: number[], arabicFont = false): string {
  let output = "";
  for (const token of tokenizeGoldenSunBytes(bytes)) {
    if (token.kind === "code") {
      output += token.bytes.map(asHexTag).join("");
      continue;
    }
    const run = token.bytes;
    const containsJapanese = run.some((b, i) =>
      i + 1 < run.length && b >= 0x81 && b <= 0x83 &&
      decodeJapanesePair(b, run[i + 1]) !== null
    );
    const containsArabic = arabicFont && !containsJapanese && hasEncodedArabicRun(run);
    for (let i = 0; i < run.length; i++) {
      const b = run[i];
      // 0x96 is also a kanji lead, but only if this run has unambiguous
      // Japanese bytes elsewhere: 0x96 may be an Arabic font slot.
      const japanese = i + 1 < run.length &&
        (b >= 0x81 && b <= 0x83 || (containsJapanese && b === 0x96))
        ? decodeJapanesePair(b, run[i + 1]) : null;
      if (japanese) {
        output += japanese;
        i++;
      } else if (containsArabic && GS2_ARABIC_BYTE_TO_CODEPOINT[b] !== undefined) {
        // Presentation Forms from ROM are display glyphs, not editable
        // characters. NFKC returns the normal Arabic spelling for editing.
        output += String.fromCharCode(GS2_ARABIC_BYTE_TO_CODEPOINT[b]).normalize("NFKC");
      } else if (isGoldenSunPlainAscii(b)) {
        output += String.fromCharCode(b);
      } else {
        output += asHexTag(b);
      }
    }
  }
  return output;
}

const GS2_NORMALIZATION: Record<string, string> = {
  "ی": "ي", "ک": "ك", "،": ",", "؟": "?",
  "؛": ";", "…": "...", "ـ": "",
  "–": "-", "—": "-", "−": "-", "٪": "%",
};
for (let d = 0; d <= 9; d++) {
  GS2_NORMALIZATION[String.fromCharCode(0x660 + d)] = String(d);
  GS2_NORMALIZATION[String.fromCharCode(0x6f0 + d)] = String(d);
}

/**
 * Original AGFE strings may use 0x80+ for game-specific symbols. We display
 * those as \xNN, preserving their exact original binary code. Arabic text
 * can be encoded into the 0x80..0xFF font overlay only on a verified ROM.
 */
export function goldenSun2TextToBytes(text: string): number[] {
  const result: number[] = [];
  const escape = /\\x[0-9a-fA-F]{2}/g;
  const encodeSpan = (span: string) => {
    if (!span) return;
    let normalized = "";
    for (const c of stripDiacritics(span)) normalized += GS2_NORMALIZATION[c] ?? c;
    const shaped = reshapeArabic(normalized);
    for (const c of shaped) {
      const cp = c.codePointAt(0)!;
      const mapped = GOLDENSUN_ARABIC_BYTE_MAP[cp];
      if (mapped !== undefined) {
        result.push(mapped);
      } else if (isGoldenSunPlainAscii(cp)) {
        result.push(cp);
      } else {
        throw new Error("GS2: unsupported character " + JSON.stringify(c) +
          " U+" + cp.toString(16).toUpperCase() + " — no silent deletion");
      }
    }
  };
  let cursor = 0;
  for (const m of text.matchAll(escape)) {
    const at = m.index ?? cursor;
    encodeSpan(text.slice(cursor, at));
    result.push(parseInt(m[0].slice(2), 16));
    cursor = at + m[0].length;
  }
  encodeSpan(text.slice(cursor));
  return result;
}

function romTextTreePointers(rom: Uint8Array): { trees: number; offsets: number } {
  return {
    trees: offsetOf(read32(rom, GS2_TREE_POINTERS), rom.length),
    offsets: offsetOf(read32(rom, GS2_TREE_POINTERS + 4), rom.length),
  };
}

/** Read all 12,288 real compressed strings, including control codes. */
export function extractGoldenSun2Strings(rom: Uint8Array): GoldenSun2TextEntry[] {
  const arabicFont = isGoldenSun2ArabicFontRom(rom);
  return readGoldenSun2Strings(rom).map((r, i) => {
    const original = goldenSun2BytesToText(r, arabicFont);
    const legacy = legacyGoldenSun2BytesToText(r, arabicFont);
    return {
      index: i, msbtFile: GS2_TEXT_FILE, original,
      ...(legacy === original ? {} : { legacyOriginal: legacy }),
    };
  });
}

/** Discard only fake "translations" that exactly repeat the OLD escaped
 * source spelling (e.g. Japanese \\x83A...). These were never Arabic edits.
 * Every genuinely edited translation and its control codes is preserved.
 */
export function removeLegacyGoldenSun2SourceCopies(
  entries: GoldenSun2TextEntry[], saved: Record<string, string>
): Record<string, string> {
  const next = { ...saved };
  for (const entry of entries) {
    const key = entry.msbtFile + ":" + entry.index;
    if (entry.legacyOriginal !== undefined && next[key] === entry.legacyOriginal) {
      delete next[key];
    }
  }
  return next;
}

function readGoldenSun2Strings(rom: Uint8Array): number[][] {
  if (!hasGoldenSun2TextTables(rom)) {
    throw new Error("لم تُطابق جداول نصوص AGFE المعروفة — رفض الاستخراج لحماية بيانات ROM");
  }
  const { trees, offsets } = romTextTreePointers(rom);
  const entries: number[][] = [];
  for (let chunk = 0; chunk < GS2_CHUNK_COUNT; chunk++) {
    const table = GS2_STRING_POINTERS + chunk * 8;
    let position = offsetOf(read32(rom, table), rom.length);
    const lengths = offsetOf(read32(rom, table + 4), rom.length);
    for (let j = 0; j < GS2_CHUNK_SIZE; j++) {
      const length = rom[lengths + j];
      const bytes = decompressString(rom, position, trees, offsets);
      entries.push(bytes);
      position += length;
    }
  }
  return entries;
}

/** Build and verify an extended GBA ROM without touching the original code. */
export function buildGoldenSun2StringTable(
  rom: Uint8Array, translations: Record<string, string>
): { rom: Uint8Array; translatedLines: number; fontReady: boolean } {
  const originals = readGoldenSun2Strings(rom);
  let translatedLines = 0;
  const fontReady = isGoldenSun2ArabicFontRom(rom);
  const contents = originals.map((raw, index) => {
    const original = goldenSun2BytesToText(raw, fontReady);
    const key = GS2_TEXT_FILE + ":" + index;
    const changed = translations[key];
    if (!changed || changed === original) return raw;
    if (!validateGoldenSun2Translation(original, changed).valid) {
      throw new Error("GS2: technical control codes differ from the original at text #" + index);
    }
    if (!fontReady && /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\uFB50-\uFDFF\uFE70-\uFEFF]/.test(changed)) {
      throw new Error("النص " + index +
        ": أضف رقعة الخط العربي وRTL للجزء الثاني إلى ROM قبل بناء نصوص عربية");
    }
    const bytes = goldenSun2TextToBytes(changed);
    if (bytes.includes(0)) throw new Error("GS2: embedded NUL in string " + index);
    // Dialogue width / two-line auto-wrap gate intentionally disabled.
    // Write the translator's exact bytes; never synthesize, shift or remove
    // 0x03 line breaks. Technical tag, glyph and Huffman integrity checks above
    // and below stay enabled to avoid corrupting game data.
    translatedLines++;
    return bytes;
  });
  if (!translatedLines) return { rom: rom.slice(), translatedLines: 0, fontReady };

  const total = contents.reduce((n, c) => n + c.length + 1, 0);
  const corpus = new Uint8Array(total);
  let at = 0;
  for (const c of contents) {
    corpus.set(c, at);
    at += c.length + 1;
  }
  const huff = buildTrees(corpus);
  for (const n of huff.offsets) {
    if (n !== 0x8000 && n >= 0x8000) {
      throw new Error("GS2: Huffman tree offsets exceed the 15-bit limit");
    }
  }
  const compressed = contents.map((b, i) => {
    const encoded = compressString(huff, b);
    if (encoded.length < 1 || encoded.length >= 255) {
      throw new Error("النص " + i + " حجمه بعد الضغط " + encoded.length +
        " بايت؛ الحد 254. اختصر الترجمة");
    }
    return encoded;
  });

  // Always repack from the original 16 MiB cartridge image. Any previous
  // rebuilt text region is replaced, not appended a second time.
  const outputChunks: Array<{ addr: number; data: Uint8Array }> = [];
  let cursor = GS2_ORIGINAL_ROM_SIZE;
  const append = (data: Uint8Array) => {
    const addr = cursor;
    outputChunks.push({ addr, data });
    cursor = align2(cursor + data.length);
    if (cursor > GS2_MAX_ROM_SIZE) throw new Error("GS2: the rebuilt ROM exceeds 32 MiB");
    return addr;
  };
  const offsetsData = new Uint8Array(512);
  for (let i = 0; i < 256; i++) {
    offsetsData[2 * i] = huff.offsets[i] & 255;
    offsetsData[2 * i + 1] = huff.offsets[i] >>> 8 & 255;
  }
  const offsetsAddr = append(offsetsData);
  const treesAddr = append(huff.treesBlob);
  const rebuiltPointerPairs: Array<[number, number]> = [];
  for (let chunk = 0; chunk < GS2_CHUNK_COUNT; chunk++) {
    const part = compressed.slice(chunk * GS2_CHUNK_SIZE, (chunk + 1) * GS2_CHUNK_SIZE);
    const dataLen = part.reduce((n, b) => n + b.length, 0);
    const data = new Uint8Array(dataLen);
    const lengths = new Uint8Array(GS2_CHUNK_SIZE);
    let p = 0;
    for (let j = 0; j < part.length; j++) {
      data.set(part[j], p);
      p += part[j].length;
      lengths[j] = part[j].length;
    }
    const dataAddr = append(data);
    const lengthsAddr = append(lengths);
    rebuiltPointerPairs.push([dataAddr, lengthsAddr]);
  }
  const rebuilt = new Uint8Array(cursor);
  rebuilt.set(rom.subarray(0, GS2_ORIGINAL_ROM_SIZE));
  for (const piece of outputChunks) rebuilt.set(piece.data, piece.addr);
  write32(rebuilt, GS2_TREE_POINTERS, asPtr(treesAddr));
  write32(rebuilt, GS2_TREE_POINTERS + 4, asPtr(offsetsAddr));
  rebuiltPointerPairs.forEach(([dataAddr, lengthsAddr], chunk) => {
    const at = GS2_STRING_POINTERS + chunk * 8;
    write32(rebuilt, at, asPtr(dataAddr));
    write32(rebuilt, at + 4, asPtr(lengthsAddr));
  });

  // Validate the rebuilt table end-to-end before exposing the downloaded file.
  const verification = readGoldenSun2Strings(rebuilt);
  if (verification.length !== GS2_STRING_COUNT) {
    throw new Error("GS2: rebuilt ROM message count does not match");
  }
  for (let i = 0; i < verification.length; i++) {
    const src = contents[i];
    const got = verification[i];
    if (src.length !== got.length || src.some((v, j) => v !== got[j])) {
      throw new Error("GS2: rebuilt text #" + i + " failed byte-for-byte roundtrip");
    }
  }
  return { rom: rebuilt, translatedLines, fontReady };
}
