/**
 * Kingdom Hearts: Birth by Sleep CTD codec.
 *
 * Design contract: this module only handles CTD text containers. It keeps the
 * 12-byte index table, all bytes before the text area, and any tail bytes.
 * Formatting/control bytes are surfaced as visible [CTD:XX] tags and must be
 * retained in their original order before a file can be rebuilt.
 */

import { isArabicChar, processArabicText } from "@/lib/arabic-processing";
import { encodeKHBBSArabicGlyph } from "@/lib/khbbs-arabic-font-map";

const HEADER_MIN_BYTES = 0x20;
const INDEX_RECORD_BYTES = 12;
const TOKEN_PREFIX = "[CTD:";
const CTD_TOKEN_PATTERN = /\[CTD:\s*([0-9A-Fa-f]{2}(?:\s+[0-9A-Fa-f]{2})*)\s*\]/gi;
const CTD_TOKEN_SPLIT_PATTERN = /(\[CTD:\s*[0-9A-Fa-f]{2}(?:\s+[0-9A-Fa-f]{2})*\s*\])/gi;

/**
 * KHBBS design note: Arabic letters always use Font.arabic.arc glyph IDs.
 * This table contains only punctuation and digits whose ASCII equivalent is
 * already present in the English patch, so it must never contain a letter.
 */
const KHBBS_ASCII_FALLBACKS: ReadonlyMap<string, string> = new Map([
  ["؟", "?"], ["،", ","], ["؛", ";"], ["٪", "%"], ["٫", "."], ["٬", ","], ["۔", "."], ["٭", "*"],
  ["٠", "0"], ["١", "1"], ["٢", "2"], ["٣", "3"], ["٤", "4"], ["٥", "5"], ["٦", "6"], ["٧", "7"], ["٨", "8"], ["٩", "9"],
  ["۰", "0"], ["۱", "1"], ["۲", "2"], ["۳", "3"], ["۴", "4"], ["۵", "5"], ["۶", "6"], ["۷", "7"], ["۸", "8"], ["۹", "9"],
  ["«", "\""], ["»", "\""], ["“", "\""], ["”", "\""], ["‘", "'"], ["’", "'"], ["…", "..."], ["–", "-"], ["—", "-"], [" ", " "],
  // U+05E8 Hebrew Resh was confirmed in the user's KHBBS text. It is a stray
  // foreign character, not an Arabic glyph, so encode its Latin transliteration.
  ["ר", "r"],
]);

export interface KHBBSCharacterReplacement {
  character: string;
  unicode: string;
  replacement: string;
  count: number;
}

export interface KHBBSUnsupportedCharacter {
  character: string;
  unicode: string;
  count: number;
}

export interface KHBBSCharacterAnalysis {
  replacements: KHBBSCharacterReplacement[];
  unsupported: KHBBSUnsupportedCharacter[];
  validationError?: string;
}

