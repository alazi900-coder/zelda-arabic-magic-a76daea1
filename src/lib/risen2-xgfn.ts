/**
 * Risen 2 `.xgfn` bitmap font format — parser/serializer.
 *
 * Verified byte-for-byte against a real decompressed sample
 * (Trajan Pro, 7pt, "o" style, numbers-only — 13 glyphs) extracted from a
 * real fonts.pak. This is the SAME G3V0/GAR3 family used elsewhere in this
 * tool for Risen 1/2, but the font file itself (once zlib-decompressed —
 * decompression happens at the fonts.pak container level, not here) has its
 * own internal layout:
 *
 *   0x00  "GAR3" + u32(0)
 *   0x08  "GR01FN01"
 *   0x10  u32 = 0x28                     (confirmed constant)
 *   0x14  u32, u32                       (segment sizes — meaning not fully resolved, copied verbatim)
 *   0x1C  u32                            (meaning not resolved, copied verbatim)
 *   0x20  int64 timestamp (FILETIME)     (copied verbatim)
 *   0x28  ".gfn" + 4 bytes padding
 *   0x30  "GEC0" + object block, TOTAL span (incl. magic) = 0x36 bytes — copied verbatim
 *   0x66  "GAR3" + u32(0)
 *   0x6E  "GEDXFNT0"
 *   0x76  u32 = 1
 *   0x7A  int32 CreateFont-style height (negative, e.g. -9 for 7pt)
 *   0x7E..0x8A  12 bytes, unresolved (likely italic/underline/charset flags) — copied verbatim
 *   0x8A  u32 weight (400 normal / 700 bold)
 *   0x8E  u16(0)
 *   0x90  u16(0) then 3 marker bytes (03 02 01)
 *   0x95  u8 (name-length-related; exact unit unresolved — copied verbatim, not recomputed)
 *   0x96  font family name, UTF-16LE, fixed 64-byte field (null-padded)
 *   0xD6  8 bytes zero
 *   0xDE  u32 = 0x58                     (confirmed constant)
 *   0xE2  u32 = 0
 *   0xE6  u32 = 1
 *   0xEA  u32 glyphCount
 *   0xEE  u32 (unresolved, e.g. 11)
 *   0xF2  u32 (unresolved, e.g. 32 — possibly first mapped char code, coincides with space)
 *   0xF6  u32 (unresolved, e.g. 12)
 *   0xFA  u32 (unresolved, e.g. 31)
 *   0xFE  charmap: (glyphCount - 1) pairs of { charCode:u16, glyphIndex:u16 }
 *         (glyph 0 is a spare/fallback slot with no charmap entry pointing at it
 *         in the sample; the very first pair maps a control code 0x0C -> glyph 0)
 *   ...   measurement table: glyphCount records, 9 x int32 (36 bytes) each --
 *         EXCEPT the last record, which is truncated to however many bytes
 *         remain before the DDS payload starts. This is confirmed on the real
 *         sample (12 full 36-byte records + 1 4-byte record ending exactly at
 *         the DDS offset) — the DDS start offset is the authority for where
 *         the table ends, not glyphCount * 36.
 *   ...   DDS file (standard header + pixel data) to EOF.
 *
 * Per-glyph measurement record fields — index [0] (atlas_x) is confirmed (a
 * monotonically increasing sequence matching the real glyph positions).
 * Fields [1]-[8] are NOT yet semantically confirmed: fields [3]=13 and [4]=5
 * are constant across all glyphs in the sample (plausibly cell-height/baseline
 * for a 7pt font) but this is a hypothesis pending visual confirmation via the
 * diagnostic grid tool (see RisenFonts.tsx) — do not rely on their meaning for
 * anything beyond display/inspection until confirmed against a live in-game
 * screenshot or a second real sample at a different point size.
 */

const DDS_MAGIC = [0x44, 0x44, 0x53, 0x20]; // "DDS "
const CHARMAP_START = 0xfe;
const GLYPH_COUNT_OFFSET = 0xea;
const MEASUREMENT_RECORD_SIZE = 36;

export interface XgfnGlyphRecord {
  charCode: number;
  glyphIndex: number;
}

export interface XgfnMeasurement {
  /** Raw bytes of this record, exactly as stored on disk — may be shorter
   * than MEASUREMENT_RECORD_SIZE for the last glyph if it's truncated by the
   * DDS boundary (confirmed real behavior, not a parsing bug). */
  rawBytes: Uint8Array;
  /** Decoded int32 fields, one per 4 bytes present in rawBytes (1-9 values). */
  fields: number[];
}

