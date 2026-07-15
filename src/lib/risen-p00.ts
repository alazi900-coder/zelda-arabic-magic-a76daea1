/**
 * Risen `strings.p00` (Genome Engine) — full-fidelity parser/writer.
 * Covers both Risen 1 (uncompressed TAB0) and Risen 2 (each table individually
 * zlib-compressed, TAB1) — same outer G3V0 container and FileInfoHdr shape.
 *
 * Verified byte-for-byte against a real 19MB Risen 1 strings.p00 file: parse →
 * rebuild with no translations applied reproduces the original file exactly.
 * Verified against a real Risen 2 strings.p00 (16 zlib-compressed TAB1 tables,
 * confirmed via FileInfoHdr offset/size1/size2 matching actual inflate output).
 *
 * Container layout (offsets relative to file start) — identical for both games:
 *   0x00  uint32  headerVersion
 *   0x04  char[4] magic = "G3V0"
 *   0x08  int64   headerUnk1
 *   0x10  int64   headerUnk2
 *   0x18  int64   dataAddress        (= 0x30, start of first table)
 *   0x20  int64   offsetToFileInfo   (relative to 0x20 — add 0x20 to get absolute offset)
 *   0x28  int64   totalFileSize
 *   0x30  ...     tables, back-to-back (raw for Risen 1, zlib-compressed per-table for Risen 2)
 *   ...   32 bytes reserved trailer (unknown meaning, copied verbatim)
 *   ...   FileInfoHdr (see RisenFileInfoEntryRaw)
 *
 * TAB0/TAB1 table (TAB1 lives inside a zlib stream, otherwise identical layout):
 *   magic "TAB0"|"TAB1" (4) + version (u16,u16) + timestamp (i64) + field_count (u32)
 *   then field_count × { flag:u8, unk:u16, name_len:u16, name:UTF-16LE, row_count:u32,
 *                         rows: row_count × { str_len:u16, str_data:UTF-16LE } }
 *
 * FileInfoHdr entry (one per table, in table order):
 *   marker1:u16=32, marker2:u16=2, name_len:u32, name:ASCII (length-prefixed, no NUL),
 *   pad:u8=0, offset:i64 (recomputed on build), timestamp1/2/3:i64 (copied verbatim),
 *   marker2_field:u32=131104, zero1:u32=0, zero2:u32=0,
 *   size1:u32 (compressed size for Risen 2, else = size2), size2:u32 (uncompressed size)
 *   — both recomputed on build.
 *
 * Risen 1 tables are located by scanning for the raw "TAB0" signature (see
 * findTab0Offsets). Risen 2 tables are NOT found this way (the signature only
 * exists inside compressed streams) — instead each is located via FileInfoHdr's
 * offset/size1, sliced, and inflated (see parseFileInfoHdr + the `compressed`
 * fallback branch in parseRisenP00Full).
 */
import { inflate, deflate } from "pako";

// ============================================================================
// الأنواع
// ============================================================================

export interface RisenFieldRaw {
  flag: number; // uint8 — شوهد دائمًا 1
  unk: number; // uint16 — شوهد دائمًا 1
  name: string;
  values: string[]; // بترتيب الصفوف — هذه هي القيم القابلة للتعديل عند الترجمة
}

export interface RisenTableRaw {
  /** الاسم الحقيقي من FileInfoHdr (quests.tab / infos.tab / documents.tab)، أو table_${i}.tab احتياطيًا */
  name: string;
  originalOffset: number; // للمعلومة فقط
  /** "TAB0" (Risen 1، غير مضغوط) أو "TAB1" (Risen 2، كل جدول مضغوط zlib على حدة) */
  magic: string;
  versionMajor: number;
  versionMinor: number;
  timestampRaw: bigint; // 8 بايت، معناها الدقيق غير محسوم (FILETIME على الأرجح) — تُنسخ كما هي
  fields: RisenFieldRaw[];
  /** هل هذا الجدول تحديداً مضغوط zlib على القرص؟ بعض ملفات Risen 2 تخلط جداول
   * مضغوطة وأخرى خام في نفس الأرشيف (مؤكَّد على ملف strings.pak حقيقي) — لذا
   * هذا علم لكل جدول على حدة، وليس قراراً واحداً للملف كله. */
  compressed: boolean;
}

