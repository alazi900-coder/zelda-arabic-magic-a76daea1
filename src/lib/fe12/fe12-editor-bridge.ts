/**
 * Fire Emblem: Shin Monshou no Nazo — local editor bridge.
 *
 * Design contract for this file: the browser receives the verified English Beta 2
 * `.nds` ROM, reads only its NitroFS resources, then returns a newly allocated byte array.
 * The uploaded ArrayBuffer is never mutated. Arabic remains logical in editor
 * state; it is shaped and reversed only here, immediately before encoding.
 */

import type { ExtractedEntry } from "@/components/editor/types";
import {
  hasArabicChars,
  hasArabicPresentationForms,
  processArabicText,
  stripBidiMarkers,
} from "@/lib/arabic-processing";
import unusedGlyphSource from "./unused-talk-glyphs.json";
import {
  FE12_ARABIC_GLYPH_ADVANCES,
  FE12_ARABIC_GLYPH_CODEPOINTS,
  FE12_ARABIC_GLYPHS_B64,
  FE12_ARABIC_TTF_LICENSE,
  FE12_ARABIC_TTF_NAME,
} from "./fe12-arabic-ttf-glyphs";

export const FE12_BUFFER_KEY = "fe12-rom-buffer";
export const FE12_SOURCE_GAME = "fireemblem12";
export const FE12_TITLE = "FIREEMBLEM12";
export const FE12_GAME_CODE = "VI2J";
/** English v3.01 followed by the official Beta 2 update, supplied and verified by the user. */
export const FE12_ENGLISH_BETA2_SHA256 = "3d469ae2706c85e36dd8a2fb0303fccdbf68b9af0c51fa9350524b357a3999a3";

/** Reserved by the investigated ARM9 design; direct unused Shift-JIS glyphs are
 * used in this safe first release, so no executable ARM9 code is altered. */
export const ARABIC_ENTRY_MARKER = new Uint8Array([0x1f, 0xff]);
export const ARABIC_EXIT_MARKER = new Uint8Array([0x1f, 0xfe]);
export const FONT_FILE_ID = 3035;
export const FONT_PATH = "fonts/talk";
export const COLUMN_ORDER = [7, 6, 5, 4, 3, 2, 1, 0, 15, 14, 13, 12, 11, 10, 9, 8] as const;

const HEADER_SIZE = 0x20;
const DIALOGUE_FILE_RE = /^m\//;
const CONTROL_TOKEN_RE = /\{([01][0-9a-fA-F])\}/g;
const SHIFT_JIS_LEAD = (value: number) => (value >= 0x81 && value <= 0x9f) || (value >= 0xe0 && value <= 0xfc);
const SHIFT_JIS_TRAIL = (value: number) => (value >= 0x40 && value <= 0x7e) || (value >= 0x80 && value <= 0xfc);
const textDecoder = new TextDecoder("shift_jis", { fatal: false });

type Compression = "raw" | "lz10" | "lz11" | "rle";

interface NitroFile {
  id: number;
  path: string;
  start: number;
  end: number;
}

interface NitroLayout {
  files: NitroFile[];
  fatOffset: number;
  fntOffset: number;
  fntSize: number;
  protectedEnd: number;
}

interface ParsedMessage {
  bytes: Uint8Array;
  metadataOffset: number;
  declaredRecords: number;
}

interface Fe12GlyphCandidate {
  code: string;
  width: number;
  descriptorOffset: string;
}

const glyphCandidates = (unusedGlyphSource as { candidates: Fe12GlyphCandidate[] }).candidates;

export interface FE12ExtractResult {
  entries: ExtractedEntry[];
  files: { id: number; path: string; compressedBytes: number; logicalBytes: number; records: number }[];
  skippedFiles: { path: string; reason: string }[];
}

export interface FE12BuildOk {
  rom: Uint8Array;
  translatedLines: number;
  modifiedResources: { path: string; bytes: number; relocated: boolean }[];
  fontGlyphs: number;
  fontReport?: FE12FontInjectionReport;
}

export interface FE12BuildError {
  error: string;
  unsupported?: { key: string; characters: string[] }[];
}

export interface FE12FontInjectionReport {
  applied: true;
  source: {
    name: string;
    license: string;
    type: "TTF";
    raster: "16×16";
    colorDepth: "4bpp";
  };
  glyphs: { requested: number; injected: number };
  slots: {
    listedUnused: number;
    observedInEnglishDialogue: number;
    rejectedAsObserved: number;
    rejectedForCapacity: number;
    usedCodes: string[];
  };
  resource: { path: string; originalBytes: number; outputBytes: number; sizeChanged: false };
  safety: string[];
}

function dv(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function u16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) throw new Error("قراءة خارج حدود ملف اللعبة");
  return dv(bytes).getUint16(offset, true);
}

function u32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) throw new Error("قراءة خارج حدود ملف اللعبة");
  return dv(bytes).getUint32(offset, true);
}

function putU16(bytes: Uint8Array, offset: number, value: number): void {
  dv(bytes).setUint16(offset, value & 0xffff, true);
}

function putU32(bytes: Uint8Array, offset: number, value: number): void {
  dv(bytes).setUint32(offset, value >>> 0, true);
}

function align(value: number, boundary = 4): number {
  return (value + boundary - 1) & ~(boundary - 1);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length)).replace(/\0+$/, "");
}

export function looksLikeFE12Rom(rom: Uint8Array): boolean {
  // The official English Beta 2 patch can produce a valid trimmed NDS image.
  // Exact identity is enforced by verifyFE12Rom() through SHA-256 at upload;
  // this structural guard only protects the local parser and builder.
  return rom.length >= 0x04000000
    && rom.length <= 0x08000000
    && ascii(rom, 0, 12) === FE12_TITLE
    && ascii(rom, 0x0c, 4) === FE12_GAME_CODE;
}

