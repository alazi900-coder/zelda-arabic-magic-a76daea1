/**
 * Sacred Stones (Europe) — Arabic editor bridge.
 * Design reminder: this adapter is deliberately local-only. It reads a user
 * supplied BE8P ROM, keeps English ASCII intact, shapes/reverses Arabic through
 * the shared processor, and only writes to the download copy created by build.
 */
import type { ExtractedEntry } from "@/components/editor/types";
import { processArabicText, stripBidiMarkers } from "@/lib/arabic-processing";
import {
  FE12_ARABIC_GLYPH_ADVANCES,
  FE12_ARABIC_GLYPH_CODEPOINTS,
  FE12_ARABIC_GLYPHS_B64,
  FE12_ARABIC_TTF_NAME,
} from "@/lib/fe12/fe12-arabic-ttf-glyphs";

export const FE8_BUFFER_KEY = "fire-emblem-sacred-stones-buffer";
export const FE8_SOURCE_GAME = "fireemblem8";
export const FE8_ENTRY_FILE = "fe8/messages";

const ROM_BASE = 0x08000000;
const TREE_BASE = 0x356004;
const ROOT_POINTER_SLOT = 0x35b8a8;
const TEXT_POINTERS = 0x35b8ac;
const TEXT_SCAN_LIMIT = 0x2000;
const GLYPH_TABLES = [0x798340, 0x79b248] as const;
const GLYPH_BYTES = 72;
const ARABIC_SLOTS = Array.from({ length: 0x7f }, (_, index) => 0x81 + index);
const ARABIC_ASCII_PUNCTUATION = new Map<number, number>([[0x060c, 0x2c], [0x061b, 0x3b], [0x061f, 0x3f]]);

type TranslationMap = Record<string, string>;
type HuffmanCode = number[];

export interface FE8FontInjectionReport {
  fontName: string;
  glyphsInjected: number;
  slots: string[];
  glyphTables: string[];
  huffmanSymbolsAdded: number;
  emptySlotsPreserved: number;
  regionalGlyphsReplaced: number;
  note: string;
}

export type FE8BuildResult =
  | { error: string; unsupported?: string[] }
  | { rom: Uint8Array; translatedLines: number; encodedBytes: number; fontReport: FE8FontInjectionReport };

function u16(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function u32(data: Uint8Array, offset: number): number {
  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
}

function writeU32(data: Uint8Array, offset: number, value: number) {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >>> 8) & 0xff;
  data[offset + 2] = (value >>> 16) & 0xff;
  data[offset + 3] = (value >>> 24) & 0xff;
}

function isRomAddress(value: number, size: number): boolean {
  return value >= ROM_BASE && value < ROM_BASE + size;
}

export function looksLikeFE8Rom(rom: Uint8Array): boolean {
  const gameCode = String.fromCharCode(...rom.slice(0xac, 0xb0));
  return rom.length >= 0x1000000 && gameCode === "BE8P";
}

function decodeSymbols(rom: Uint8Array, streamOffset: number, maxCompressed = 4096): number[] {
  const root = u32(rom, ROOT_POINTER_SLOT) - ROM_BASE;
  let nodeOffset = root;
  let cursor = streamOffset;
  const symbols: number[] = [];
  for (let consumed = 0; consumed < maxCompressed; consumed += 1) {
    const packedBits = rom[cursor++];
    let bits = packedBits;
    for (let bit = 0; bit < 8; bit += 1) {
      const childIndex = u16(rom, nodeOffset + ((bits & 1) * 2));
      nodeOffset = TREE_BASE + childIndex * 4;
      const node = u32(rom, nodeOffset);
      bits >>>= 1;
      if ((node & 0x80000000) === 0) continue;
      const symbol = node & 0xffff;
      if (symbol === 0 || (symbol & 0xff) === 0) return symbols;
      symbols.push(symbol);
      nodeOffset = root;
    }
  }
  throw new Error("Huffman stream has no terminator");
}

function symbolsToBytes(symbols: number[]): number[] {
  const bytes: number[] = [];
  for (const symbol of symbols) {
    const lo = symbol & 0xff;
    const hi = symbol >>> 8;
    if (lo) bytes.push(lo);
    if (hi) bytes.push(hi);
  }
  return bytes;
}

function bytesToText(bytes: number[]): string {
  return bytes.map((value) => (value >= 0x20 && value <= 0x7e ? String.fromCharCode(value) : `{FE:${value.toString(16).padStart(2, "0").toUpperCase()}}`)).join("");
}