export interface RisenFileInfoEntryRaw {
  name: string;
  pad: number;
  timestamps: [bigint, bigint, bigint]; // 3× 8 بايت — تُنسخ كما هي
  marker2: number;
  zero1: number;
  zero2: number;
  // ملاحظة: لا نخزّن size1/size2 هنا لأنها تُعاد حسابها تلقائيًا عند البناء
}

export interface RisenP00Document {
  headerVersion: number;
  headerUnk1: bigint;
  headerUnk2: bigint;
  dataAddress: number; // = 0x30 دائمًا
  tables: RisenTableRaw[];
  fileInfoEntries: RisenFileInfoEntryRaw[];
  /** 32 بايت غير محسومة المعنى بالكامل بين نهاية البيانات وبداية FileInfoHdr — تُنسخ حرفيًا */
  reservedTrailer: Uint8Array;
  /** هل حُدِّدت الجداول عبر FileInfoHdr (أسلوب Risen 2) بدل المسح الخام عن TAB0
   * (أسلوب Risen 1)؟ الضغط الفعلي لكل جدول قد يختلف — انظر `RisenTableRaw.compressed`. */
  compressed: boolean;
}

export interface TranslatableEntry {
  table: string;
  field: string;
  rowIndex: number;
  rowId: string;
  original: string;
}

/** المفتاح المعتمد لخرائط الترجمة: `${table}::${field}::${rowIndex}` */
export function makeKey(table: string, field: string, rowIndex: number): string {
  return `${table}::${field}::${rowIndex}`;
}

// ============================================================================
// إعدادات التصنيف
// ============================================================================

const TEXT_FIELD_REGEX = /^(German|English|French|Italian|Spanish|Polish|Russian)_[Tt]ext$/;
const STAGEDIR_FIELD_REGEX = /^(German|English|French|Italian|Spanish|Polish|Russian)_StageDir$/;

export function isTranslatableField(fieldName: string): boolean {
  return TEXT_FIELD_REGEX.test(fieldName) || STAGEDIR_FIELD_REGEX.test(fieldName);
}

// ============================================================================
// أدوات UTF-16LE
// ============================================================================

const UTF16_DECODER = new TextDecoder("utf-16le");

function readUtf16LE(bytes: Uint8Array, byteOffset: number, charLen: number): string {
  return UTF16_DECODER.decode(bytes.subarray(byteOffset, byteOffset + charLen * 2));
}

function writeUtf16LE(view: DataView, byteOffset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint16(byteOffset + i * 2, text.charCodeAt(i), true);
  }
}

function utf16ByteLength(text: string): number {
  return text.length * 2; // JS string.length = عدد UTF-16 code units تمامًا
}

// ============================================================================
// البحث عن TAB0 (مع رفض التوقيعات المصادفة)
// ============================================================================

const MIN_PLAUSIBLE_FIELD_COUNT = 1;
const MAX_PLAUSIBLE_FIELD_COUNT = 50;

function isPrintableFieldName(name: string): boolean {
  if (name.length === 0 || name.length > 100) return false;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) return false;
  }
  return true;
}

/**
 * يرفض توقيع "TAB0" الذي يظهر بالصدفة داخل بيانات نصية (UTF-16) بدل أن يكون
 * رأس جدول حقيقي — بدون رمي استثناء. يتحقق من أن field_count معقول وأن اسم
 * أول حقل مباشرة بعد الرأس نص مطبوع سليم.
 */
function isValidTab0Candidate(bytes: Uint8Array, view: DataView, offset: number): boolean {
  try {
    let p = offset + 4; // تخطي توقيع "TAB0"
    if (p + 4 + 8 + 4 > view.byteLength) return false;
    p += 4; // version (u16, u16)
    p += 8; // timestamp (i64)
    const fieldCount = view.getUint32(p, true); p += 4;
    if (fieldCount < MIN_PLAUSIBLE_FIELD_COUNT || fieldCount > MAX_PLAUSIBLE_FIELD_COUNT) {
      return false;
    }

    if (p + 1 + 2 + 2 > view.byteLength) return false;
    p += 1; // flag
    p += 2; // unk
    const nameLen = view.getUint16(p, true); p += 2;
    if (nameLen === 0 || nameLen > 100) return false;
    if (p + nameLen * 2 > view.byteLength) return false;
    const name = readUtf16LE(bytes, p, nameLen);
    return isPrintableFieldName(name);
  } catch {
    return false;
  }
}