/** A SHA-256 verification is available in every supported browser. */
export async function verifyFE12Rom(rom: Uint8Array): Promise<{ valid: boolean; reason?: string }> {
  if (!looksLikeFE12Rom(rom)) {
    return { valid: false, reason: "هذه ليست نسخة Fire Emblem 12 المطلوبة (FIREEMBLEM12 / VI2J)." };
  }
  if (!globalThis.crypto?.subtle) return { valid: true };
  // Make an owned ArrayBuffer-backed view. This avoids SharedArrayBuffer and
  // sliced-buffer incompatibilities in some browser/test SubtleCrypto builds.
  const digestInput = new Uint8Array(rom.byteLength);
  digestInput.set(rom);
  const hash = await crypto.subtle.digest("SHA-256", digestInput);
  const text = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return text === FE12_ENGLISH_BETA2_SHA256
    ? { valid: true }
    : { valid: false, reason: "الملف يحمل العنوان الصحيح لكنه ليس ROM الإنجليزي Beta 2 المعتمد. طبّق FE12_v3_01.delta ثم fe12_update_beta2.xdelta بالترتيب على ROM الياباني النظيف." };
}

/** Parses NitroFS paths and FAT entries directly from an NDS image. */
function readNitroLayout(rom: Uint8Array): NitroLayout {
  if (rom.length < 0x200) throw new Error("ملف NDS صغير أو تالف");
  const fntOffset = u32(rom, 0x40);
  const fntSize = u32(rom, 0x44);
  const fatOffset = u32(rom, 0x48);
  const fatSize = u32(rom, 0x4c);
  const arm9End = u32(rom, 0x20) + u32(rom, 0x2c);
  const arm7End = u32(rom, 0x30) + u32(rom, 0x3c);
  const bannerEnd = u32(rom, 0x68) + 0x840;
  if (fntOffset + fntSize > rom.length || fatOffset + fatSize > rom.length || fatSize % 8 !== 0) {
    throw new Error("جدول NitroFS غير صالح في هذا ROM");
  }

  const filePaths = new Map<number, string>();
  const directoryCount = u16(rom, fntOffset + 6);
  const visitDirectory = (directoryId: number, prefix: string, active: Set<number>) => {
    const tableIndex = directoryId - 0xf000;
    if (tableIndex < 0 || tableIndex >= directoryCount || active.has(directoryId)) throw new Error("شجرة أسماء NitroFS تالفة");
    const record = fntOffset + tableIndex * 8;
    const tableOffset = u32(rom, record);
    let fileId = u16(rom, record + 4);
    let cursor = fntOffset + tableOffset;
    const nested = new Set(active).add(directoryId);
    while (cursor < fntOffset + fntSize) {
      const typeLength = rom[cursor++];
      if (typeLength === 0) return;
      const isDirectory = !!(typeLength & 0x80);
      const length = typeLength & 0x7f;
      if (cursor + length > fntOffset + fntSize) throw new Error("اسم NitroFS يتجاوز حد الجدول");
      const name = ascii(rom, cursor, length);
      cursor += length;
      if (isDirectory) {
        const child = u16(rom, cursor);
        cursor += 2;
        visitDirectory(child, `${prefix}${name}/`, nested);
      } else {
        filePaths.set(fileId++, `${prefix}${name}`);
      }
    }
    throw new Error("جدول أسماء NitroFS لم ينته بصورة صحيحة");
  };
  visitDirectory(0xf000, "", new Set());

  const files: NitroFile[] = [];
  for (let id = 0; id < fatSize / 8; id++) {
    const start = u32(rom, fatOffset + id * 8);
    const end = u32(rom, fatOffset + id * 8 + 4);
    if (start > end || end > rom.length) throw new Error(`مدخل FAT غير صالح: ${id}`);
    files.push({ id, path: filePaths.get(id) || `__unknown/${id}`, start, end });
  }
  const arm9OverlayEnd = u32(rom, 0x50) + u32(rom, 0x54);
  const arm7OverlayEnd = u32(rom, 0x58) + u32(rom, 0x5c);
  return {
    files,
    fatOffset,
    fntOffset,
    fntSize,
    protectedEnd: align(Math.max(0x200, arm9End, arm7End, bannerEnd, fntOffset + fntSize, fatOffset + fatSize, arm9OverlayEnd, arm7OverlayEnd)),
  };
}

function compressionOf(data: Uint8Array): Compression {
  if (data[0] === 0x11) return "lz11";
  if (data[0] === 0x10) return "lz10";
  if (data[0] === 0x30) return "rle";
  return "raw";
}

function decompressedSize(data: Uint8Array): { size: number; cursor: number } {
  let size = data[1] | (data[2] << 8) | (data[3] << 16);
  if (size !== 0) return { size, cursor: 4 };
  if (data.length < 8) throw new Error("رأس ضغط Nitro مقطوع");
  size = u32(data, 4);
  return { size, cursor: 8 };
}

export function decompressNitro(data: Uint8Array): Uint8Array {
  const type = compressionOf(data);
  if (type === "raw") return new Uint8Array(data);
  const { size, cursor: start } = decompressedSize(data);
  const out = new Uint8Array(size);
  let cursor = start;
  let written = 0;
  if (type === "rle") {
    while (written < size) {
      if (cursor >= data.length) throw new Error("RLE منتهٍ قبل اكتمال المورد");
      const control = data[cursor++];
      const length = (control & 0x7f) + 3;
      if (control & 0x80) {
        if (cursor >= data.length) throw new Error("RLE مكرر مقطوع");
        out.fill(data[cursor++], written, Math.min(size, written + length));
        written += length;
      } else {
        if (cursor + length > data.length) throw new Error("RLE حرفي مقطوع");
        out.set(data.subarray(cursor, cursor + length), written);
        cursor += length;
        written += length;
      }
    }
    return out;
  }
  while (written < size) {
    if (cursor >= data.length) throw new Error(`${type === "lz10" ? "LZ10" : "LZ11"} منتهٍ قبل اكتمال المورد`);
    const flags = data[cursor++];
    for (let bit = 7; bit >= 0 && written < size; bit--) {
      if (!(flags & (1 << bit))) {
        if (cursor >= data.length) throw new Error(`${type === "lz10" ? "LZ10" : "LZ11"} حرفي مقطوع`);
        out[written++] = data[cursor++];
        continue;
      }
      if (cursor >= data.length) throw new Error(`مرجع ${type === "lz10" ? "LZ10" : "LZ11"} مقطوع`);
      const first = data[cursor++];
      const form = first >>> 4;
      let length: number;
      let distance: number;
      if (type === "lz10") {
        if (cursor >= data.length) throw new Error("مرجع LZ10 قصير مقطوع");
        const second = data[cursor++];
        length = form + 3;
        distance = (((first & 0x0f) << 8) | second) + 1;
      } else if (form === 0) {
        if (cursor + 2 > data.length) throw new Error("مرجع LZ11 قصير مقطوع");
        const second = data[cursor++];
        const third = data[cursor++];
        length = (((first & 0x0f) << 4) | (second >>> 4)) + 0x11;
        distance = (((second & 0x0f) << 8) | third) + 1;
      } else if (form === 1) {
        if (cursor + 3 > data.length) throw new Error("مرجع LZ11 طويل مقطوع");
        const second = data[cursor++];
        const third = data[cursor++];
        const fourth = data[cursor++];
        length = (((first & 0x0f) << 12) | (second << 4) | (third >>> 4)) + 0x111;
        distance = (((third & 0x0f) << 8) | fourth) + 1;
      } else {
        if (cursor >= data.length) throw new Error("مرجع LZ11 عادي مقطوع");
        const second = data[cursor++];
        length = form + 1;
        distance = (((first & 0x0f) << 8) | second) + 1;
      }
      if (distance > written) throw new Error("مرجع LZ11 يشير قبل بداية المورد");
      // JavaScript evaluates the destination index before the source. Keeping
      // the increment separate preserves the exact source position for every
      // overlapping LZ11 back-reference in English Beta 2 dialogue resources.
      for (let copied = 0; copied < length && written < size; copied++) {
        out[written] = out[written - distance];
        written++;
      }
    }
  }
  return out;
}

