/**
 * Risen 3 `localization.p00` — outer container parser/writer.
 *
 * Reuses the *exact same* G3V0 container shape as Risen 1/2 (see risen-p00.ts
 * for the full field-by-field layout) but with exactly one FileInfoHdr entry
 * — real name seen: `w_strings.bin` — whose payload is a single zlib stream.
 * Decompressing that stream yields a `GAR5`/`STB` archive (see risen3-gar5.ts)
 * instead of Risen 1/2's TAB0/TAB1 tables — a structurally different format,
 * which is why this needs its own outer parser rather than reusing
 * risen-p00.ts's (which expects TAB0/TAB1 after inflate and will reject GAR5).
 *
 * Verified against a real 6.3MB localization.p00: container header fields
 * (dataAddress=0x30, totalFileSize) match the file exactly, and the single
 * FileInfoHdr entry's offset/size1/size2 correctly locate and inflate the
 * GAR5 blob.
 */
import { inflate, deflate } from "pako";
import { parseRisenGar5, buildRisenGar5, type RisenGar3Document } from "./risen3-gar5";

export interface RisenP00Gar5Document {
  headerVersion: number;
  headerUnk1: bigint;
  headerUnk2: bigint;
  dataAddress: number; // = 0x30 دائماً
  /** اسم الجدول الحقيقي من FileInfoHdr — شوهد دائماً "w_strings.bin" */
  entryName: string;
  entryPad: number;
  entryTimestamps: [bigint, bigint, bigint];
  entryMarker1: [number, number]; // القيمة الحقيقية (لا تُفترض 32,2 كما في Risen 1/2) — تُنسخ حرفياً
  entryMarker2: number;
  entryZero1: number;
  entryZero2: number;
  gar5: RisenGar3Document;
}

function u16(view: DataView, o: number) { return view.getUint16(o, true); }
function u32(view: DataView, o: number) { return view.getUint32(o, true); }
function i64(view: DataView, o: number) { return view.getBigInt64(o, true); }
function ascii(bytes: Uint8Array, o: number, len: number) { return new TextDecoder("ascii").decode(bytes.subarray(o, o + len)); }

export function parseRisenP00Gar5(buffer: ArrayBuffer): RisenP00Gar5Document {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const magic = ascii(bytes, 4, 4);
  if (magic !== "G3V0") throw new Error(`توقيع غير متوقع: "${magic}"`);

  const headerVersion = u32(view, 0);
  const headerUnk1 = i64(view, 0x08);
  const headerUnk2 = i64(view, 0x10);
  const dataAddress = Number(i64(view, 0x18));
  const fileInfoOffset = 0x20 + Number(i64(view, 0x20));

  let p = fileInfoOffset;
  const entryCount = u32(view, p); p += 4;
  if (entryCount !== 1) {
    throw new Error(`متوقع مُدخل واحد فقط (w_strings.bin) في FileInfoHdr، وُجد ${entryCount} — قد تكون هذه صيغة غير مدعومة`);
  }

  const marker1a = u16(view, p); p += 2;
  const marker1b = u16(view, p); p += 2;
  const nameLen = u32(view, p); p += 4;
  const entryName = ascii(bytes, p, nameLen); p += nameLen;
  const entryPad = bytes[p]; p += 1;
  const entryOffset = Number(i64(view, p)); p += 8;
  const entryTimestamps: [bigint, bigint, bigint] = [i64(view, p), i64(view, p + 8), i64(view, p + 16)]; p += 24;
  const entryMarker2 = u32(view, p); p += 4;
  const entryZero1 = u32(view, p); p += 4;
  const entryZero2 = u32(view, p); p += 4;
  const size1 = u32(view, p); p += 4; // compressed size
  const size2 = u32(view, p); p += 4; // uncompressed size

  const compressed = bytes.subarray(entryOffset, entryOffset + size1);
  let inflated: Uint8Array;
  try {
    inflated = inflate(compressed);
  } catch (err) {
    throw new Error(`تعذّر فك ضغط "${entryName}": ${(err as Error).message}`);
  }
  if (inflated.length !== size2) {
    throw new Error(`حجم غير متطابق بعد فك الضغط: ${inflated.length} (متوقع ${size2})`);
  }

  const inflatedCopy = new Uint8Array(inflated); // guarantees a plain, non-shared ArrayBuffer-backed view
  const gar5 = parseRisenGar5(inflatedCopy.buffer as ArrayBuffer);

  return {
    headerVersion, headerUnk1, headerUnk2, dataAddress,
    entryName, entryPad, entryTimestamps,
    entryMarker1: [marker1a, marker1b],
    entryMarker2, entryZero1, entryZero2,
    gar5,
  };
}

export function buildRisenP00Gar5(doc: RisenP00Gar5Document): ArrayBuffer {
  const inner = buildRisenGar5(doc.gar5);
  const compressed = deflate(new Uint8Array(inner));

  const HEADER_SIZE = 48;
  const dataEnd = HEADER_SIZE + compressed.length;
  // Risen 1/2's container always has a fixed 32-byte reserved trailer between
  // the data and FileInfoHdr — kept here for consistency even though its
  // meaning is unconfirmed for Risen 3 (real sample showed the same 32-byte gap).
  const RESERVED_TRAILER = 32;
  const fileInfoOffset = dataEnd + RESERVED_TRAILER;

  const entrySize = 4 + 4 + doc.entryName.length + 1 + 8 + 24 + 4 + 4 + 4 + 4 + 4;
  const fileInfoSize = 4 + entrySize;
  const totalFileSize = fileInfoOffset + fileInfoSize;

  const out = new Uint8Array(totalFileSize);
  const view = new DataView(out.buffer);

  view.setUint32(0, doc.headerVersion, true);
  out.set(new TextEncoder().encode("G3V0"), 4);
  view.setBigInt64(0x08, doc.headerUnk1, true);
  view.setBigInt64(0x10, doc.headerUnk2, true);
  view.setBigInt64(0x18, BigInt(doc.dataAddress), true);
  view.setBigInt64(0x20, BigInt(fileInfoOffset - 0x20), true);
  view.setBigInt64(0x28, BigInt(totalFileSize), true);

  out.set(compressed, HEADER_SIZE);
  // reserved trailer left as zeros (matches original — verified all-zero in the real sample)

  let p = fileInfoOffset;
  view.setUint32(p, 1, true); p += 4; // entry count
  view.setUint16(p, doc.entryMarker1[0], true); p += 2;
  view.setUint16(p, doc.entryMarker1[1], true); p += 2;
  view.setUint32(p, doc.entryName.length, true); p += 4;
  out.set(new TextEncoder().encode(doc.entryName), p); p += doc.entryName.length;
  out[p] = doc.entryPad; p += 1;
  view.setBigInt64(p, BigInt(HEADER_SIZE), true); p += 8; // offset — recomputed
  for (const ts of doc.entryTimestamps) { view.setBigInt64(p, ts, true); p += 8; }
  view.setUint32(p, doc.entryMarker2, true); p += 4;
  view.setUint32(p, doc.entryZero1, true); p += 4;
  view.setUint32(p, doc.entryZero2, true); p += 4;
  view.setUint32(p, compressed.length, true); p += 4; // size1 — recomputed
  view.setUint32(p, inner.byteLength, true); p += 4; // size2 — recomputed

  return out.buffer;
}