function isUsefulEnglish(bytes: number[]): boolean {
  const printable = bytes.filter((value) => value >= 0x20 && value <= 0x7e).length;
  return printable > 0 && printable / Math.max(1, bytes.length) >= 0.35;
}

/** Extracts only decodable English records; every entry retains its original FE8 ID. */
export function extractFE8Entries(rom: Uint8Array): { entries: ExtractedEntry[]; textBytes: number } {
  if (!looksLikeFE8Rom(rom)) throw new Error("هذا ليس ROM Sacred Stones الأوروبي الأصلي (BE8P)");
  const entries: ExtractedEntry[] = [];
  let textBytes = 0;
  let invalidAfterStart = 0;
  for (let id = 0; id < TEXT_SCAN_LIMIT; id += 1) {
    const pointer = u32(rom, TEXT_POINTERS + id * 4);
    if (!isRomAddress(pointer, rom.length)) {
      if (entries.length > 0 && ++invalidAfterStart > 48) break;
      continue;
    }
    try {
      const symbols = decodeSymbols(rom, pointer - ROM_BASE);
      const bytes = symbolsToBytes(symbols);
      if (!isUsefulEnglish(bytes)) continue;
      const original = bytesToText(bytes);
      entries.push({
        msbtFile: FE8_ENTRY_FILE,
        index: id,
        label: `رسالة ${id.toString().padStart(4, "0")}`,
        original,
        // Streams are relocated on build; the number guards accidental pasted files, not ROM capacity.
        maxBytes: 2048,
      });
      textBytes += bytes.length;
      invalidAfterStart = 0;
    } catch {
      // The pointer table is followed by unrelated data; only well-formed FE8 strings belong in the editor.
    }
  }
  return { entries, textBytes };
}

export function restoreFE8Translations(entries: ExtractedEntry[], existing: TranslationMap): TranslationMap {
  const restored: TranslationMap = {};
  for (const entry of entries) {
    const key = `${entry.msbtFile}:${entry.index}`;
    if (existing[key]?.trim()) restored[key] = existing[key];
  }
  return restored;
}

function buildHuffmanCodes(rom: Uint8Array): Map<number, HuffmanCode> {
  const root = u32(rom, ROOT_POINTER_SLOT) - ROM_BASE;
  const codes = new Map<number, HuffmanCode>();
  const visit = (nodeOffset: number, prefix: number[], depth: number) => {
    if (depth > 64) throw new Error("Huffman tree depth is invalid");
    for (let bit = 0; bit <= 1; bit += 1) {
      const childIndex = u16(rom, nodeOffset + bit * 2);
      const childOffset = TREE_BASE + childIndex * 4;
      const child = u32(rom, childOffset);
      const path = [...prefix, bit];
      if (child & 0x80000000) codes.set(child & 0xffff, path);
      else visit(childOffset, path, depth + 1);
    }
  };
  visit(root, [], 0);
  return codes;
}

/**
 * FE8's static Huffman tree contains phrase leaves, so not every byte used by a
 * newly added font has a standalone code. We reserve unused leaves only: every
 * original pointer-table stream is decoded first, and no symbol it reaches is
 * ever changed. This makes Arabic and copied technical tags encodable without
 * touching any original English, French, German, Spanish, or Italian message.
 */
function ensureStandaloneHuffmanSymbols(rom: Uint8Array, requested: number[]): number {
  const existing = buildHuffmanCodes(rom);
  const missing = [...new Set(requested)].filter((symbol) => !existing.has(symbol));
  if (!missing.length) return 0;

  const usedSymbols = new Set<number>();
  for (let id = 0; id < TEXT_SCAN_LIMIT; id += 1) {
    const pointer = u32(rom, TEXT_POINTERS + id * 4);
    if (!isRomAddress(pointer, rom.length)) continue;
    try { decodeSymbols(rom, pointer - ROM_BASE).forEach((symbol) => usedSymbols.add(symbol)); } catch { /* ignore unrelated trailing records */ }
  }

  const root = u32(rom, ROOT_POINTER_SLOT) - ROM_BASE;
  const spareLeaves: number[] = [];
  const visited = new Set<number>();
  const visit = (nodeOffset: number) => {
    if (visited.has(nodeOffset)) return;
    visited.add(nodeOffset);
    for (let bit = 0; bit <= 1; bit += 1) {
      const childIndex = u16(rom, nodeOffset + bit * 2);
      const childOffset = TREE_BASE + childIndex * 4;
      const child = u32(rom, childOffset);
      if (child & 0x80000000) {
        if (!usedSymbols.has(child & 0xffff)) spareLeaves.push(childOffset);
      } else visit(childOffset);
    }
  };
  visit(root);
  if (spareLeaves.length < missing.length) throw new Error(`شجرة Huffman لا تحتوي أوراقاً حرة كافية (${missing.length} مطلوبة، ${spareLeaves.length} متاحة).`);
  missing.forEach((symbol, index) => writeU32(rom, spareLeaves[index], 0x80000000 | symbol));
  return missing.length;
}

