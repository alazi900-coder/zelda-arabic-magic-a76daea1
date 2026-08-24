/**
 * GTA IV GXT/OXT reader.
 *
 * Scope: inspect and reconcile text identities, then perform a verified binary
 * GXT rebuild from pre-encoded units only. It never reads or emits font resources.
 * Arabic glyph encoding remains intentionally outside the editor until a
 * trustworthy glyph map exists.
 */

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

const ascii = new TextDecoder("ascii");
const hexCrc = /^0x([0-9a-f]{8})$/i;

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
 * text units; only TDAT payload offsets are recalculated. Runtime tokens must
 * remain exactly equal and ordered as in the original entry.
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
    const tokenValidation = validateGtaIvRuntimeTokenSequence(textFromUnits(sourceEntry.textUnits), textFromUnits(replacement.textUnits));
    if (!tokenValidation.valid) {
      fail(`رموز وقت التشغيل غير محفوظة للهوية ${replacement.table}:${replacement.crc}: ${tokenValidation.reason}`);
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
 * Requires all GTA IV `~...~` runtime/control tokens to remain present in the
 * same order and spelling. A lone tilde is rejected because it can destabilize
 * GTA IV text handling.
 */
export function validateGtaIvRuntimeTokenSequence(source: string, candidate: string): GtaIvRuntimeTokenValidation {
  const sourceResult = extractRuntimeTokens(source);
  const candidateResult = extractRuntimeTokens(candidate);
  const sourceTokens = sourceResult.tokens;
  const candidateTokens = candidateResult.tokens;

  if (sourceResult.error) return { valid: false, sourceTokens, candidateTokens, reason: `النص الأصلي: ${sourceResult.error}` };
  if (candidateResult.error) return { valid: false, sourceTokens, candidateTokens, reason: `النص المعدل: ${candidateResult.error}` };
  if (sourceTokens.length !== candidateTokens.length) {
    return { valid: false, sourceTokens, candidateTokens, reason: "عدد رموز وقت التشغيل تغير." };
  }
  if (sourceTokens.some((token, index) => token !== candidateTokens[index])) {
    return { valid: false, sourceTokens, candidateTokens, reason: "ترتيب أو قيمة رمز وقت التشغيل تغيرت." };
  }
  return { valid: true, sourceTokens, candidateTokens };
}