/** A deterministic LZ11 encoder. It deliberately favours short local matches so
 * browser rebuilds stay responsive while retaining the ROM's normal compression. */
export function compressLz11(input: Uint8Array): Uint8Array {
  const output: number[] = [0x11, input.length & 0xff, (input.length >>> 8) & 0xff, (input.length >>> 16) & 0xff];
  const recent = new Map<number, number[]>();
  const keyAt = (offset: number) => offset + 2 < input.length ? (input[offset] << 16) | (input[offset + 1] << 8) | input[offset + 2] : -1;
  const remember = (offset: number) => {
    const key = keyAt(offset);
    if (key < 0) return;
    const found = recent.get(key) || [];
    found.push(offset);
    while (found.length > 24 || (found.length && offset - found[0] > 0x1000)) found.shift();
    recent.set(key, found);
  };
  let cursor = 0;
  while (cursor < input.length) {
    const flagsAt = output.length;
    output.push(0);
    let flags = 0;
    for (let bit = 7; bit >= 0 && cursor < input.length; bit--) {
      const candidates = recent.get(keyAt(cursor)) || [];
      let bestLength = 0;
      let bestDistance = 0;
      for (let index = candidates.length - 1; index >= 0; index--) {
        const match = candidates[index];
        const distance = cursor - match;
        if (distance < 1 || distance > 0x1000) continue;
        const maximum = Math.min(0x10110, input.length - cursor);
        let length = 0;
        while (length < maximum && input[match + length] === input[cursor + length]) length++;
        if (length > bestLength) {
          bestLength = length;
          bestDistance = distance;
          if (length === maximum) break;
        }
      }
      if (bestLength < 3) {
        output.push(input[cursor]);
        remember(cursor++);
        continue;
      }
      flags |= 1 << bit;
      const displacement = bestDistance - 1;
      if (bestLength >= 0x111) {
        const code = bestLength - 0x111;
        output.push(0x10 | ((code >>> 16) & 0x0f), (code >>> 8) & 0xff, ((code & 0xff) << 4) | (displacement >>> 8), displacement & 0xff);
      } else if (bestLength >= 0x11) {
        const code = bestLength - 0x11;
        output.push((code >>> 4) & 0x0f, ((code & 0x0f) << 4) | (displacement >>> 8), displacement & 0xff);
      } else {
        output.push(((bestLength - 1) << 4) | (displacement >>> 8), displacement & 0xff);
      }
      for (let k = 0; k < bestLength; k++) remember(cursor++);
    }
    output[flagsAt] = flags;
  }
  return Uint8Array.from(output);
}

/** LZ10 is used by the small 4bpp title/menu tile resources in Beta 2. */
export function compressLz10(input: Uint8Array): Uint8Array {
  const output: number[] = [0x10, input.length & 0xff, (input.length >>> 8) & 0xff, (input.length >>> 16) & 0xff];
  const recent = new Map<number, number[]>();
  const keyAt = (offset: number) => offset + 2 < input.length ? (input[offset] << 16) | (input[offset + 1] << 8) | input[offset + 2] : -1;
  const remember = (offset: number) => {
    const key = keyAt(offset);
    if (key < 0) return;
    const candidates = recent.get(key) || [];
    candidates.push(offset);
    while (candidates.length > 24 || (candidates.length && offset - candidates[0] > 0x1000)) candidates.shift();
    recent.set(key, candidates);
  };
  let cursor = 0;
  while (cursor < input.length) {
    const flagsAt = output.length;
    output.push(0);
    let flags = 0;
    for (let bit = 7; bit >= 0 && cursor < input.length; bit--) {
      let bestLength = 0;
      let bestDistance = 0;
      const candidates = recent.get(keyAt(cursor)) || [];
      for (let index = candidates.length - 1; index >= 0; index--) {
        const distance = cursor - candidates[index];
        if (distance < 1 || distance > 0x1000) continue;
        const limit = Math.min(18, input.length - cursor);
        let length = 0;
        while (length < limit && input[candidates[index] + length] === input[cursor + length]) length++;
        if (length > bestLength) { bestLength = length; bestDistance = distance; }
      }
      if (bestLength < 3) {
        output.push(input[cursor]);
        remember(cursor++);
        continue;
      }
      flags |= 1 << bit;
      const displacement = bestDistance - 1;
      output.push(((bestLength - 3) << 4) | (displacement >>> 8), displacement & 0xff);
      for (let index = 0; index < bestLength; index++) remember(cursor++);
    }
    output[flagsAt] = flags;
  }
  return Uint8Array.from(output);
}

function parseMessage(bytes: Uint8Array): ParsedMessage | null {
  if (bytes.length < HEADER_SIZE) return null;
  const declaredBytes = u32(bytes, 0);
  const metadataOffset = u32(bytes, 4);
  if (declaredBytes !== bytes.length || metadataOffset < HEADER_SIZE || metadataOffset > bytes.length) return null;
  return { bytes, metadataOffset, declaredRecords: u32(bytes, 12) };
}