function toGlyphBytes(): Map<number, Uint8Array> {
  const raw = Uint8Array.from(atob(FE12_ARABIC_GLYPHS_B64), (char) => char.charCodeAt(0));
  const map = new Map<number, Uint8Array>();
  for (let index = 0; index < FE12_ARABIC_GLYPH_CODEPOINTS.length; index += 1) {
    const source = raw.slice(index * 128, index * 128 + 128);
    const record = new Uint8Array(GLYPH_BYTES);
    record[5] = Math.min(16, FE12_ARABIC_GLYPH_ADVANCES[index] ?? 11);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const packed = source[y * 8 + Math.floor(x / 2)];
        const pixel = x & 1 ? packed >>> 4 : packed & 0x0f;
        if (!pixel) continue;
        const pixelOffset = 8 + y * 4 + Math.floor(x / 4);
        record[pixelOffset] |= 3 << (2 * (x % 4));
      }
    }
    map.set(FE12_ARABIC_GLYPH_CODEPOINTS[index], record);
  }
  return map;
}

function injectArabicFont(rom: Uint8Array): { codeMap: Map<number, number>; report: FE8FontInjectionReport } {
  const glyphs = toGlyphBytes();
  // Arabic comma/semicolon/question-mark intentionally use their existing Latin
  // punctuation slots; the game has 127 replaceable regional slots and 126
  // presentation-form glyphs after excluding those three punctuation marks.
  ARABIC_ASCII_PUNCTUATION.forEach((slot, codePoint) => glyphs.delete(codePoint) && void slot);
  if (glyphs.size > ARABIC_SLOTS.length) throw new Error("خط العربية أكبر من خانات Sacred Stones المتاحة");
  // In the European FE8 fonts 0x80–0xFF are deliberately empty pointer-table
  // slots. Empty means a null pointer, not an allocated blank glyph record, so
  // allocate independent 72-byte records in verified free space and point each
  // selected slot in both game fonts at its new record.
  const requiredBytes = glyphs.size * GLYPH_BYTES * GLYPH_TABLES.length;
  const glyphPoolStart = findFreeRun(rom, requiredBytes + 32);
  if (glyphPoolStart === null) throw new Error(`لا توجد مساحة ROM حرة كافية لخط العربية (${requiredBytes} بايت).`);
  const codeMap = new Map<number, number>();
  ARABIC_ASCII_PUNCTUATION.forEach((slot, codePoint) => codeMap.set(codePoint, slot));
  let position = 0;
  let glyphCursor = glyphPoolStart;
  for (const [codePoint, glyph] of glyphs) {
    const slot = ARABIC_SLOTS[position++];
    codeMap.set(codePoint, slot);
    for (const table of GLYPH_TABLES) {
      rom.set(glyph, glyphCursor);
      writeU32(rom, table + slot * 4, ROM_BASE + glyphCursor);
      glyphCursor += GLYPH_BYTES;
    }
  }
  const huffmanSymbolsAdded = ensureStandaloneHuffmanSymbols(rom, [
    // Printable Latin text and the FE technical/control tags copied into a
    // translation remain writable even when the original tree used phrase leaves.
    ...Array.from({ length: 0x7e - 0x20 + 1 }, (_, index) => 0x20 + index),
    ...Array.from({ length: 0x1f }, (_, index) => index + 1),
    ...codeMap.values(),
  ]);
  return {
    codeMap,
    report: {
      fontName: FE12_ARABIC_TTF_NAME,
      glyphsInjected: glyphs.size,
      slots: ARABIC_SLOTS.slice(0, glyphs.size).map((slot) => `0x${slot.toString(16).padStart(2, "0").toUpperCase()}`),
      glyphTables: GLYPH_TABLES.map((table) => `0x${table.toString(16).toUpperCase()}`),
      huffmanSymbolsAdded,
      emptySlotsPreserved: ARABIC_SLOTS.length - glyphs.size,
      regionalGlyphsReplaced: 0,
      note: "العربية حُقنت في خانات فارغة 0x81–0xFF. أُنشئت سجلات غليفات وأوراق Huffman حرة جديدة؛ ASCII ورموز التحكم واللغات الأوروبية لم تُمس.",
    },
  };
}