function findTab0Offsets(bytes: Uint8Array, view: DataView, before: number): number[] {
  const magic = [0x54, 0x41, 0x42, 0x30];
  const offsets: number[] = [];
  for (let i = 0; i <= bytes.length - 4 && i < before; i++) {
    if (bytes[i] === magic[0] && bytes[i + 1] === magic[1] && bytes[i + 2] === magic[2] && bytes[i + 3] === magic[3]) {
      if (isValidTab0Candidate(bytes, view, i)) {
        offsets.push(i);
      } else {
        console.warn(`Risen p00: rejected false-positive TAB0 signature match at offset ${i}`);
      }
    }
  }
  return offsets;
}

// ============================================================================
// PARSE — تحليل الملف الأصلي بدقة كاملة
// ============================================================================

/** Parses one TAB0/TAB1 table's body (magic through the last field's rows) starting
 * at `start` within `bytes`/`view`. Used both for a raw in-place table (Risen 1) and
 * for an already-inflated standalone buffer (Risen 2, `start` = 0). */
function parseTableAt(bytes: Uint8Array, view: DataView, start: number): {
  magic: string; versionMajor: number; versionMinor: number; timestampRaw: bigint; fields: RisenFieldRaw[];
} {
  let p = start;
  const magic = new TextDecoder("ascii").decode(bytes.subarray(p, p + 4)); p += 4;
  const versionMajor = view.getUint16(p, true); p += 2;
  const versionMinor = view.getUint16(p, true); p += 2;
  const timestampRaw = view.getBigInt64(p, true); p += 8;
  const fieldCount = view.getUint32(p, true); p += 4;

  const fields: RisenFieldRaw[] = [];
  for (let f = 0; f < fieldCount; f++) {
    const flag = bytes[p]; p += 1;
    const unk = view.getUint16(p, true); p += 2;
    const nameLen = view.getUint16(p, true); p += 2;
    const name = readUtf16LE(bytes, p, nameLen); p += nameLen * 2;
    const rowCount = view.getUint32(p, true); p += 4;
    const values: string[] = new Array(rowCount);
    for (let r = 0; r < rowCount; r++) {
      const strLen = view.getUint16(p, true); p += 2;
      values[r] = readUtf16LE(bytes, p, strLen); p += strLen * 2;
    }
    fields.push({ flag, unk, name, values });
  }

  return { magic, versionMajor, versionMinor, timestampRaw, fields };
}

interface FileInfoEntryFull extends RisenFileInfoEntryRaw {
  offset: number;
  size1: number;
  size2: number;
}

/** Parses FileInfoHdr, including offset/size1/size2 (needed to locate Risen 2's
 * zlib-compressed table blocks — Risen 1's own build path recomputes these instead
 * of trusting them, so keeping them here is harmless additional information). */
function parseFileInfoHdr(bytes: Uint8Array, view: DataView, fileInfoOffset: number): FileInfoEntryFull[] {
  let p = fileInfoOffset;
  const entryCount = view.getUint32(p, true); p += 4;
  const entries: FileInfoEntryFull[] = [];
  for (let i = 0; i < entryCount; i++) {
    p += 4; // marker (u16,u16) — دائمًا (32,2)
    const namelen = view.getUint32(p, true); p += 4;
    const name = new TextDecoder("ascii").decode(bytes.subarray(p, p + namelen)); p += namelen;
    const pad = bytes[p]; p += 1;
    const offset = Number(view.getBigInt64(p, true)); p += 8;
    const timestamps: [bigint, bigint, bigint] = [
      view.getBigInt64(p, true),
      view.getBigInt64(p + 8, true),
      view.getBigInt64(p + 16, true),
    ];
    p += 24;
    const marker2 = view.getUint32(p, true); p += 4;
    const zero1 = view.getUint32(p, true); p += 4;
    const zero2 = view.getUint32(p, true); p += 4;
    const size1 = view.getUint32(p, true); p += 4;
    const size2 = view.getUint32(p, true); p += 4;
    entries.push({ name, pad, timestamps, marker2, zero1, zero2, offset, size1, size2 });
  }
  return entries;
}

