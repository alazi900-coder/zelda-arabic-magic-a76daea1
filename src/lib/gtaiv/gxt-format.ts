/**
 * GTA IV GXT/OXT reader.
 *
 * Scope: inspect and reconcile text identities, then perform a verified binary
 * GXT rebuild. It never reads or emits font resources. Arabic text is shaped
 * locally then converted to the units carried by the audited English v3 font.
 */

import { processArabicText, removeArabicPresentationForms, reverseBidi } from "@/lib/arabic-processing";

export interface GtaIvGxtTableSummary {
  name: string;
  offset: number;
  entries: number;
  textBytes: number;
}

export interface GtaIvGxtSummary {
  version: number;
  charSize: number;
  tables: GtaIvGxtTableSummary[];
  entries: number;
  bytes: number;
}

export interface GtaIvGxtEntry {
  /** Byte offset relative to the TDAT payload (after TDAT + size). */
  dataOffset: number;
  /** Stable GTA IV text identity inside its table. */
  crc: number;
  /** Raw 16-bit units as stored in the GXT, excluding the terminating NUL. */
  textUnits: Uint16Array;
}

export interface GtaIvParsedGxtTable {
  name: string;
  offset: number;
  tkeyOffset: number;
  tdatOffset: number;
  textBytes: number;
  entries: GtaIvGxtEntry[];
}

export interface GtaIvParsedGxt {
  version: number;
  charSize: number;
  bytes: number;
  tables: GtaIvParsedGxtTable[];
}

export interface GtaIvOxtSummary {
  version: number;
  charSize: number;
  needDecode: boolean;
  singleFileTable: boolean;
  tables: number;
  entries: number;
}

export type GtaIvOxtKeyKind = "named" | "crc";

export interface GtaIvOxtEntry {
  /** The key spelling in the OXT export, with formatting whitespace removed. */
  key: string;
  keyKind: GtaIvOxtKeyKind;
  /** Stable GTA IV identity, computed for named keys or read for hexadecimal keys. */
  crc: number;
  /** Text after the first '=' exactly as represented by the OXT export. */
  value: string;
  /** UTF-16 units of value; these are the mod's encoded glyph identifiers, not logical Arabic. */
  textUnits: Uint16Array;
}

export interface GtaIvParsedOxtTable {
  name: string;
  entries: GtaIvOxtEntry[];
}

export interface GtaIvParsedOxt {
  version: number;
  charSize: number;
  needDecode: boolean;
  singleFileTable: boolean;
  tables: GtaIvParsedOxtTable[];
}

export interface GtaIvOxtGxtIdentity {
  table: string;
  key: string;
  crc: number;
  gxtEntry: GtaIvGxtEntry | null;
}

export interface GtaIvGxtReplacement {
  /** Existing table name; table order is never changed. */
  table: string;
  /** Existing TKEY CRC; it is preserved rather than recomputed. */
  crc: number;
  /** Pre-encoded glyph units without a trailing NUL. Not arbitrary Unicode input. */
  textUnits: Uint16Array;
}

export interface GtaIvRuntimeTokenValidation {
  valid: boolean;
  sourceTokens: string[];
  candidateTokens: string[];
  reason?: string;
}

export interface GtaIvRuntimeTokenRepair {
  text: string;
  changed: boolean;
  safe: boolean;
  reason?: string;
}

export interface GtaIvDollarAmountValidation {
  valid: boolean;
  sourceAmounts: string[];
  candidateAmounts: string[];
  reason?: string;
}

export interface GtaIvDollarAmountRepair {
  text: string;
  changed: boolean;
  safe: boolean;
  reason?: string;
}

export interface GtaIvUnsupportedCharacter {
  /** The literal character as it appears after GTA IV Arabic shaping. */
  character: string;
  /** Unicode identifier, including non-BMP symbols when applicable. */
  unicode: string;
  /** Number of appearances across the analyzed text. */
  count: number;
}

export interface GtaIvUnsupportedCharacterAnalysis {
  /** The text after Arabic shaping and protected-dollar restoration. */
  processedText: string;
  /** Characters that cannot be emitted by the audited English v3 font. */
  unsupported: GtaIvUnsupportedCharacter[];
}

const ascii = new TextDecoder("ascii");
const hexCrc = /^0x([0-9a-f]{8})$/i;

/**
 * GTA IV GXT stores MAP *input* units, rather than the sparse glyph-slot
 * values on the right side of `fonts.dat` MAP. In the working Arabic
 * reference, the 144 Arabic Presentation Forms occupy the consecutive input
 * range 97..240. Unit 126 is a valid Arabic glyph input in binary GXT data;
 * it must never be interpreted as a literal runtime-token tilde during build.
 */