export interface XgfnDocument {
  /** Bytes [0, 0xFE) verbatim — full header incl. GEC0 block, name field, and
   * all numeric header fields listed in the docblock above. Opaque for now:
   * Phase 1 only needs to read glyphCount out of it (see glyphCount below);
   * regenerating a font with a different glyph count (Phase 2) will need to
   * patch GLYPH_COUNT_OFFSET here explicitly rather than treating this as a
   * single immutable blob. */
  headerPrefix: Uint8Array;
  glyphCount: number;
  charmap: XgfnGlyphRecord[];
  measurements: XgfnMeasurement[];
  /** Raw DDS file bytes (header + pixel data) verbatim, to EOF. */
  ddsBytes: Uint8Array;
}

function indexOfDdsMagic(bytes: Uint8Array, from: number): number {
  for (let i = from; i <= bytes.length - 4; i++) {
    if (
      bytes[i] === DDS_MAGIC[0] &&
      bytes[i + 1] === DDS_MAGIC[1] &&
      bytes[i + 2] === DDS_MAGIC[2] &&
      bytes[i + 3] === DDS_MAGIC[3]
    ) {
      return i;
    }
  }
  return -1;
}

export function parseXgfn(buffer: ArrayBuffer): XgfnDocument {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const magic = new TextDecoder("ascii").decode(bytes.subarray(0, 4));
  if (magic !== "GAR3") throw new Error(`توقيع غير متوقع: "${magic}" — ليس ملف .xgfn صالحاً`);
  const magic2 = new TextDecoder("ascii").decode(bytes.subarray(8, 16));
  if (magic2 !== "GR01FN01") throw new Error(`توقيع داخلي غير متوقع: "${magic2}"`);

  const glyphCount = view.getUint32(GLYPH_COUNT_OFFSET, true);
  if (glyphCount < 1 || glyphCount > 10000) {
    throw new Error(`عدد حروف غير معقول: ${glyphCount}`);
  }

  const headerPrefix = bytes.slice(0, CHARMAP_START);

  // --- charmap: (glyphCount - 1) pairs of (u16 charCode, u16 glyphIndex) ---
  const numPairs = glyphCount - 1;
  const charmap: XgfnGlyphRecord[] = [];
  let p = CHARMAP_START;
  for (let i = 0; i < numPairs; i++) {
    charmap.push({ charCode: view.getUint16(p, true), glyphIndex: view.getUint16(p + 2, true) });
    p += 4;
  }

  // --- DDS boundary: authoritative end-of-measurement-table marker ---
  const ddsOffset = indexOfDdsMagic(bytes, p);
  if (ddsOffset < 0) throw new Error("لم يتم العثور على بيانات DDS داخل ملف .xgfn");

  // --- measurement table: glyphCount records, 36 bytes each, except the
  // last one which is truncated at the DDS boundary. ---
  const measurements: XgfnMeasurement[] = [];
  let mp = p;
  for (let i = 0; i < glyphCount; i++) {
    const remaining = ddsOffset - mp;
    const recLen = Math.min(MEASUREMENT_RECORD_SIZE, Math.max(0, remaining));
    const rawBytes = bytes.slice(mp, mp + recLen);
    const fields: number[] = [];
    const recView = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
    for (let k = 0; k * 4 < recLen; k++) fields.push(recView.getInt32(k * 4, true));
    measurements.push({ rawBytes, fields });
    mp += recLen;
  }
  if (mp !== ddsOffset) {
    throw new Error(
      `عدم تطابق حدود جدول القياسات: انتهى عند ${mp} لكن DDS يبدأ عند ${ddsOffset} — الصيغة غير مطابقة للمتوقع`
    );
  }

  const ddsBytes = bytes.slice(ddsOffset);

  return { headerPrefix, glyphCount, charmap, measurements, ddsBytes };
}

export function buildXgfn(doc: XgfnDocument): ArrayBuffer {
  const charmapBytes = new Uint8Array(doc.charmap.length * 4);
  const charmapView = new DataView(charmapBytes.buffer);
  doc.charmap.forEach((rec, i) => {
    charmapView.setUint16(i * 4, rec.charCode, true);
    charmapView.setUint16(i * 4 + 2, rec.glyphIndex, true);
  });

  const measurementsTotalLen = doc.measurements.reduce((sum, m) => sum + m.rawBytes.length, 0);
  const measurementsBytes = new Uint8Array(measurementsTotalLen);
  let mp = 0;
  for (const m of doc.measurements) {
    measurementsBytes.set(m.rawBytes, mp);
    mp += m.rawBytes.length;
  }

  const totalLen = doc.headerPrefix.length + charmapBytes.length + measurementsBytes.length + doc.ddsBytes.length;
  const out = new Uint8Array(totalLen);
  let o = 0;
  out.set(doc.headerPrefix, o); o += doc.headerPrefix.length;
  out.set(charmapBytes, o); o += charmapBytes.length;
  out.set(measurementsBytes, o); o += measurementsBytes.length;
  out.set(doc.ddsBytes, o);

  return out.buffer;
}