export function parseRisenP00Full(buffer: ArrayBuffer): RisenP00Document {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // --- رأس الحاوية الرئيسي (48 بايت) ---
  const containerMagic = new TextDecoder("ascii").decode(bytes.subarray(4, 8));
  if (containerMagic !== "G3V0") throw new Error(`توقيع غير متوقع: "${containerMagic}"`);

  const headerVersion = view.getUint32(0, true);
  const headerUnk1 = view.getBigInt64(0x08, true);
  const headerUnk2 = view.getBigInt64(0x10, true);
  const dataAddress = Number(view.getBigInt64(0x18, true));
  const offsetToFileInfo = Number(view.getBigInt64(0x20, true));
  const fileInfoOffset = 0x20 + offsetToFileInfo;

  // --- إيجاد الجداول عبر توقيع TAB0 الخام (Risen 1 — غير مضغوط) ---
  const tab0Offsets = findTab0Offsets(bytes, view, fileInfoOffset);

  let tables: RisenTableRaw[];
  let fileInfoEntries: RisenFileInfoEntryRaw[];
  let lastTableEnd: number;
  let compressed: boolean;

  if (tab0Offsets.length > 0) {
    // --- Risen 1: كل جدول TAB0 خام متتالٍ، دون ضغط ---
    compressed = false;
    tables = tab0Offsets.map((tableStart, i) => {
      const parsed = parseTableAt(bytes, view, tableStart);
      return { name: `table_${i}.tab`, originalOffset: tableStart, compressed: false, ...parsed };
    });
    lastTableEnd = computeTableEndOffsets(tables, tab0Offsets)[tables.length - 1];

    const fullEntries = parseFileInfoHdr(bytes, view, fileInfoOffset);
    fileInfoEntries = fullEntries.map(({ name, pad, timestamps, marker2, zero1, zero2 }) => ({ name, pad, timestamps, marker2, zero1, zero2 }));

    // --- أسماء الجداول الحقيقية تأتي من FileInfoHdr (بنفس ترتيب الجداول)، لا من التخمين بالموضع ---
    tables.forEach((table, i) => {
      const realName = fullEntries[i]?.name;
      if (realName) table.name = realName;
    });
  } else {
    // --- Risen 2: لا يوجد توقيع TAB0 خام — كل جدول يُحدَّد موضعه وحجمه من
    // FileInfoHdr مباشرة (بدل المسح الخام). بعض الملفات (مؤكَّد على strings.pak
    // حقيقي) تخلط جداول مضغوطة zlib وأخرى خام في نفس الأرشيف — المؤشر الموثوق:
    // size1 === size2 يعني خام (لا داعٍ لفك الضغط)، غير ذلك مضغوط ---
    const fullEntries = parseFileInfoHdr(bytes, view, fileInfoOffset);
    if (fullEntries.length === 0) {
      throw new Error("لم يتم العثور على أي جدول TAB0/TAB1 — هل هذا فعلاً ملف Risen strings.p00؟");
    }
    compressed = true;
    tables = fullEntries.map((entry) => {
      const tableIsCompressed = entry.size1 !== entry.size2;
      const rawBytes = bytes.subarray(entry.offset, entry.offset + entry.size1);
      let decompressed: Uint8Array;
      if (tableIsCompressed) {
        try {
          decompressed = inflate(rawBytes);
        } catch (err) {
          throw new Error(`تعذّر فك ضغط جدول "${entry.name}": ${(err as Error).message}`);
        }
      } else {
        decompressed = rawBytes;
      }
      const dView = new DataView(decompressed.buffer, decompressed.byteOffset, decompressed.byteLength);
      const tableMagic = new TextDecoder("ascii").decode(decompressed.subarray(0, 4));
      if (tableMagic !== "TAB0" && tableMagic !== "TAB1") {
        throw new Error(`صيغة جدول غير معروفة "${tableMagic}" في "${entry.name}"`);
      }
      const parsed = parseTableAt(decompressed, dView, 0);
      return { name: entry.name, originalOffset: entry.offset, compressed: tableIsCompressed, ...parsed };
    });
    lastTableEnd = fullEntries[fullEntries.length - 1].offset + fullEntries[fullEntries.length - 1].size1;
    fileInfoEntries = fullEntries.map(({ name, pad, timestamps, marker2, zero1, zero2 }) => ({ name, pad, timestamps, marker2, zero1, zero2 }));
  }

  // --- الـ 32 بايت المتبقية بين نهاية البيانات وبداية FileInfoHdr ---
  const reservedTrailer = bytes.slice(lastTableEnd, fileInfoOffset);

  return {
    headerVersion,
    headerUnk1,
    headerUnk2,
    dataAddress,
    tables,
    fileInfoEntries,
    reservedTrailer,
    compressed,
  };
}