function unicodeCodePoint(character: string): string {
  return `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
}

export interface CTDEntry {
  /** Zero-based row inside the CTD index table. */
  index: number;
  /** Original string identifier from the index table. */
  id: number;
  /** The third, reserved u32 in the index record. It is preserved unchanged. */
  reserved: number;
  /** Original absolute text pointer, retained for inspection only. */
  originalOffset: number;
  /** Original display text, with control sequences replaced by [CTD:..] tags. */
  text: string;
  /** Current editable translation; initially equal to the original display text. */
  translation: string;
  /** All control bytes in their required original order. */
  rawControlBytes: Uint8Array;
  /** Whether the table row points to a NUL-terminated string inside the text area. */
  hasStringPointer: boolean;
  /** Whether the original string is non-empty and should be offered in the editor. */
  editable: boolean;
}

export interface CTDDocument {
  version: number;
  indexOffset: number;
  stringDataOffset: number;
  /** Full original file; returned byte-for-byte when the user changes nothing. */
  originalBytes: Uint8Array;
  /** Bytes from file start through the end of the index table. */
  headerAndIndex: Uint8Array;
  /** Original allocation gaps retained between individual CTD strings. */
  stringSlots: CTDStringSlot[];
  /** Bytes after the final original NUL-terminated string, if any. */
  tailBytes: Uint8Array;
  entries: CTDEntry[];
}

interface CTDStringSlot {
  originalOffset: number;
  /** Multiple index rows can legally point to the same text location. */
  entryIndices: number[];
  /** Bytes after the terminal NUL until the next original string location. */
  paddingAfter: Uint8Array;
}

export class CTDFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CTDFormatError";
  }
}

export class CTDControlTokenError extends Error {
  readonly entryIndex: number;

  constructor(entryIndex: number, message: string) {
    super(message);
    this.name = "CTDControlTokenError";
    this.entryIndex = entryIndex;
  }
}

function hexByte(byte: number): string {
  return byte.toString(16).toUpperCase().padStart(2, "0");
}

function controlTag(bytes: number[]): string {
  return `[CTD:${bytes.map(hexByte).join(" ")}]`;
}

function isPlainTextByte(byte: number): boolean {
  return byte === 9 || byte === 10 || byte === 13 || (byte >= 0x20 && byte <= 0x7e);
}

/**
 * CTD uses short binary command sequences inside otherwise ASCII strings.
 * The sequences verified in the supplied archive are F9 xx and 81 xx xx.
 * Treating each verified sequence as one visible, atomic tag prevents editors
 * from accidentally changing a command parameter such as F9 59 (button icon).
 */
function readControlSequence(raw: Uint8Array, start: number): number[] | null {
  const byte = raw[start];
  if (byte === 0xf9 && start + 1 < raw.length) return [byte, raw[start + 1]];
  if (byte === 0x81 && start + 2 < raw.length) return [byte, raw[start + 1], raw[start + 2]];
  if (!isPlainTextByte(byte)) return [byte];
  return null;
}

function decodeCTDRaw(raw: Uint8Array): { text: string; controlBytes: Uint8Array } {
  let text = "";
  const controls: number[] = [];

  for (let cursor = 0; cursor < raw.length;) {
    const sequence = readControlSequence(raw, cursor);
    if (sequence) {
      text += controlTag(sequence);
      controls.push(...sequence);
      cursor += sequence.length;
      continue;
    }
    text += String.fromCharCode(raw[cursor]);
    cursor += 1;
  }

  return { text, controlBytes: Uint8Array.from(controls) };
}

function findCStringEnd(bytes: Uint8Array, start: number): number {
  for (let offset = start; offset < bytes.length; offset += 1) {
    if (bytes[offset] === 0) return offset;
  }
  return -1;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function tokenBytes(text: string): Uint8Array {
  const values: number[] = [];
  const tokenPattern = new RegExp(CTD_TOKEN_PATTERN.source, CTD_TOKEN_PATTERN.flags);
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(text)) !== null) {
    const pairs = match[1].trim().split(/\s+/);
    for (const pair of pairs) values.push(Number.parseInt(pair, 16));
  }
  return Uint8Array.from(values);
}

function ensureNoMalformedControlTag(text: string): void {
  const covered = text.replace(new RegExp(CTD_TOKEN_PATTERN.source, CTD_TOKEN_PATTERN.flags), "");
  if (covered.toUpperCase().includes(TOKEN_PREFIX)) {
    throw new CTDFormatError("يوجد وسم CTD غير صالح. استخدم الصيغة [CTD:F9 59] فقط.");
  }
}

/**
 * Calls the existing Arabic builder for each text segment individually. CTD
 * control tags are deliberately left between segments, so their byte order
 * cannot be reversed together with Arabic text.
 */
export function prepareCTDTextForBuild(text: string): string {
  ensureNoMalformedControlTag(text);
  return text
    .split(CTD_TOKEN_SPLIT_PATTERN)
    .map((part) => {
      const isControlTag = new RegExp(`^${CTD_TOKEN_PATTERN.source}$`, "i").test(part);
      return isControlTag ? part : processArabicText(part);
    })
    .join("");
}

/**
 * Analyses the exact post-shaping text that CTD will encode. The editor uses
 * this before build so phone punctuation is reported as a safe automatic
 * substitution, while truly unsupported symbols remain visible to the user.
 */
export function analyzeKHBBSCTDText(text: string): KHBBSCharacterAnalysis {
  let prepared: string;
  try {
    prepared = prepareCTDTextForBuild(text);
  } catch (error) {
    return {
      replacements: [],
      unsupported: [],
      validationError: error instanceof Error ? error.message : "تعذر تحليل وسم CTD.",
    };
  }

  const replacementCounts = new Map<string, KHBBSCharacterReplacement>();
  const unsupportedCounts = new Map<string, KHBBSUnsupportedCharacter>();
  const tokenPattern = new RegExp(CTD_TOKEN_PATTERN.source, CTD_TOKEN_PATTERN.flags);

  const analyzePlainSegment = (segment: string) => {
    for (const character of segment) {
      if (encodeKHBBSArabicGlyph(character)) continue;
      const replacement = KHBBS_ASCII_FALLBACKS.get(character);
      if (replacement !== undefined) {
        const current = replacementCounts.get(character);
        replacementCounts.set(character, current
          ? { ...current, count: current.count + 1 }
          : { character, unicode: unicodeCodePoint(character), replacement, count: 1 });
        continue;
      }
      if (character.charCodeAt(0) <= 0x7e) continue;
      const current = unsupportedCounts.get(character);
      unsupportedCounts.set(character, current
        ? { ...current, count: current.count + 1 }
        : { character, unicode: unicodeCodePoint(character), count: 1 });
    }
  };

  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(prepared)) !== null) {
    analyzePlainSegment(prepared.slice(cursor, match.index));
    cursor = match.index + match[0].length;
  }
  analyzePlainSegment(prepared.slice(cursor));

  return {
    replacements: [...replacementCounts.values()].sort((a, b) => a.unicode.localeCompare(b.unicode)),
    unsupported: [...unsupportedCounts.values()].sort((a, b) => a.unicode.localeCompare(b.unicode)),
  };
}

function encodeCTDText(text: string): Uint8Array {
  ensureNoMalformedControlTag(text);
  const encoded: number[] = [];
  const encoder = new TextEncoder();
  const tokenPattern = new RegExp(CTD_TOKEN_PATTERN.source, CTD_TOKEN_PATTERN.flags);

  const encodePlainSegment = (segment: string): void => {
    for (const character of segment) {
      const glyphBytes = encodeKHBBSArabicGlyph(character);
      if (glyphBytes) {
        encoded.push(...glyphBytes);
        continue;
      }
      const asciiFallback = KHBBS_ASCII_FALLBACKS.get(character);
      if (asciiFallback !== undefined) {
        encoded.push(...encoder.encode(asciiFallback));
        continue;
      }
      if (isArabicChar(character)) {
        const unicode = unicodeCodePoint(character);
        throw new CTDFormatError(
          `الرمز العربي «${character}» (${unicode}) لا يملك شكلاً محقوناً في Font.arc. لا يوجد له مقابل آمن للتحويل التلقائي.`,
        );
      }
      if (character.charCodeAt(0) > 0x7e) {
        throw new CTDFormatError(`الرمز «${character}» (${unicodeCodePoint(character)}) غير مدعوم في نصوص CTD ولا يملك مقابلاً آمناً للتحويل التلقائي.`);
      }
      encoded.push(...encoder.encode(character));
    }
  };
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) !== null) {
    encodePlainSegment(text.slice(cursor, match.index));
    const pairs = match[1].trim().split(/\s+/);
    for (const pair of pairs) encoded.push(Number.parseInt(pair, 16));
    cursor = match.index + match[0].length;
  }
  encodePlainSegment(text.slice(cursor));

  if (encoded.includes(0)) {
    throw new CTDFormatError("لا يمكن أن يحتوي النص على محرف NUL (00).");
  }
  return Uint8Array.from(encoded);
}

/**
 * نقطة فحص تشخيصية: تعيد استخدام مرمّز CTD الفعلي للتحقق من بايتات العربية
 * قبل بناء ملف كامل. لا تغيّر النص ولا تضيف أي معالجة بديلة.
 */
export function encodeKHBBSCTDTextForAudit(text: string): Uint8Array {
  return encodeCTDText(text);
}

function validateControlTokens(entry: CTDEntry): void {
  const actual = tokenBytes(entry.translation);
  if (!sameBytes(actual, entry.rawControlBytes)) {
    throw new CTDControlTokenError(
      entry.index,
      `النص #${entry.index + 1} غيّر أو حذف وسم تحكم تقنياً. أعد وسوم [CTD:..] بالترتيب الأصلي قبل البناء.`,
    );
  }
}