function describeString(bytes: Uint8Array): { visible: string; controls: string[] } {
  let visible = "";
  const controls: string[] = [];
  for (let cursor = 0; cursor < bytes.length; cursor++) {
    const byte = bytes[cursor];
    if (byte >= 0x01 && byte <= 0x1f) {
      const token = `{${byte.toString(16).padStart(2, "0").toUpperCase()}}`;
      controls.push(token);
      visible += token;
    } else if (SHIFT_JIS_LEAD(byte) && cursor + 1 < bytes.length && SHIFT_JIS_TRAIL(bytes[cursor + 1])) {
      visible += textDecoder.decode(bytes.subarray(cursor, cursor + 2));
      cursor++;
    } else if (byte >= 0x20 && byte <= 0x7e) {
      visible += String.fromCharCode(byte);
    } else {
      visible += `{${byte.toString(16).padStart(2, "0").toUpperCase()}}`;
    }
  }
  return { visible, controls };
}

function preview(text: string): string {
  const compact = text.replace(/\{[0-9A-F]{2}\}/g, " ").replace(/\s+/g, " ").trim();
  return compact.length > 58 ? `${compact.slice(0, 55)}…` : compact || "رموز تحكم";
}

interface MessageRecord {
  index: number;
  start: number;
  end: number;
  visible: string;
  controls: string[];
}

const MESSAGE_METADATA_BYTES = 0x20;
const MESSAGE_TABLE_RECORD_BYTES = 8;

function primaryRecords(message: ParsedMessage): MessageRecord[] {
  const tableStart = message.metadataOffset + MESSAGE_METADATA_BYTES;
  const tableEnd = tableStart + message.declaredRecords * MESSAGE_TABLE_RECORD_BYTES;
  if (message.declaredRecords > 0 && tableEnd <= message.bytes.length) {
    const records: MessageRecord[] = [];
    for (let index = 0; index < message.declaredRecords; index++) {
      const tableAt = tableStart + index * MESSAGE_TABLE_RECORD_BYTES;
      const relativeStart = message.bytes[tableAt] | (message.bytes[tableAt + 1] << 8) | (message.bytes[tableAt + 2] << 16);
      const start = HEADER_SIZE + relativeStart;
      if (start < HEADER_SIZE || start >= tableStart) return fallbackPrimaryRecords(message);
      let end = start;
      while (end < tableStart && message.bytes[end] !== 0) end++;
      if (end >= tableStart) return fallbackPrimaryRecords(message);
      records.push({ index, start, end, ...describeString(message.bytes.subarray(start, end)) });
    }
    return records;
  }
  return fallbackPrimaryRecords(message);
}

/** Older resources without a valid pointer table remain readable, but English
 * Beta 2 uses the table above for menus and for stable message identities. */
function fallbackPrimaryRecords(message: ParsedMessage): MessageRecord[] {
  const records: MessageRecord[] = [];
  let start = HEADER_SIZE;
  for (let cursor = HEADER_SIZE; cursor < message.metadataOffset; cursor++) {
    if (message.bytes[cursor] !== 0) continue;
    if (cursor > start) records.push({ index: records.length, start, end: cursor, ...describeString(message.bytes.subarray(start, cursor)) });
    start = cursor + 1;
  }
  return records;
}

/** Extracts all primary null-terminated strings from every validated `m/` resource. */
export function extractFE12Entries(rom: Uint8Array): FE12ExtractResult {
  if (!looksLikeFE12Rom(rom)) throw new Error("هذه ليست نسخة Fire Emblem: Shin Monshou no Nazo اليابانية الأصلية.");
  const layout = readNitroLayout(rom);
  const entries: ExtractedEntry[] = [];
  const files: FE12ExtractResult["files"] = [];
  const skippedFiles: FE12ExtractResult["skippedFiles"] = [];
  for (const file of layout.files) {
    if (!DIALOGUE_FILE_RE.test(file.path)) continue;
    try {
      const packed = rom.subarray(file.start, file.end);
      const logical = decompressNitro(packed);
      const message = parseMessage(logical);
      if (!message) {
        skippedFiles.push({ path: file.path, reason: "لا يطابق صيغة حوار FE12 ذات الرأس المتحقق" });
        continue;
      }
      const records = primaryRecords(message).filter((record) => record.end > record.start);
      if (records.length === 0) continue;
      files.push({ id: file.id, path: file.path, compressedBytes: packed.length, logicalBytes: logical.length, records: records.length });
      records.forEach((record) => entries.push({
        msbtFile: file.path,
        index: record.index,
        label: preview(record.visible),
        original: record.visible,
        // The resource is rebuilt and, when necessary, relocated safely in NitroFS.
        maxBytes: 0,
      }));
    } catch (error) {
      skippedFiles.push({ path: file.path, reason: (error as Error).message });
    }
  }
  if (entries.length === 0) throw new Error("لم يُعثر على سجلات حوار قابلة للترجمة داخل مجلد m/.");
  return { entries, files, skippedFiles };
}

function decodeArabicTtfGlyphs(): Uint8Array {
  const binary = atob(FE12_ARABIC_GLYPHS_B64);
  const output = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) output[i] = binary.charCodeAt(i);
  return output;
}

function encodeGlyphRle(raster: number[][]): Uint8Array {
  const pixels: number[] = [];
  for (let y = 0; y < 16; y++) for (const x of COLUMN_ORDER) pixels.push(raster[y][x]);
  const output: number[] = [];
  let cursor = 0;
  while (cursor < pixels.length) {
    let flags = 0;
    const nibbles: number[] = [];
    for (let bit = 0; bit < 8; bit++) {
      if (cursor >= pixels.length) {
        flags |= 1 << bit;
        nibbles.push(0);
        continue;
      }
      let run = 0;
      while (cursor + run < pixels.length && pixels[cursor + run] === 0 && run < 16) run++;
      if (run >= 2) {
        flags |= 1 << bit;
        nibbles.push(run - 1);
        cursor += run;
      } else {
        nibbles.push(pixels[cursor] & 0x0f);
        cursor++;
      }
    }
    output.push(flags);
    for (let pair = 0; pair < 8; pair += 2) output.push((nibbles[pair] << 4) | nibbles[pair + 1]);
  }
  return Uint8Array.from(output);
}