function computeTableEndOffsets(tables: RisenTableRaw[], tab0Offsets: number[]): number[] {
  // نحسب حجم كل جدول بجمع كل بايتاته (رأس + كل الحقول)
  const ends: number[] = [];
  tables.forEach((table, i) => {
    let size = 4 + 2 + 2 + 8 + 4; // TAB0 + ver + ts + fieldcount
    for (const field of table.fields) {
      size += 1 + 2 + 2 + utf16ByteLength(field.name) + 4; // flag+unk+namelen+name+rowcount
      for (const v of field.values) {
        size += 2 + utf16ByteLength(v); // strlen + content
      }
    }
    ends.push(tab0Offsets[i] + size);
  });
  return ends;
}

// ============================================================================
// استخراج النصوص القابلة للترجمة (كل حقل/صف بشكل مستقل)
// ============================================================================

export function extractTranslatableEntries(doc: RisenP00Document): TranslatableEntry[] {
  const entries: TranslatableEntry[] = [];
  for (const table of doc.tables) {
    const idField = table.fields.find((f) => f.name === "ID");
    for (const field of table.fields) {
      if (!isTranslatableField(field.name)) continue;
      field.values.forEach((text, rowIndex) => {
        if (!text) return;
        entries.push({
          table: table.name,
          field: field.name,
          rowIndex,
          rowId: idField?.values[rowIndex] ?? String(rowIndex),
          original: text,
        });
      });
    }
  }
  return entries;
}

/** يطبّق قاموس ترجمات على المستند مباشرة (in-memory) قبل البناء النهائي */
export function applyTranslations(
  doc: RisenP00Document,
  translations: Map<string, string> // المفتاح: makeKey(table, field, rowIndex)
): void {
  for (const table of doc.tables) {
    for (const field of table.fields) {
      if (!isTranslatableField(field.name)) continue;
      for (let r = 0; r < field.values.length; r++) {
        const key = makeKey(table.name, field.name, r);
        const translated = translations.get(key);
        if (translated !== undefined) {
          field.values[r] = translated;
        }
      }
    }
  }
}

// ============================================================================
// BUILD — إعادة بناء الملف بالكامل من مستند (بعد الترجمة أو بدونها)
// ============================================================================

/** Serializes one table's body (magic through the last field's rows) to raw
 * (uncompressed) bytes — the pre-compression form for Risen 2, and the exact
 * on-disk form for Risen 1. */
function serializeTable(table: RisenTableRaw): Uint8Array {
  let size = 4 + 2 + 2 + 8 + 4;
  for (const field of table.fields) {
    size += 1 + 2 + 2 + utf16ByteLength(field.name) + 4;
    for (const v of field.values) size += 2 + utf16ByteLength(v);
  }

  const buf = new Uint8Array(size);
  const view = new DataView(buf.buffer);
  let p = 0;
  buf.set(new TextEncoder().encode(table.magic), p); p += 4;
  view.setUint16(p, table.versionMajor, true); p += 2;
  view.setUint16(p, table.versionMinor, true); p += 2;
  view.setBigInt64(p, table.timestampRaw, true); p += 8;
  view.setUint32(p, table.fields.length, true); p += 4;

  for (const field of table.fields) {
    buf[p] = field.flag; p += 1;
    view.setUint16(p, field.unk, true); p += 2;
    view.setUint16(p, field.name.length, true); p += 2;
    writeUtf16LE(view, p, field.name); p += utf16ByteLength(field.name);
    view.setUint32(p, field.values.length, true); p += 4;
    for (const v of field.values) {
      view.setUint16(p, v.length, true); p += 2;
      writeUtf16LE(view, p, v); p += utf16ByteLength(v);
    }
  }

  return buf;
}