/** Parses a verified @CTD v1 container without changing the supplied buffer. */
export function parseCTD(buffer: ArrayBuffer): CTDDocument {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < HEADER_MIN_BYTES) {
    throw new CTDFormatError("الملف أصغر من ترويسة CTD صالحة.");
  }
  if (String.fromCharCode(...bytes.slice(0, 4)) !== "@CTD") {
    throw new CTDFormatError("لم يتم العثور على الترويسة @CTD؛ الملف ليس CTD مدعوماً.");
  }

  const view = new DataView(buffer);
  const version = view.getUint32(0x04, true);
  const indexOffset = view.getUint32(0x10, true);
  const stringDataOffset = view.getUint32(0x18, true);
  // CTD v1 stores the index-row count in the upper 16 bits of the u32 at 0x0C.
  // Some files place an auxiliary block between the last 12-byte row and the
  // text area, so deriving the count from the 0x10 → 0x18 span rejects valid
  // files. This field matches the validated supplied archive.
  const entryCount = view.getUint16(0x0e, true);
  if (indexOffset < HEADER_MIN_BYTES || indexOffset > stringDataOffset || stringDataOffset > bytes.length) {
    throw new CTDFormatError("مواضع جدول CTD أو منطقة النصوص غير صالحة.");
  }
  if (entryCount === 0 || indexOffset + entryCount * INDEX_RECORD_BYTES > stringDataOffset) {
    throw new CTDFormatError("عدد سجلات فهرس CTD أو نطاق جدول الفهرس غير صالح.");
  }

  const entries: CTDEntry[] = [];
  let finalStringEnd = stringDataOffset;
  const pointerGroups = new Map<number, number[]>();
  const pointerEnds = new Map<number, number>();

  for (let index = 0; index < entryCount; index += 1) {
    const recordOffset = indexOffset + index * INDEX_RECORD_BYTES;
    const id = view.getUint32(recordOffset, true);
    const originalOffset = view.getUint32(recordOffset + 4, true);
    const reserved = view.getUint32(recordOffset + 8, true);
    const hasStringPointer = originalOffset >= stringDataOffset && originalOffset < bytes.length;

    let raw = new Uint8Array();
    if (hasStringPointer) {
      const end = findCStringEnd(bytes, originalOffset);
      if (end === -1) {
        throw new CTDFormatError(`النص في سجل الفهرس #${index + 1} لا ينتهي بالبايت 00.`);
      }
      raw = bytes.slice(originalOffset, end);
      finalStringEnd = Math.max(finalStringEnd, end + 1);
      const group = pointerGroups.get(originalOffset) ?? [];
      group.push(index);
      pointerGroups.set(originalOffset, group);
      pointerEnds.set(originalOffset, end);
    }

    const decoded = decodeCTDRaw(raw);
    entries.push({
      index,
      id,
      reserved,
      originalOffset,
      text: decoded.text,
      translation: decoded.text,
      rawControlBytes: decoded.controlBytes,
      hasStringPointer,
      editable: hasStringPointer && raw.length > 0,
    });
  }

  const pointerOffsets = [...pointerGroups.keys()].sort((a, b) => a - b);
  const stringSlots: CTDStringSlot[] = pointerOffsets.map((originalOffset, slotIndex) => {
    const end = pointerEnds.get(originalOffset)!;
    const nextOffset = pointerOffsets[slotIndex + 1] ?? finalStringEnd;
    return {
      originalOffset,
      entryIndices: pointerGroups.get(originalOffset)!,
      // A few valid CTDs point at a suffix inside a longer string, e.g.
      // "Flashback: The Last Night" and "The Last Night". During a modified
      // build the strings are emitted separately, which keeps both texts valid
      // without requiring an impossible fixed overlap after their lengths vary.
      paddingAfter: nextOffset >= end + 1 ? bytes.slice(end + 1, nextOffset) : new Uint8Array(),
    };
  });

  return {
    version,
    indexOffset,
    stringDataOffset,
    originalBytes: bytes.slice(),
    headerAndIndex: bytes.slice(0, stringDataOffset),
    stringSlots,
    tailBytes: bytes.slice(finalStringEnd),
    entries,
  };
}