function rasterFromArabicTtfGlyph(glyphs: Uint8Array, glyphIndex: number): { raster: number[][]; width: number } {
  const raster = Array.from({ length: 16 }, () => Array<number>(16).fill(0));
  const base = glyphIndex * 128;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const packed = glyphs[base + y * 8 + Math.floor(x / 2)];
      raster[y][x] = x % 2 === 0 ? packed >>> 4 : packed & 0x0f;
    }
  }
  return { raster, width: FE12_ARABIC_GLYPH_ADVANCES[glyphIndex] || 12 };
}

interface TalkGlyphDescriptor {
  code: number;
  descriptor: number;
  start: number;
  end: number;
}

function allTalkGlyphDescriptors(font: Uint8Array): TalkGlyphDescriptor[] {
  const descriptors: Omit<TalkGlyphDescriptor, "end">[] = [];
  const seen = new Set<number>();
  for (let index = 0; index < 0xc0; index++) {
    const listRelative = u32(font, HEADER_SIZE + index * 4);
    if (!listRelative) continue;
    for (let cursor = HEADER_SIZE + listRelative; cursor + 8 <= font.length; cursor += 8) {
      const code = u16(font, cursor);
      const width = u16(font, cursor + 2);
      if (code === 0 && width === 0) break;
      const relative = u32(font, cursor + 4);
      const start = HEADER_SIZE + relative;
      if (start < HEADER_SIZE || start >= font.length) throw new Error("فهرس خط talk يحوي إزاحة بيانات غير صالحة");
      if (!seen.has(cursor)) {
        descriptors.push({ code, descriptor: cursor, start });
        seen.add(cursor);
      }
    }
  }
  const dataOffsets = Array.from(new Set(descriptors.map((item) => item.start))).sort((a, b) => a - b);
  return descriptors.map((item) => ({
    ...item,
    end: dataOffsets.find((offset) => offset > item.start) || font.length,
  }));
}

function patchArabicTalkFont(source: Uint8Array, observedDialogueCodes: Set<number>): {
  font: Uint8Array;
  codeForForm: Map<number, number>;
  glyphs: number;
  report: FE12FontInjectionReport;
} {
  const font = new Uint8Array(source);
  const glyphs = decodeArabicTtfGlyphs();
  const forms = FE12_ARABIC_GLYPH_CODEPOINTS;
  if (glyphs.length !== forms.length * 128) throw new Error("مصدر خط TTF العربي لا يطابق خريطة أشكاله 16×16");
  const descriptorsByCode = new Map(allTalkGlyphDescriptors(font).map((descriptor) => [descriptor.code, descriptor]));
  const listed = glyphCandidates.map((candidate) => Number.parseInt(candidate.code, 16));
  const rejectedAsObserved = listed.filter((code) => observedDialogueCodes.has(code)).length;
  const remaining = listed
    .filter((code) => !observedDialogueCodes.has(code))
    .map((code) => descriptorsByCode.get(code))
    .filter((descriptor): descriptor is TalkGlyphDescriptor => Boolean(descriptor));
  const generated = forms.map((_, index) => {
    const glyph = rasterFromArabicTtfGlyph(glyphs, index);
    return { ...glyph, encoded: encodeGlyphRle(glyph.raster) };
  });
  const smallestRequired = Math.min(...generated.map((glyph) => glyph.encoded.length));
  const rejectedForCapacity = remaining.filter((candidate) => candidate.end - candidate.start < smallestRequired).length;
  const codeForForm = new Map<number, number>();
  const usedCodes: string[] = [];
  for (let glyphIndex = 0; glyphIndex < generated.length; glyphIndex++) {
    const glyph = generated[glyphIndex];
    const candidateIndex = remaining.findIndex((candidate) => {
      return candidate.end - candidate.start >= glyph.encoded.length;
    });
    if (candidateIndex < 0) {
      throw new Error(`لا توجد سعة كافية داخل خط talk للشكل العربي U+${forms[glyphIndex].toString(16).toUpperCase()}`);
    }
    const candidate = remaining.splice(candidateIndex, 1)[0];
    font.set(glyph.encoded, candidate.start);
    font.fill(0, candidate.start + glyph.encoded.length, candidate.end);
    putU16(font, candidate.descriptor + 2, glyph.width);
    codeForForm.set(forms[glyphIndex], candidate.code);
    usedCodes.push(`0x${candidate.code.toString(16).toUpperCase().padStart(4, "0")}`);
  }
  return {
    font,
    codeForForm,
    glyphs: forms.length,
    report: {
      applied: true,
      source: { name: FE12_ARABIC_TTF_NAME, license: FE12_ARABIC_TTF_LICENSE, type: "TTF", raster: "16×16", colorDepth: "4bpp" },
      glyphs: { requested: forms.length, injected: forms.length },
      slots: {
        listedUnused: listed.length,
        observedInEnglishDialogue: observedDialogueCodes.size,
        rejectedAsObserved,
        rejectedForCapacity,
        usedCodes,
      },
      resource: { path: FONT_PATH, originalBytes: source.length, outputBytes: font.length, sizeChanged: false },
      safety: [
        "حروف الإنجليزية لم تُستبدل؛ الاختيار اقتصر على خانات يابانية غير مستخدمة.",
        "كل خانة مرشحة فُحصت مقابل أكواد الحوار الموجودة في الروم الإنجليزي قبل الحقن.",
        "لم يتغير حجم ملف fonts/talk ولم يُعدّل ARM9.",
      ],
    },
  };
}

function tokenList(text: string): string[] {
  return Array.from(text.matchAll(CONTROL_TOKEN_RE), (match) => match[0].toUpperCase());
}

/** Returns user text with the original control-byte sequence restored if it was
 * removed or reordered. Relative placement prevents a silent loss of waits,
 * speaker/style commands, and line breaks while preserving the translation. */