export function buildRisenP00(doc: RisenP00Document): ArrayBuffer {
  // 1) نسلسل كل جدول أولاً — خام دائماً؛ نضغطه بعدها فقط إن كان الجدول نفسه
  // مضغوطاً أصلاً (كل جدول له علمه الخاص — بعض ملفات Risen 2 تخلط مضغوطاً وخاماً)
  const rawTableBytes = doc.tables.map(serializeTable);
  const writtenTableBytes = rawTableBytes.map((raw, i) => (doc.tables[i].compressed ? deflate(raw) : raw));
  // size2 = الحجم الحقيقي دائماً؛ size1 = الحجم المكتوب فعلياً (مضغوط أو لا)
  const uncompressedSizes = rawTableBytes.map((b) => b.length);
  const writtenSizes = writtenTableBytes.map((b) => b.length);

  const HEADER_SIZE = 48;
  const tableOffsets: number[] = [];
  let cursor = HEADER_SIZE;
  for (const size of writtenSizes) {
    tableOffsets.push(cursor);
    cursor += size;
  }
  const dataEnd = cursor; // نهاية آخر جدول
  const fileInfoOffset = dataEnd + doc.reservedTrailer.length;

  // 2) حساب حجم قسم FileInfo الكامل
  let fileInfoSize = 4; // count
  const entrySizes = doc.fileInfoEntries.map((e) => 4 + 4 + e.name.length + 1 + 8 + 24 + 4 + 4 + 4 + 4 + 4);
  fileInfoSize += entrySizes.reduce((a, b) => a + b, 0);

  const totalFileSize = fileInfoOffset + fileInfoSize;

  // 3) تخصيص المخزن النهائي
  const outBuffer = new ArrayBuffer(totalFileSize);
  const outBytes = new Uint8Array(outBuffer);
  const outView = new DataView(outBuffer);

  // --- الرأس الرئيسي ---
  outView.setUint32(0, doc.headerVersion, true);
  outBytes.set(new TextEncoder().encode("G3V0"), 4);
  outView.setBigInt64(0x08, doc.headerUnk1, true);
  outView.setBigInt64(0x10, doc.headerUnk2, true);
  outView.setBigInt64(0x18, BigInt(doc.dataAddress), true); // = 0x30
  outView.setBigInt64(0x20, BigInt(fileInfoOffset - 0x20), true);
  outView.setBigInt64(0x28, BigInt(totalFileSize), true);

  // --- الجداول ---
  writtenTableBytes.forEach((tableBytes, i) => {
    outBytes.set(tableBytes, tableOffsets[i]);
  });

  // --- الـ trailer المحجوز (32 بايت) — نسخ حرفي ---
  outBytes.set(doc.reservedTrailer, dataEnd);

  // --- FileInfoHdr ---
  let p = fileInfoOffset;
  outView.setUint32(p, doc.fileInfoEntries.length, true); p += 4;

  doc.fileInfoEntries.forEach((entry, i) => {
    outView.setUint16(p, 32, true); p += 2; // marker ثابت
    outView.setUint16(p, 2, true); p += 2; // marker ثابت
    outView.setUint32(p, entry.name.length, true); p += 4;
    outBytes.set(new TextEncoder().encode(entry.name), p); p += entry.name.length;
    outBytes[p] = entry.pad; p += 1;
    outView.setBigInt64(p, BigInt(tableOffsets[i]), true); p += 8; // offset مُعاد حسابه
    for (const ts of entry.timestamps) { outView.setBigInt64(p, ts, true); p += 8; }
    outView.setUint32(p, entry.marker2, true); p += 4;
    outView.setUint32(p, entry.zero1, true); p += 4;
    outView.setUint32(p, entry.zero2, true); p += 4;
    outView.setUint32(p, writtenSizes[i], true); p += 4; // size1 مُعاد حسابه
    outView.setUint32(p, uncompressedSizes[i], true); p += 4; // size2 مُعاد حسابه
  });

  return outBuffer;
}