function textToFE8Bytes(text: string, glyphMap: Map<number, number>): { bytes: number[]; unsupported: string[] } {
  const processed = stripBidiMarkers(processArabicText(text, { mirrorPunct: true }));
  const bytes: number[] = [];
  const unsupported: string[] = [];
  for (let index = 0; index < processed.length; index += 1) {
    if (processed.startsWith("{FE:", index)) {
      const token = processed.slice(index, index + 7);
      const match = /^\{FE:([0-9A-Fa-f]{2})\}$/.exec(token);
      if (match) { bytes.push(parseInt(match[1], 16)); index += 6; continue; }
    }
    const code = processed.codePointAt(index)!;
    if (code > 0xffff) { unsupported.push(String.fromCodePoint(code)); index += 1; continue; }
    if (code <= 0x7e && code >= 0x20) bytes.push(code);
    else {
      const punctuation = ARABIC_ASCII_PUNCTUATION.get(code);
      if (punctuation !== undefined) { bytes.push(punctuation); continue; }
      const replacement = glyphMap.get(code);
      if (replacement === undefined) unsupported.push(String.fromCharCode(code));
      else bytes.push(replacement);
    }
  }
  return { bytes, unsupported };
}

function encodeFE8Bytes(bytes: number[], codes: Map<number, HuffmanCode>): Uint8Array {
  const output: number[] = [];
  let currentByte = 0;
  let writtenBits = 0;
  for (const symbol of [...bytes, 0]) {
    const code = codes.get(symbol);
    if (!code) throw new Error(`لا يوجد رمز Huffman للبايت 0x${symbol.toString(16).padStart(2, "0")}`);
    for (const bit of code) {
      currentByte |= bit << writtenBits;
      writtenBits += 1;
      if (writtenBits === 8) { output.push(currentByte); currentByte = 0; writtenBits = 0; }
    }
  }
  if (writtenBits) output.push(currentByte);
  return Uint8Array.from(output);
}

function findFreeRun(rom: Uint8Array, minimum: number): number | null {
  let runEnd = rom.length;
  let runSize = 0;
  for (let offset = rom.length - 1; offset >= 0x800000; offset -= 1) {
    if (rom[offset] === 0xff) {
      runSize += 1;
      if (runSize >= minimum) return offset;
    } else { runSize = 0; runEnd = offset; }
  }
  void runEnd;
  return null;
}

export function buildFE8RomFromState(source: Uint8Array, translations: TranslationMap): FE8BuildResult {
  if (!looksLikeFE8Rom(source)) return { error: "ارفع ROM Sacred Stones الأوروبي الأصلي (BE8P) أولاً." };
  const rom = new Uint8Array(source);
  try {
    const { codeMap, report } = injectArabicFont(rom);
    const codes = buildHuffmanCodes(rom);
    const pending: { id: number; stream: Uint8Array }[] = [];
    const unsupported = new Set<string>();
    for (const [key, translation] of Object.entries(translations)) {
      if (!key.startsWith(`${FE8_ENTRY_FILE}:`) || !translation.trim()) continue;
      const id = Number(key.slice(`${FE8_ENTRY_FILE}:`.length));
      if (!Number.isInteger(id) || id < 0 || id >= TEXT_SCAN_LIMIT) continue;
      const converted = textToFE8Bytes(translation, codeMap);
      converted.unsupported.forEach((char) => unsupported.add(char));
      if (converted.unsupported.length) continue;
      pending.push({ id, stream: encodeFE8Bytes(converted.bytes, codes) });
    }
    if (unsupported.size) return { error: "توجد حروف غير مدعومة في خط Sacred Stones.", unsupported: [...unsupported].slice(0, 24) };
    const totalBytes = pending.reduce((sum, item) => sum + item.stream.length, 0);
    const poolStart = findFreeRun(rom, Math.max(0x4000, totalBytes + 32));
    if (poolStart === null) return { error: `لا توجد مساحة ROM حرة كافية لتخزين ${totalBytes} بايت من النص المضغوط.` };
    let cursor = poolStart;
    for (const item of pending) {
      rom.set(item.stream, cursor);
      writeU32(rom, TEXT_POINTERS + item.id * 4, ROM_BASE + cursor);
      cursor += item.stream.length;
    }
    return { rom, translatedLines: pending.length, encodedBytes: totalBytes, fontReport: report };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