function restoreControls(original: string, translated: string): string {
  const originalTokens = tokenList(original);
  if (originalTokens.length === 0) return translated;
  const translatedTokens = tokenList(translated);
  if (translatedTokens.length === originalTokens.length && translatedTokens.every((token, index) => token === originalTokens[index])) return translated;
  const originalPlain = original.replace(CONTROL_TOKEN_RE, "");
  const translatedPlain = translated.replace(CONTROL_TOKEN_RE, "");
  const positions: { token: string; at: number }[] = [];
  let plainLength = 0;
  let cursor = 0;
  for (const match of original.matchAll(CONTROL_TOKEN_RE)) {
    plainLength += original.slice(cursor, match.index).length;
    positions.push({ token: match[0].toUpperCase(), at: plainLength });
    cursor = (match.index || 0) + match[0].length;
  }
  let result = "";
  let previous = 0;
  for (const position of positions) {
    const ratio = originalPlain.length === 0 ? 0 : position.at / originalPlain.length;
    const at = Math.max(previous, Math.min(translatedPlain.length, Math.round(translatedPlain.length * ratio)));
    result += translatedPlain.slice(previous, at) + position.token;
    previous = at;
  }
  return result + translatedPlain.slice(previous);
}

function encodeVisibleText(text: string, codeForForm: Map<number, number>): { bytes: Uint8Array; unsupported: string[] } {
  const bytes: number[] = [];
  const unsupported = new Set<string>();
  for (let cursor = 0; cursor < text.length;) {
    const token = text.slice(cursor).match(/^\{([01][0-9a-fA-F])\}/);
    if (token) {
      bytes.push(Number.parseInt(token[1], 16));
      cursor += token[0].length;
      continue;
    }
    const codePoint = text.codePointAt(cursor)!;
    const character = String.fromCodePoint(codePoint);
    cursor += character.length;
    if (codePoint === 0x0a) {
      bytes.push(0x0a);
    } else if (codePoint >= 0x20 && codePoint <= 0x7e) {
      bytes.push(codePoint);
    } else if (codeForForm.has(codePoint)) {
      const code = codeForForm.get(codePoint)!;
      bytes.push(code >>> 8, code & 0xff);
    } else if (codePoint === 0x3000) {
      bytes.push(0x81, 0x40);
    } else {
      unsupported.add(character);
    }
  }
  return { bytes: Uint8Array.from(bytes), unsupported: [...unsupported] };
}

function rewriteMessage(source: Uint8Array, changes: Map<number, string>, codeForForm: Map<number, number>): { bytes: Uint8Array; written: number; unsupported: { index: number; characters: string[] }[] } {
  const message = parseMessage(source);
  if (!message) throw new Error("ملف الحوار لا يطابق صيغة FE12 المتوقعة");
  const records = primaryRecords(message);
  const body: number[] = [];
  const relativeOffsets = new Map<number, number>();
  let written = 0;
  const unsupported: { index: number; characters: string[] }[] = [];
  for (const record of records) {
    relativeOffsets.set(record.index, body.length);
    const translation = changes.get(record.index);
    if (!translation || translation === record.visible) {
      body.push(...source.subarray(record.start, record.end), 0);
      continue;
    }
    const withControls = restoreControls(record.visible, stripBidiMarkers(translation));
    const processed = hasArabicChars(withControls) && !hasArabicPresentationForms(withControls)
      ? processArabicText(withControls, { mirrorPunct: true })
      : withControls;
    const encoded = encodeVisibleText(processed, codeForForm);
    if (encoded.unsupported.length) {
      unsupported.push({ index: record.index, characters: encoded.unsupported });
      body.push(...source.subarray(record.start, record.end), 0);
      continue;
    }
    body.push(...encoded.bytes, 0);
    written++;
  }
  const originalBodyLength = message.metadataOffset - HEADER_SIZE;
  const originalTableStart = message.metadataOffset + MESSAGE_METADATA_BYTES;
  const originalTableEnd = originalTableStart + message.declaredRecords * MESSAGE_TABLE_RECORD_BYTES;
  const hasPointerTable = message.declaredRecords > 0 && originalTableEnd <= source.length && records.length === message.declaredRecords;
  const metadata = hasPointerTable ? source.subarray(message.metadataOffset, originalTableStart) : source.subarray(message.metadataOffset);
  const table = hasPointerTable ? new Uint8Array(source.subarray(originalTableStart, originalTableEnd)) : new Uint8Array();
  const tail = hasPointerTable ? source.subarray(originalTableEnd) : new Uint8Array();
  if (hasPointerTable) {
    for (const [index, offset] of relativeOffsets) {
      const tableAt = index * MESSAGE_TABLE_RECORD_BYTES;
      table[tableAt] = offset & 0xff;
      table[tableAt + 1] = (offset >>> 8) & 0xff;
      table[tableAt + 2] = (offset >>> 16) & 0xff;
    }
  }
  const output = new Uint8Array(HEADER_SIZE + body.length + metadata.length + table.length + tail.length);
  output.set(source.subarray(0, HEADER_SIZE));
  output.set(body, HEADER_SIZE);
  output.set(metadata, HEADER_SIZE + body.length);
  output.set(table, HEADER_SIZE + body.length + metadata.length);
  output.set(tail, HEADER_SIZE + body.length + metadata.length + table.length);
  putU32(output, 0, output.length);
  putU32(output, 4, HEADER_SIZE + body.length);
  if (originalBodyLength < 0) throw new Error("حدود كتلة الحوار غير صالحة");
  return { bytes: output, written, unsupported };
}

function isShiftJisLead(value: number): boolean {
  return (value >= 0x81 && value <= 0x9f) || (value >= 0xe0 && value <= 0xfc);
}

function isShiftJisTrail(value: number): boolean {
  return value >= 0x40 && value <= 0xfc && value !== 0x7f;
}

/** Scans the actual English ROM dialogue before injection. A candidate slot is
 * never repurposed when its original two-byte code still occurs in a message. */
function collectObservedDialogueCodes(rom: Uint8Array, layout: NitroLayout): Set<number> {
  const observed = new Set<number>();
  for (const file of layout.files) {
    if (!DIALOGUE_FILE_RE.test(file.path)) continue;
    const packed = rom.subarray(file.start, file.end);
    let logical: Uint8Array;
    try {
      logical = decompressIfNeeded(packed).data;
    } catch {
      continue;
    }
    const message = parseMessage(logical);
    if (!message) continue;
    for (const record of primaryRecords(message)) {
      for (let cursor = record.start; cursor + 1 < record.end; cursor++) {
        const lead = logical[cursor];
        const trail = logical[cursor + 1];
        if (!isShiftJisLead(lead) || !isShiftJisTrail(trail)) continue;
        observed.add((lead << 8) | trail);
        cursor++;
      }
    }
  }
  return observed;
}

function encodeResource(logical: Uint8Array, compression: Compression): Uint8Array {
  return compression === "lz11" ? compressLz11(logical) : logical;
}