/**
 * Rebuilds a CTD while preserving its header/index metadata and all protected
 * control byte sequences. Text pointers are rewritten for every editable or
 * empty-string entry whose original pointer was inside the CTD text area.
 */
export function buildCTD(document: CTDDocument, entries: CTDEntry[] = document.entries): Uint8Array {
  if (entries.length !== document.entries.length) {
    throw new CTDFormatError("عدد سجلات النص المعدّل لا يطابق جدول فهرس CTD الأصلي.");
  }

  // A no-op export must never silently rewrite alignment padding, duplicate
  // pointers, or opaque tail data. This also makes a "test build" reversible.
  if (entries.every((entry) => entry.translation === entry.text)) {
    return document.originalBytes.slice();
  }

  const header = document.headerAndIndex.slice();
  const headerView = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const chunks: Uint8Array[] = [];
  let stringCursor = document.stringDataOffset;

  for (const slot of document.stringSlots) {
    const slotEntries = slot.entryIndices.map((entryIndex) => entries[entryIndex]);
    const canonical = slotEntries[0];
    if (!canonical || slotEntries.some((entry) => !entry || entry.translation !== canonical.translation)) {
      throw new CTDFormatError("يوجد سجلان يشيران إلى النص نفسه لكن بترجمتين مختلفتين.");
    }

    validateControlTokens(canonical);
    const prepared = prepareCTDTextForBuild(canonical.translation);
    const payload = encodeCTDText(prepared);
    const stored = new Uint8Array(payload.length + 1);
    stored.set(payload);
    chunks.push(stored);
    if (slot.paddingAfter.length) chunks.push(slot.paddingAfter);

    for (const entry of slotEntries) {
      const pointerOffset = document.indexOffset + entry.index * INDEX_RECORD_BYTES + 4;
      headerView.setUint32(pointerOffset, stringCursor, true);
    }
    stringCursor += stored.length + slot.paddingAfter.length;
  }

  const totalLength = header.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0) + document.tailBytes.length;
  const output = new Uint8Array(totalLength);
  let outputOffset = 0;
  output.set(header, outputOffset);
  outputOffset += header.length;
  for (const chunk of chunks) {
    output.set(chunk, outputOffset);
    outputOffset += chunk.length;
  }
  output.set(document.tailBytes, outputOffset);
  return output;
}

/** Returns the number of non-empty strings the editor can show to the user. */
export function editableEntryCount(document: CTDDocument): number {
  return document.entries.filter((entry) => entry.editable).length;
}