const gtaIvArabicPresentationFormStart = 0xfe70;
const gtaIvArabicPresentationFormEnd = 0xfeff;
const gtaIvArabicPresentationFormInputStart = 97;
const gtaIvArabicPresentationFormCount = gtaIvArabicPresentationFormEnd - gtaIvArabicPresentationFormStart + 1;

const gtaIvPresentationFormByUnit = new Map<number, number>(
  Array.from({ length: gtaIvArabicPresentationFormCount }, (_, index) => [
    gtaIvArabicPresentationFormInputStart + index,
    gtaIvArabicPresentationFormStart + index,
  ]),
);

function gtaIvArabicInputUnitForPresentationForm(code: number): number | undefined {
  if (code < gtaIvArabicPresentationFormStart || code > gtaIvArabicPresentationFormEnd) return undefined;
  return gtaIvArabicPresentationFormInputStart + code - gtaIvArabicPresentationFormStart;
}

const gtaIvArabicPunctuationToAscii: Record<string, string> = {
  "؟": "?",
  "،": ",",
  "؛": ";",
  "٪": "%",
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

const runtimeTokenPattern = /~[^~]+~/g;
// Visible GTA IV prices are content rather than runtime syntax, but their
// spelling and order must survive translation and Arabic visual reordering.
// Supports ordinary, grouped, decimal, and abbreviated values: $100, $5,000,
// $0.50, $20m.
const gtaIvDollarAmountPattern = /\$\d+(?:,\d{3})*(?:\.\d+)?(?:[kKmMbB])?/g;
// Translation services may express `$700` as `700$`, `٧٠٠$`, `700 دولار`,
// `٧٠٠ دولار`, or `$10m` as `10 ملايين دولار`. Only those explicit money
// spellings are candidate slots; ordinary UI numbers are never changed.
const gtaIvDollarAmountCandidatePattern = /\$\s*[0-9٠-٩]+(?:,[0-9٠-٩]{3})*(?:\.[0-9٠-٩]+)?(?:[kKmMbB])?|[0-9٠-٩]+(?:,[0-9٠-٩]{3})*(?:[\.,،][0-9٠-٩]{1,2})?(?:[kKmMbB])?\s*(?:\$|دولار)|[0-9٠-٩]+\s+(?:مليون|ملايين)\s+دولار/g;

export interface GtaIvArabicEncoding {
  /** Shaped and visually ordered text after protected tokens are restored. */
  processedText: string;
  /** Font-unit sequence ready for the GXT TDAT payload, without NUL. */
  textUnits: Uint16Array;
}

function isGtaIvEnglishV3CharacterSupported(char: string, sourceExtendedUnits?: Map<number, number>): boolean {
  const code = char.codePointAt(0) ?? 0;
  if (code >= gtaIvArabicPresentationFormStart && code <= gtaIvArabicPresentationFormEnd) return true;
  // The source american.gxt can contain verified legacy Latin-1 glyph units
  // such as © and NBSP. They are safe only when the same unit already occurs
  // in this exact source row; a new extended glyph still has no audited slot.
  if (code > 0x7f && code <= 0xff && (sourceExtendedUnits?.get(code) ?? 0) > 0) return true;
  return code > 0 && code <= 0x7f;
}

function gtaIvSourceExtendedUnitBudget(sourceText: string): Map<number, number> {
  const budget = new Map<number, number>();
  for (let index = 0; index < sourceText.length; index += 1) {
    const unit = sourceText.charCodeAt(index);
    if (unit <= 0x7f || unit > 0xff) continue;
    budget.set(unit, (budget.get(unit) ?? 0) + 1);
  }
  return budget;
}

/**
 * Applies the exact preparation used by the GTA IV builder, then reports every
 * remaining character that cannot be represented by the audited English v3
 * font. It is safe to call while editing: it never validates or mutates text.
 */
export function analyzeGtaIvUnsupportedCharacters(translation: string, sourceText = ""): GtaIvUnsupportedCharacterAnalysis {
  const pieces = translation.split(/(~[^~]+~)/g);
  const processedText = pieces.map((piece, index) => (
    index % 2 === 1 ? piece : processGtaIvArabicPiece(piece)
  )).join("");
  const unsupported = new Map<string, GtaIvUnsupportedCharacter>();
  const sourceExtendedUnits = gtaIvSourceExtendedUnitBudget(sourceText);

  for (const char of processedText) {
    const codePoint = char.codePointAt(0) ?? 0;
    const sourceCount = sourceExtendedUnits.get(codePoint) ?? 0;
    if (isGtaIvEnglishV3CharacterSupported(char, sourceExtendedUnits)) {
      if (codePoint > 0x7f && codePoint <= 0xff && sourceCount > 0) {
        sourceExtendedUnits.set(codePoint, sourceCount - 1);
      }
      continue;
    }
    const unicode = `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
    const previous = unsupported.get(unicode);
    unsupported.set(unicode, previous
      ? { ...previous, count: previous.count + 1 }
      : { character: char, unicode, count: 1 });
  }

  return {
    processedText,
    unsupported: [...unsupported.values()].sort((left, right) => left.unicode.localeCompare(right.unicode)),
  };
}

function fail(message: string): never {
  throw new Error(`ملف GTA IV غير صالح: ${message}`);
}

function u16(view: DataView, offset: number): number {
  if (offset + 2 > view.byteLength) fail("قراءة خارج حدود الملف.");
  return view.getUint16(offset, true);
}

function u32(view: DataView, offset: number): number {
  if (offset + 4 > view.byteLength) fail("قراءة خارج حدود الملف.");
  return view.getUint32(offset, true);
}

function marker(bytes: Uint8Array, offset: number, size = 4): string {
  if (offset + size > bytes.length) fail("ترويسة كتلة ناقصة.");
  return ascii.decode(bytes.subarray(offset, offset + size));
}

function tableName(bytes: Uint8Array, offset: number): string {
  return ascii.decode(bytes.subarray(offset, offset + 8)).replace(/\0+$/, "").trim();
}

function unitsFromText(value: string): Uint16Array {
  const units = new Uint16Array(value.length);
  for (let index = 0; index < value.length; index += 1) units[index] = value.charCodeAt(index);
  return units;
}

function textFromUnits(units: Uint16Array): string {
  let value = "";
  for (let index = 0; index < units.length; index += 1) value += String.fromCharCode(units[index]);
  return value;
}

function normalizeGtaIvArabicPunctuation(value: string): string {
  return [...value].map((char) => gtaIvArabicPunctuationToAscii[char] ?? char).join("");
}

/**
 * Converts a logical editor translation into GTA IV font units. Only ASCII and
 * the Arabic Presentation Forms present in the verified reference MAP are
 * emitted. This keeps unsupported glyphs out of GXT instead of silently
 * writing visible squares.
 */
export function encodeGtaIvArabicText(sourceText: string, translation: string): GtaIvArabicEncoding {
  const dollarRepair = repairGtaIvDollarAmountSequence(sourceText, translation);
  // Dollar values are an editor-level warning, not a build-blocking format rule.
  // Keep a safe normalization when possible, otherwise emit the user translation.
  const normalizedTranslation = dollarRepair.safe ? dollarRepair.text : translation;

  const { processedText, unsupported } = analyzeGtaIvUnsupportedCharacters(normalizedTranslation, sourceText);
  if (unsupported.length > 0) {
    const first = unsupported[0];
    fail(`المحرف «${first.character}» (${first.unicode}) غير مدعوم في خط GTA IV المرجعي.`);
  }
  const units: number[] = [];

  for (const char of processedText) {
    const code = char.charCodeAt(0);
    if (code >= gtaIvArabicPresentationFormStart && code <= gtaIvArabicPresentationFormEnd) {
      const unit = gtaIvArabicInputUnitForPresentationForm(code);
      if (unit === undefined) fail(`لا توجد خانة استعادة للشكل العربي U+${code.toString(16).toUpperCase()}.`);
      units.push(unit);
      continue;
    }
    if (code > 0 && code <= 0x7f) {
      units.push(code);
      continue;
    }
    // `analyzeGtaIvUnsupportedCharacters` above has already verified this unit
    // appeared in the same source row, so preserving it cannot invent a font
    // mapping. This branch intentionally covers only legacy one-byte units.
    if (code > 0x7f && code <= 0xff) {
      units.push(code);
      continue;
    }
    fail(`المحرف «${char}» غير مدعوم في خط GTA IV المرجعي.`);
  }
  return { processedText, textUnits: new Uint16Array(units) };
}

/**
 * Keeps each visible dollar amount atomic while the surrounding Arabic text is
 * reshaped and visually reversed for GTA IV's LTR renderer. The temporary PUA
 * markers are restored before GXT units are emitted, so they can never leak
 * into the game text.
 */
function processGtaIvArabicPiece(value: string): string {
  const amounts: string[] = [];
  const shielded = normalizeGtaIvArabicPunctuation(value).replace(gtaIvDollarAmountPattern, (amount) => {
    const index = amounts.length;
    amounts.push(amount);
    if (index >= 96) return amount;
    return `\uE0F2${String.fromCharCode(0xE0A0 + index)}\uE0F2`;
  });
  const processed = processArabicText(shielded);
  return processed.replace(/\uE0F2([\uE0A0-\uE0FF])\uE0F2/g, (marker, slot) => {
    const index = slot.charCodeAt(0) - 0xE0A0;
    return amounts[index] ?? marker;
  });
}

/**
 * Returns the literal UTF-16 representation stored in a GXT entry.
 * This is suitable for the English source file; it does not decode the
 * custom Arabic glyph identifiers used by the separate Russian-slot mod.
 */
export function gtaIvRawUnitsToString(units: Uint16Array): string {
  return textFromUnits(units);
}

/**
 * Decodes units from an already built Arabic GXT back to logical Arabic. The
 * caller must opt in because the verified Arabic input range 97..240 overlaps
 * ordinary English ASCII and therefore cannot be auto-detected safely.
 */
export function decodeGtaIvArabicFontUnits(units: Uint16Array, encodedArabic = false): string {
  if (!encodedArabic) return textFromUnits(units);

  let presentationText = "";
  for (const unit of units) {
    presentationText += String.fromCharCode(gtaIvPresentationFormByUnit.get(unit) ?? unit);
  }
  return removeArabicPresentationForms(reverseBidi(presentationText));
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

function identityKey(table: string, crc: number): string {
  return `${table}\u0000${crc >>> 0}`;
}

function readGxtTextUnits(view: DataView, payloadOffset: number, textBytes: number, dataOffset: number, table: string): Uint16Array {
  if (dataOffset % 2 !== 0) fail(`إزاحة نص غير زوجية في الجدول ${table}.`);
  const start = payloadOffset + dataOffset;
  const end = payloadOffset + textBytes;
  for (let offset = start; offset < end; offset += 2) {
    if (u16(view, offset) !== 0) continue;
    const units = new Uint16Array((offset - start) / 2);
    for (let index = 0; index < units.length; index += 1) units[index] = u16(view, start + index * 2);
    return units;
  }
  fail(`نص غير منتهٍ بـ NUL في الجدول ${table}.`);
}

/**
 * GTA IV's GXT key routine, transcribed from the published game-specific algorithm.
 * It lowercases ASCII A–Z, normalizes backslash to slash, and uses only text inside
 * an optional leading/trailing double quote pair.
 */
export function gtaIvHashKey(key: string): number {
  let hash = 0;
  let index = key.charCodeAt(0) === 0x22 ? 1 : 0;

  for (; index < key.length; index += 1) {
    let code = key.charCodeAt(index);
    if (code === 0x22) break;
    if (code >= 0x41 && code <= 0x5a) code += 32;
    else if (code === 0x5c) code = 0x2f;

    const product = Math.imul(1025, (hash + code) >>> 0) >>> 0;
    hash = ((product >>> 6) ^ product) >>> 0;
  }

  const product = Math.imul(9, hash) >>> 0;
  return Math.imul(32769, (product ^ (product >>> 11)) >>> 0) >>> 0;
}

/** Parses all tables and text units without interpreting the font-specific glyph encoding. */
export function parseGtaIvGxt(buffer: ArrayBuffer): GtaIvParsedGxt {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes.length < 12) fail("أقصر من ترويسة GXT.");

  const version = u16(view, 0);
  const charSize = u16(view, 2);
  if (version !== 4) fail(`Version ${version} غير مدعوم؛ المتوقع Version 4.`);
  if (charSize !== 16) fail(`CharSize ${charSize} غير مدعوم؛ المتوقع CharSize 16.`);
  if (marker(bytes, 4) !== "TABL") fail("لا يحمل كتلة TABL في الترويسة.");

  const tablSize = u32(view, 8);
  if (tablSize === 0 || tablSize % 12 !== 0 || 12 + tablSize > bytes.length) {
    fail("حجم جدول TABL غير صحيح.");
  }

  const tables: GtaIvParsedGxtTable[] = [];
  const names = new Set<string>();
  for (let at = 12; at < 12 + tablSize; at += 12) {
    const name = tableName(bytes, at);
    const offset = u32(view, at + 8);
    if (!name) fail("اسم جدول فارغ في TABL.");
    if (names.has(name)) fail(`اسم جدول مكرر: ${name}.`);
    names.add(name);
    if (offset + 8 > bytes.length) fail(`إزاحة جدول ${name} خارج الملف.`);

    const prefix = marker(bytes, offset);
    const tkeyOffset = prefix === "TKEY" ? offset : offset + 8;
    if (marker(bytes, tkeyOffset) !== "TKEY") fail(`كتلة TKEY مفقودة من الجدول ${name}.`);
    const keyBytes = u32(view, tkeyOffset + 4);
    if (keyBytes % 8 !== 0 || tkeyOffset + 8 + keyBytes + 8 > bytes.length) {
      fail(`حجم TKEY غير صحيح في الجدول ${name}.`);
    }

    const tdatOffset = tkeyOffset + 8 + keyBytes;
    if (marker(bytes, tdatOffset) !== "TDAT") fail(`كتلة TDAT مفقودة من الجدول ${name}.`);
    const textBytes = u32(view, tdatOffset + 4);
    if (textBytes % 2 !== 0 || tdatOffset + 8 + textBytes > bytes.length) {
      fail(`حجم TDAT غير صحيح في الجدول ${name}.`);
    }

    const payloadOffset = tdatOffset + 8;
    const entries: GtaIvGxtEntry[] = [];
    for (let keyAt = tkeyOffset + 8; keyAt < tkeyOffset + 8 + keyBytes; keyAt += 8) {
      const dataOffset = u32(view, keyAt);
      if (dataOffset >= textBytes) fail(`إزاحة نص خارج TDAT في الجدول ${name}.`);
      entries.push({
        dataOffset,
        crc: u32(view, keyAt + 4),
        textUnits: readGxtTextUnits(view, payloadOffset, textBytes, dataOffset, name),
      });
    }
    tables.push({ name, offset, tkeyOffset, tdatOffset, textBytes, entries });
  }

  return { version, charSize, bytes: bytes.length, tables };
}

/** Validates the GXT layout and returns a lightweight structural summary. */
export function inspectGtaIvGxt(buffer: ArrayBuffer): GtaIvGxtSummary {
  const parsed = parseGtaIvGxt(buffer);
  const tables = parsed.tables.map(({ name, offset, textBytes, entries }) => ({
    name,
    offset,
    textBytes,
    entries: entries.length,
  }));
  return {
    version: parsed.version,
    charSize: parsed.charSize,
    tables,
    entries: tables.reduce((total, table) => total + table.entries, 0),
    bytes: parsed.bytes,
  };
}

/** Parses the OXT export while retaining its table/key identities and encoded text units. */
export function parseGtaIvOxt(text: string): GtaIvParsedOxt {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const version = /^Version\s+(\d+)$/i.exec(lines[0]?.trim() || "");
  const charSize = /^CharSize\s+(\d+)$/i.exec(lines[1]?.trim() || "");
  const needDecode = /^NeedDecode\s+(True|False)$/i.exec(lines[2]?.trim() || "");
  const singleFileTable = /^SingleFileTable\s+(True|False)$/i.exec(lines[3]?.trim() || "");
  if (!version || !charSize || !needDecode || !singleFileTable) {
    fail("ترويسة OXT لا تطابق Version / CharSize / NeedDecode / SingleFileTable.");
  }
  if (Number(version[1]) !== 4 || Number(charSize[1]) !== 16) {
    fail("OXT ليس Version 4 / CharSize 16 الخاص بملف GTA IV المدعوم.");
  }

  const tables: GtaIvParsedOxtTable[] = [];
  const tableNames = new Set<string>();
  let current: GtaIvParsedOxtTable | null = null;
  let insideTable = false;

  for (const rawLine of lines.slice(4)) {
    if (rawLine === "") continue;
    if (rawLine === "{") {
      if (!current || insideTable) fail("بداية كتلة OXT في موضع غير متوقع.");
      insideTable = true;
      continue;
    }
    if (rawLine === "}") {
      if (!current || !insideTable) fail("نهاية كتلة OXT في موضع غير متوقع.");
      insideTable = false;
      current = null;
      continue;
    }
    if (insideTable) {
      if (!rawLine.startsWith("\t")) fail("سطر OXT داخل جدول لا يبدأ بعلامة tab.");
      const separator = rawLine.indexOf("=");
      if (separator <= 1) fail("مدخل OXT لا يحتوي مفتاحاً وقيمة.");
      const key = rawLine.slice(1, separator).trim();
      if (!key) fail("مفتاح OXT فارغ.");
      const numeric = hexCrc.exec(key);
      const crc = numeric ? Number.parseInt(numeric[1], 16) >>> 0 : gtaIvHashKey(key);
      const value = rawLine.slice(separator + 1);
      current.entries.push({
        key,
        keyKind: numeric ? "crc" : "named",
        crc,
        value,
        textUnits: unitsFromText(value),
      });
      continue;
    }

    if (rawLine.startsWith("\t") || rawLine.includes("=")) fail("سطر OXT خارج جدول غير صالح.");
    const name = rawLine.trim();
    if (!name) continue;
    if (tableNames.has(name)) fail(`اسم جدول OXT مكرر: ${name}.`);
    tableNames.add(name);
    current = { name, entries: [] };
    tables.push(current);
  }
  if (insideTable || current) fail("كتلة OXT غير مغلقة.");

  return {
    version: Number(version[1]),
    charSize: Number(charSize[1]),
    needDecode: needDecode[1].toLowerCase() === "true",
    singleFileTable: singleFileTable[1].toLowerCase() === "true",
    tables,
  };
}

/** Parses the OXT export header and returns a lightweight structural summary. */
export function inspectGtaIvOxt(text: string): GtaIvOxtSummary {
  const parsed = parseGtaIvOxt(text);
  return {
    version: parsed.version,
    charSize: parsed.charSize,
    needDecode: parsed.needDecode,
    singleFileTable: parsed.singleFileTable,
    tables: parsed.tables.length,
    entries: parsed.tables.reduce((total, table) => total + table.entries.length, 0),
  };
}

/**
 * Resolves each OXT row against the immutable GXT identity `(table, crc)`.
 * A null entry is an explicit missing identity; the caller must never fall back
 * to matching translated text content.
 */
export function reconcileGtaIvOxtWithGxt(gxt: GtaIvParsedGxt, oxt: GtaIvParsedOxt): GtaIvOxtGxtIdentity[] {
  const gxtTables = new Map(gxt.tables.map((table) => [table.name, table]));
  const identities: GtaIvOxtGxtIdentity[] = [];
  for (const oxtTable of oxt.tables) {
    const gxtTable = gxtTables.get(oxtTable.name);
    const entriesByCrc = new Map(gxtTable?.entries.map((entry) => [entry.crc, entry]) ?? []);
    for (const oxtEntry of oxtTable.entries) {
      identities.push({
        table: oxtTable.name,
        key: oxtEntry.key,
        crc: oxtEntry.crc,
        gxtEntry: entriesByCrc.get(oxtEntry.crc) ?? null,
      });
    }
  }
  return identities;
}

/**
 * Rebuilds GXT from its existing tables and pre-encoded replacement units only.
 * No replacements return a byte-identical copy. With replacements, it preserves
 * TABL table names/order, table prefixes, TKEY CRC/order, and all non-replaced
 * text units; only TDAT payload offsets are recalculated. Runtime token checks
 * remain available to editor diagnostics but do not prevent file construction.
 */
export function rebuildGtaIvGxt(source: ArrayBuffer, replacements: readonly GtaIvGxtReplacement[] = []): ArrayBuffer {
  const parsed = parseGtaIvGxt(source);
  const sourceBytes = new Uint8Array(source);
  if (replacements.length === 0) return sourceBytes.slice().buffer;

  const replacementByIdentity = new Map<string, GtaIvGxtReplacement>();
  const sourceEntries = new Map<string, GtaIvGxtEntry>();
  for (const table of parsed.tables) {
    for (const entry of table.entries) sourceEntries.set(identityKey(table.name, entry.crc), entry);
  }
  for (const replacement of replacements) {
    const key = identityKey(replacement.table, replacement.crc);
    if (replacementByIdentity.has(key)) fail(`استبدال مكرر للهوية ${replacement.table}:${replacement.crc}.`);
    const sourceEntry = sourceEntries.get(key);
    if (!sourceEntry) fail(`هوية استبدال غير موجودة: ${replacement.table}:${replacement.crc}.`);
    if (replacement.textUnits.some((unit) => unit === 0)) {
      fail(`النص البديل للهوية ${replacement.table}:${replacement.crc} يحوي NUL داخلياً.`);
    }
    replacementByIdentity.set(key, replacement);
  }

  const headerBytes = 12 + parsed.tables.length * 12;
  let outputBytes = headerBytes;
  for (const table of parsed.tables) {
    const prefixBytes = table.tkeyOffset - table.offset;
    const textBytes = table.entries.reduce((total, entry) => {
      const replacement = replacementByIdentity.get(identityKey(table.name, entry.crc));
      return total + ((replacement?.textUnits.length ?? entry.textUnits.length) + 1) * 2;
    }, 0);
    outputBytes = align4(outputBytes) + prefixBytes + 8 + table.entries.length * 8 + 8 + textBytes;
  }
  const bytes = new Uint8Array(outputBytes);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, parsed.version, true);
  view.setUint16(2, parsed.charSize, true);
  bytes.set([0x54, 0x41, 0x42, 0x4c], 4); // TABL
  view.setUint32(8, parsed.tables.length * 12, true);

  let tableOffset = headerBytes;
  for (let tableIndex = 0; tableIndex < parsed.tables.length; tableIndex += 1) {
    const table = parsed.tables[tableIndex];
    tableOffset = align4(tableOffset);
    const directoryOffset = 12 + tableIndex * 12;
    bytes.set(sourceBytes.subarray(directoryOffset, directoryOffset + 8), directoryOffset);
    view.setUint32(directoryOffset + 8, tableOffset, true);

    const prefixBytes = table.tkeyOffset - table.offset;
    bytes.set(sourceBytes.subarray(table.offset, table.tkeyOffset), tableOffset);
    const tkeyOffset = tableOffset + prefixBytes;
    bytes.set([0x54, 0x4b, 0x45, 0x59], tkeyOffset); // TKEY
    view.setUint32(tkeyOffset + 4, table.entries.length * 8, true);
    const entryOffset = tkeyOffset + 8;
    const tdatOffset = entryOffset + table.entries.length * 8;
    bytes.set([0x54, 0x44, 0x41, 0x54], tdatOffset); // TDAT
    const payloadOffset = tdatOffset + 8;
    let cursor = payloadOffset;

    for (let entryIndex = 0; entryIndex < table.entries.length; entryIndex += 1) {
      const entry = table.entries[entryIndex];
      const replacement = replacementByIdentity.get(identityKey(table.name, entry.crc));
      const textUnits = replacement?.textUnits ?? entry.textUnits;
      view.setUint32(entryOffset + entryIndex * 8, cursor - payloadOffset, true);
      view.setUint32(entryOffset + entryIndex * 8 + 4, entry.crc, true);
      for (const unit of textUnits) {
        view.setUint16(cursor, unit, true);
        cursor += 2;
      }
      view.setUint16(cursor, 0, true);
      cursor += 2;
    }
    view.setUint32(tdatOffset + 4, cursor - payloadOffset, true);
    tableOffset = cursor;
  }
  return bytes.buffer;
}

function extractRuntimeTokens(value: string): { tokens: string[]; error?: string } {
  const tokens: string[] = [];
  let index = 0;
  while (index < value.length) {
    const start = value.indexOf("~", index);
    if (start === -1) break;
    const end = value.indexOf("~", start + 1);
    if (end === -1) return { tokens, error: "رمز ~ منفرد أو غير مغلق." };
    if (end === start + 1) return { tokens, error: "رمز وقت تشغيل فارغ ~~ غير مسموح." };
    tokens.push(value.slice(start, end + 1));
    index = end + 1;
  }
  return { tokens };
}

/**
 * Requires all GTA IV `~...~` runtime/control tokens from the source to remain
 * present in the same order and spelling. Extra `~n~` markers are accepted so
 * the editor's GTA IV line-split tool can add and later remove line separators;
 * no other new runtime token is accepted. A lone tilde is always rejected.
 */
export function validateGtaIvRuntimeTokenSequence(source: string, candidate: string): GtaIvRuntimeTokenValidation {
  const sourceResult = extractRuntimeTokens(source);
  const candidateResult = extractRuntimeTokens(candidate);
  const sourceTokens = sourceResult.tokens;
  const candidateTokens = candidateResult.tokens;

  if (sourceResult.error) return { valid: false, sourceTokens, candidateTokens, reason: `النص الأصلي: ${sourceResult.error}` };
  if (candidateResult.error) return { valid: false, sourceTokens, candidateTokens, reason: `النص المعدل: ${candidateResult.error}` };
  let candidateIndex = 0;
  for (const sourceToken of sourceTokens) {
    const matchedAt = candidateTokens.indexOf(sourceToken, candidateIndex);
    if (matchedAt === -1 || candidateTokens.slice(candidateIndex, matchedAt).some((token) => token !== "~n~")) {
      return { valid: false, sourceTokens, candidateTokens, reason: "ترتيب أو قيمة رمز وقت التشغيل تغيرت." };
    }
    candidateIndex = matchedAt + 1;
  }
  if (candidateTokens.slice(candidateIndex).some((token) => token !== "~n~")) {
    return { valid: false, sourceTokens, candidateTokens, reason: "عدد رموز وقت التشغيل تغير." };
  }
  return { valid: true, sourceTokens, candidateTokens };
}

/**
 * Keeps GTA IV's visible dollar prices exactly equal and ordered as in the
 * English source. They are not engine control tags, so this is an editorial
 * safety rule: it protects price meaning without treating `$` as runtime code.
 */
export function validateGtaIvDollarAmountSequence(source: string, candidate: string): GtaIvDollarAmountValidation {
  const sourceAmounts = source.match(gtaIvDollarAmountPattern) ?? [];
  const candidateAmounts = candidate.match(gtaIvDollarAmountCandidatePattern) ?? [];
  if (sourceAmounts.length !== candidateAmounts.length) {
    return { valid: false, sourceAmounts, candidateAmounts, reason: "عدد مبالغ الدولار تغير." };
  }
  if (sourceAmounts.some((amount, index) => normalizeGtaIvDollarAmount(amount) !== normalizeGtaIvDollarAmount(candidateAmounts[index] ?? ""))) {
    return { valid: false, sourceAmounts, candidateAmounts, reason: "قيمة أو ترتيب مبلغ الدولار تغير." };
  }
  return { valid: true, sourceAmounts, candidateAmounts };
}

/**
 * Restores only changed dollar amount slots. Missing, extra, or malformed
 * amounts are not guessed: the Arabic translation stays untouched for review.
 */
export function repairGtaIvDollarAmountSequence(source: string, candidate: string): GtaIvDollarAmountRepair {
  const validation = validateGtaIvDollarAmountSequence(source, candidate);
  if (!validation.valid) {
    return {
      text: candidate,
      changed: false,
      safe: false,
      reason: validation.reason ?? "تعذّر إصلاح مبلغ الدولار تلقائياً.",
    };
  }

  let amountIndex = 0;
  const repaired = candidate.replace(gtaIvDollarAmountCandidatePattern, () => validation.sourceAmounts[amountIndex++] ?? "");
  const repairedValidation = validateGtaIvDollarAmountSequence(source, repaired);
  if (!repairedValidation.valid) {
    return { text: candidate, changed: false, safe: false, reason: repairedValidation.reason };
  }
  return { text: repaired, changed: repaired !== candidate, safe: true };
}

function normalizeGtaIvDollarAmount(value: string): string {
  const normalized = normalizeGtaIvArabicPunctuation(value).trim().toLowerCase();
  const arabicMillions = normalized.match(/^(\d+)\s+(?:مليون|ملايين)\s+دولار$/);
  const unseparated = arabicMillions ? `${arabicMillions[1]}m` : normalized
    .replace(/دولار/g, "")
    .replace(/[\s$]/g, "");
  // Translation services often localize the decimal separator: `$99.95` can
  // arrive as `99,95 دولار`. A comma followed by one or two digits is a clear
  // decimal spelling here; comma groups of exactly three remain thousands.
  const decimalComma = unseparated.match(/^(\d+(?:,\d{3})*),(\d{1,2})([kmb])?$/i);
  const compact = (decimalComma
    ? `${decimalComma[1].replace(/,/g, "")}.${decimalComma[2]}${decimalComma[3] ?? ""}`
    : unseparated.replace(/,/g, ""))
    .toLowerCase();
  const parts = compact.match(/^(\d+)(?:\.(\d+))?([kmb])?$/);
  if (!parts) return compact;

  const [, integerPart, fractionalPart = "", suffix = ""] = parts;
  const scale = suffix === "k" ? 3 : suffix === "m" ? 6 : suffix === "b" ? 9 : 0;
  const digits = `${integerPart}${fractionalPart}`.replace(/^0+(?=\d)/, "") || "0";
  if (digits === "0") return "0";

  const decimalPlaces = fractionalPart.length - scale;
  if (decimalPlaces <= 0) return `${digits}${"0".repeat(-decimalPlaces)}`;

  const splitAt = digits.length - decimalPlaces;
  const decimal = splitAt > 0
    ? `${digits.slice(0, splitAt)}.${digits.slice(splitAt)}`
    : `0.${"0".repeat(-splitAt)}${digits}`;
  return decimal.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/**
 * Restores only changed GTA IV `~...~` runtime tokens in place. This is safe
 * solely when both strings contain the same number of complete token slots;
 * missing, extra, or malformed tokens are reported but never guessed.
 */
export function repairGtaIvRuntimeTokenSequence(source: string, candidate: string): GtaIvRuntimeTokenRepair {
  const validation = validateGtaIvRuntimeTokenSequence(source, candidate);
  if (validation.valid) return { text: candidate, changed: false, safe: true };

  const sourceResult = extractRuntimeTokens(source);
  const candidateResult = extractRuntimeTokens(candidate);
  if (sourceResult.error || candidateResult.error || sourceResult.tokens.length !== candidateResult.tokens.length) {
    return {
      text: candidate,
      changed: false,
      safe: false,
      reason: validation.reason ?? "تعذّر إصلاح رموز وقت التشغيل تلقائياً.",
    };
  }

  let tokenIndex = 0;
  const repaired = candidate.replace(/~[^~\r\n]+~/g, () => sourceResult.tokens[tokenIndex++] ?? "");
  const repairedValidation = validateGtaIvRuntimeTokenSequence(source, repaired);
  if (!repairedValidation.valid) {
    return { text: candidate, changed: false, safe: false, reason: repairedValidation.reason };
  }
  return { text: repaired, changed: repaired !== candidate, safe: true };
}