function writeNitroReplacements(original: Uint8Array, layout: NitroLayout, replacements: Map<number, Uint8Array>): { rom: Uint8Array; relocated: Set<number> } {
  let output = new Uint8Array(original);
  const capacityExponent = original[0x14];
  const declaredCapacity = 0x20000 * 2 ** capacityExponent;
  if (!Number.isSafeInteger(declaredCapacity) || declaredCapacity < original.length) {
    throw new Error("سعة بطاقة Nintendo DS المعلنة في رأس ROM غير صالحة.");
  }
  const intervalFiles = layout.files.filter((file) => !replacements.has(file.id)).map((file) => ({ start: file.start, end: file.end })).sort((a, b) => a.start - b.start);
  const relocated = new Set<number>();
  const findGap = (size: number): number | null => {
    let cursor = layout.protectedEnd;
    for (const interval of intervalFiles) {
      cursor = align(cursor);
      if (interval.start >= cursor && interval.start - cursor >= size) return cursor;
      cursor = Math.max(cursor, interval.end);
    }
    cursor = align(cursor);
    return cursor + size <= declaredCapacity ? cursor : null;
  };
  for (const file of layout.files) {
    const replacement = replacements.get(file.id);
    if (!replacement) continue;
    let start = file.start;
    if (replacement.length > file.end - file.start) {
      const gap = findGap(replacement.length);
      if (gap === null) throw new Error(`لا توجد مساحة NitroFS آمنة كافية لنقل المورد ${file.path}. قلّل الترجمة أو ابنِ على دفعات أصغر.`);
      start = gap;
      relocated.add(file.id);
      intervalFiles.push({ start, end: start + replacement.length });
      intervalFiles.sort((a, b) => a.start - b.start);
    }
    if (start + replacement.length > output.length) {
      const nextLength = align(start + replacement.length);
      const expanded = new Uint8Array(nextLength);
      expanded.fill(0xff);
      expanded.set(output);
      output = expanded;
    }
    output.set(replacement, start);
    putU32(output, layout.fatOffset + file.id * 8, start);
    putU32(output, layout.fatOffset + file.id * 8 + 4, start + replacement.length);
  }
  return { rom: output, relocated };
}

/**
 * Builds a new FE12 ROM from the editor state. It touches only translated `m/`
 * resources and `fonts/talk` when Arabic is present; all changes stay client-side.
 */
export function buildFE12RomFromState(rom: Uint8Array, translations: Record<string, string>): FE12BuildOk | FE12BuildError {
  if (!looksLikeFE12Rom(rom)) return { error: "هذه ليست نسخة Fire Emblem 12 الإنجليزية المطلوبة للبناء." };
  try {
    const layout = readNitroLayout(rom);
    const filesByPath = new Map(layout.files.map((file) => [file.path, file]));
    const changedByPath = new Map<string, Map<number, string>>();
    for (const [key, value] of Object.entries(translations)) {
      if (!value?.trim()) continue;
      const delimiter = key.lastIndexOf(":");
      if (delimiter < 1) continue;
      const path = key.slice(0, delimiter);
      const index = Number.parseInt(key.slice(delimiter + 1), 10);
      if (!DIALOGUE_FILE_RE.test(path) || !Number.isInteger(index)) continue;
      const group = changedByPath.get(path) || new Map<number, string>();
      group.set(index, value);
      changedByPath.set(path, group);
    }
    if (changedByPath.size === 0) return { error: "لا توجد ترجمات Fire Emblem محفوظة لبنائها." };

    const requiresArabicFont = [...changedByPath.values()].some((group) => [...group.values()].some((text) => hasArabicChars(text)));
    let codeForForm = new Map<number, number>();
    const replacements = new Map<number, Uint8Array>();
    let fontGlyphs = 0;
    let fontReport: FE12FontInjectionReport | undefined;
    if (requiresArabicFont) {
      const fontFile = filesByPath.get(FONT_PATH);
      if (!fontFile) throw new Error("لم يُعثر على مورد الخط الأصلي fonts/talk في ROM.");
      const packedFont = rom.subarray(fontFile.start, fontFile.end);
      // `fonts/talk` in English Beta 2 is a raw glyph table. Its first byte is
      // coincidentally 0x11, which is also the Nitro LZ11 marker, so this
      // resource must be identified through its verified font structure—not
      // through a single-byte generic compression heuristic.
      const patched = patchArabicTalkFont(packedFont, collectObservedDialogueCodes(rom, layout));
      codeForForm = patched.codeForForm;
      fontGlyphs = patched.glyphs;
      fontReport = patched.report;
      replacements.set(fontFile.id, patched.font);
    }

    let translatedLines = 0;
    const unsupported: { key: string; characters: string[] }[] = [];
    for (const [path, changes] of changedByPath) {
      const file = filesByPath.get(path);
      if (!file) throw new Error(`مورد الحوار ${path} غير موجود في هذه النسخة.`);
      const packed = rom.subarray(file.start, file.end);
      const compression = compressionOf(packed);
      const logical = decompressNitro(packed);
      const rebuilt = rewriteMessage(logical, changes, codeForForm);
      translatedLines += rebuilt.written;
      rebuilt.unsupported.forEach((item) => unsupported.push({ key: `${path}:${item.index}`, characters: item.characters }));
      replacements.set(file.id, encodeResource(rebuilt.bytes, compression));
    }
    if (unsupported.length) {
      return { error: "بعض الأحرف غير مدعومة في خط Fire Emblem؛ لم يُنشأ ROM ناقص.", unsupported };
    }
    if (translatedLines === 0) return { error: "لم تُكتب أي ترجمة. تحقق من النصوص وأحرفها قبل البناء." };
    const written = writeNitroReplacements(rom, layout, replacements);
    return {
      rom: written.rom,
      translatedLines,
      fontGlyphs,
      fontReport,
      modifiedResources: [...replacements].map(([id, data]) => ({
        path: layout.files[id].path,
        bytes: data.length,
        relocated: written.relocated.has(id),
      })),
    };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

export interface FE12MenuImageResource {
  id: "title/mainsave.cg" | "title/modeselect.cg" | "title/temporarysave.cg";
  label: string;
  summary: string;
  palettePath: "title/savetitle.cl" | "title/title.cl";
}

export interface FE12MenuImagePixels {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export const FE12_MENU_IMAGE_RESOURCES: FE12MenuImageResource[] = [
  { id: "title/mainsave.cg", label: "قائمة الحفظ والبداية", summary: "يتضمن الرسم الثابت الخاص ببداية لعبة جديدة والحفظ.", palettePath: "title/savetitle.cl" },
  { id: "title/modeselect.cg", label: "اختيار الصعوبة", summary: "يتضمن الرسم الثابت لدرجات الصعوبة مثل NORMAL وHARD.", palettePath: "title/title.cl" },
  { id: "title/temporarysave.cg", label: "الحفظ المؤقت", summary: "رسم ثابت خاص بشاشة الحفظ المؤقت.", palettePath: "title/savetitle.cl" },
];

function menuResource(resourceId: string): FE12MenuImageResource {
  const resource = FE12_MENU_IMAGE_RESOURCES.find((item) => item.id === resourceId);
  if (!resource) throw new Error("مورد رسم Fire Emblem غير مدعوم.");
  return resource;
}

function readBgr555Palette(raw: Uint8Array): Uint16Array {
  if (raw.length < 32) throw new Error("لوحة ألوان قائمة Fire Emblem قصيرة أو تالفة.");
  const palette = new Uint16Array(16);
  for (let index = 0; index < 16; index++) palette[index] = u16(raw, index * 2);
  return palette;
}

function bgr555ToRgba(value: number, transparent = false): [number, number, number, number] {
  return [Math.round((value & 0x1f) * 255 / 31), Math.round(((value >>> 5) & 0x1f) * 255 / 31), Math.round(((value >>> 10) & 0x1f) * 255 / 31), transparent ? 0 : 255];
}

function decodeMenuTiles(raw: Uint8Array, palette: Uint16Array): FE12MenuImagePixels {
  if (raw.length === 0 || raw.length % 32 !== 0) throw new Error("بلاطات قائمة Fire Emblem ليست 4bpp صالحة.");
  const columns = 8;
  const tiles = raw.length / 32;
  const width = columns * 8;
  const height = Math.ceil(tiles / columns) * 8;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let tile = 0; tile < tiles; tile++) {
    const tileX = (tile % columns) * 8;
    const tileY = Math.floor(tile / columns) * 8;
    for (let pixel = 0; pixel < 64; pixel++) {
      const value = raw[tile * 32 + (pixel >>> 1)];
      const colorIndex = pixel & 1 ? value >>> 4 : value & 0x0f;
      const [red, green, blue, alpha] = bgr555ToRgba(palette[colorIndex], colorIndex === 0);
      const x = tileX + (pixel & 7);
      const y = tileY + (pixel >>> 3);
      const at = (y * width + x) * 4;
      pixels.set([red, green, blue, alpha], at);
    }
  }
  return { width, height, pixels };
}

function encodeMenuTiles(image: FE12MenuImagePixels, palette: Uint16Array): Uint8Array {
  if (image.width !== 64 || image.height % 8 !== 0) throw new Error("أبعاد بديل قائمة Fire Emblem لا تطابق تخطيط البلاطات الأصلي.");
  const out = new Uint8Array((image.width / 8) * (image.height / 8) * 32);
  const nearest = (red: number, green: number, blue: number): number => {
    let selected = 1;
    let distance = Number.POSITIVE_INFINITY;
    for (let index = 1; index < 16; index++) {
      const [r, g, b] = bgr555ToRgba(palette[index]);
      const current = (red - r) ** 2 + (green - g) ** 2 + (blue - b) ** 2;
      if (current < distance) { selected = index; distance = current; }
    }
    return selected;
  };
  const rows = image.height / 8;
  for (let tileY = 0; tileY < rows; tileY++) for (let tileX = 0; tileX < 8; tileX++) {
    const tile = tileY * 8 + tileX;
    for (let pixel = 0; pixel < 64; pixel++) {
      const x = tileX * 8 + (pixel & 7);
      const y = tileY * 8 + (pixel >>> 3);
      const at = (y * image.width + x) * 4;
      const index = image.pixels[at + 3] < 32 ? 0 : nearest(image.pixels[at], image.pixels[at + 1], image.pixels[at + 2]);
      const byteAt = tile * 32 + (pixel >>> 1);
      out[byteAt] |= pixel & 1 ? index << 4 : index;
    }
  }
  return out;
}

export function decodeFE12MenuImage(rom: Uint8Array, resourceId: FE12MenuImageResource["id"]): FE12MenuImagePixels {
  const resource = menuResource(resourceId);
  const layout = readNitroLayout(rom);
  const files = new Map(layout.files.map((file) => [file.path, file]));
  const imageFile = files.get(resource.id);
  const paletteFile = files.get(resource.palettePath);
  if (!imageFile || !paletteFile) throw new Error("لم يُعثر على مورد القائمة أو لوحة ألوانه في ROM.");
  const raw = decompressNitro(rom.subarray(imageFile.start, imageFile.end));
  const palette = readBgr555Palette(decompressNitro(rom.subarray(paletteFile.start, paletteFile.end)));
  return decodeMenuTiles(raw, palette);
}

export function buildFE12MenuImageRom(rom: Uint8Array, resourceId: FE12MenuImageResource["id"], image: FE12MenuImagePixels): { rom: Uint8Array; path: string; relocated: boolean } {
  if (!looksLikeFE12Rom(rom)) throw new Error("هذه ليست نسخة Fire Emblem 12 الإنجليزية المطلوبة.");
  const resource = menuResource(resourceId);
  const layout = readNitroLayout(rom);
  const files = new Map(layout.files.map((file) => [file.path, file]));
  const imageFile = files.get(resource.id);
  const paletteFile = files.get(resource.palettePath);
  if (!imageFile || !paletteFile) throw new Error("لم يُعثر على مورد القائمة أو لوحة ألوانه في ROM.");
  const palette = readBgr555Palette(decompressNitro(rom.subarray(paletteFile.start, paletteFile.end)));
  const original = rom.subarray(imageFile.start, imageFile.end);
  const packed = compressionOf(original) === "lz10" ? compressLz10(encodeMenuTiles(image, palette)) : encodeMenuTiles(image, palette);
  const written = writeNitroReplacements(rom, layout, new Map([[imageFile.id, packed]]));
  return { rom: written.rom, path: resource.id, relocated: written.relocated.has(imageFile.id) };
}
