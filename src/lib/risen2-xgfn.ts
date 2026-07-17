/**
 * Risen 2 `.xgfn` bitmap font format — parser/serializer.
 *
 * Layout verified with EXACT arithmetic on all 77 real `.xgfn` entries of an
 * original fonts.pak AND all 35 entries of a real, working Chinese
 * localization fonts.p00 (112/112 tile perfectly to the DDS boundary with
 * zero leftover ambiguity):
 *
 *   0x00  "GAR3" + u32(0)
 *   0x08  "GR01FN01"
 *   0x10  u32 = 0x28                     (confirmed constant)
 *   0x14  u32, u32                       (segment sizes — meaning not fully resolved, copied verbatim)
 *   0x1C  u32 internalPayloadSize = totalFileSize - 0x66. CONFIRMED exactly
 *         on real samples of very different sizes. Must be recomputed
 *         whenever the file grows (a stale value caused a real in-game
 *         STATUS_NO_MEMORY crash during asset loading).
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
 *   0xEA  u32 (meaning unresolved — NOT a glyph/pair count; the working
 *         Chinese mod leaves it unchanged despite a twelvefold charmap
 *         increase. Copied verbatim, never modified.)
 *   0xEE  u32 (unresolved, e.g. 11)
 *   0xF2  u32 (unresolved — copied verbatim)
 *   0xF6  u32 pairCount — the number of charmap pairs (confirmed on all 112
 *         real fonts).
 *   0xFA  charmap: pairCount pairs of { charCode:u16, glyphIndex:u16 },
 *         starting HERE (not 0xFE — an earlier revision misread the first
 *         pair, typically (0x001F -> 0), as a header field, and consequently
 *         misread the recordCount field below as a final charmap pair. That
 *         misparse produced byte-identical unmodified round-trips — the two
 *         readings only diverge when INSERTING new pairs, which is exactly
 *         when it corrupted the output: new pairs landed after recordCount,
 *         which then parsed as a bogus pair in-game and shifted everything
 *         after it. Glyph 0 is the notdef/fallback box; original charmaps
 *         happen to be sorted ascending by charCode but the working Chinese
 *         mod's are NOT sorted, so sorting is confirmed unnecessary.)
 *   ...   u32 recordCount — number of measurement records. INDEPENDENT of
 *         pairCount: equals (highest glyphIndex used) + 1 on all 112 real
 *         fonts (e.g. Trajan Pro_8_bio: 276 pairs, 277 records — one glyph
 *         has no charmap entry pointing at it).
 *   ...   measurement table: recordCount records of 9 x int32 (36 bytes) each
 *         — all FULL records; the "truncated last record" of earlier
 *         revisions was actually the trailing u32 below.
 *   ...   u32 ddsByteLength — the byte length of the DDS payload that
 *         follows. CONFIRMED equal to the DDS length on 112/112 real fonts,
 *         and the working Chinese mod updates it when its atlases grow.
 *         MUST be recomputed whenever the DDS changes — left stale it made
 *         the engine read a truncated texture and reject the whole font
 *         (all glyphs invisible in-game, Latin included).
 *   ...   DDS file (standard header + pixel data) to EOF.
 *
 * Per-glyph measurement record fields — CONFIRMED on the real Georgia sample
 * (276 pairs, multi-row atlas) by decoding the DDS to RGBA and checking that
 * real ink (alpha > 0) pixels for known characters ('i', 'l', 'W', 'M', 'A',
 * 'g', '0', '.') always fall strictly inside the declared rectangle, for
 * glyphs on every row of the atlas:
 *
 *   fields[0] = x0 (left)    \  atlas bounding box containing the glyph's
 *   fields[1] = y0 (top)      \ pixels, with a few pixels of packer padding
 *   fields[2] = x1 (right)    / on each side (e.g. 'i' cell [143,0]-[152,27]
 *   fields[3] = y1 (bottom)  /  vs. real ink [145,5]-[150,20]).
 *   fields[4] = advance width — confirmed via the space character (charCode
 *               32), whose cell is degenerate ([0,0]-[0,0], no ink) yet still
 *               has fields[4] = 5, proving it's an independent typographic
 *               advance metric, not derived from the cell box.
 *
 * Fields [5]-[8] are NOT yet semantically confirmed (plausible candidates:
 * left/top bearing, kerning, or a secondary advance) — do not rely on their
 * meaning for anything beyond display/inspection.
 */

const DDS_MAGIC = [0x44, 0x44, 0x53, 0x20]; // "DDS "
const CHARMAP_START = 0xfa;
const GLYPH_COUNT_OFFSET = 0xea; // meaning unresolved — kept for display/round-trip only, NOT used to size anything
const CHARMAP_PAIR_COUNT_OFFSET = 0xf6; // confirmed authoritative charmap pair count (see docblock)
const MEASUREMENT_RECORD_SIZE = 36;

export interface XgfnGlyphRecord {
  charCode: number;
  glyphIndex: number;
}

export interface XgfnMeasurement {
  /** Raw 36 bytes of this record, exactly as stored on disk. */
  rawBytes: Uint8Array;
  /** Decoded int32 fields (9 values). */
  fields: number[];
}

export interface XgfnDocument {
  /** Bytes [0, 0xFA) verbatim — full header incl. GEC0 block, name field, and
   * all numeric header fields listed in the docblock above. When a document
   * is modified, the 0xF6 pair count and 0x1C payload size inside this blob
   * must be patched to match (see risen2-arabic-font-gen.ts). */
  headerPrefix: Uint8Array;
  /** Raw value of the u32 at 0xEA, for display/round-trip only — its true
   * meaning is unresolved and it must never be modified (see docblock). */
  glyphCount: number;
  charmap: XgfnGlyphRecord[];
  /** The u32 recordCount field between the charmap and the measurement
   * table. Independent of charmap.length; must equal measurements.length
   * (= highest glyphIndex + 1) when serialized. */
  recordCount: number;
  measurements: XgfnMeasurement[];
  /** The unresolved u32 between the measurement table and the DDS payload,
   * verbatim (4 bytes on every real font sampled). */
  trailingBytes: Uint8Array;
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

  const numPairs = view.getUint32(CHARMAP_PAIR_COUNT_OFFSET, true);
  if (numPairs < 1 || numPairs > 100000) {
    throw new Error(`عدد أزواج خارطة الحروف غير معقول: ${numPairs}`);
  }

  const headerPrefix = bytes.slice(0, CHARMAP_START);

  // --- charmap: numPairs (from 0xF6) pairs of (u16 charCode, u16 glyphIndex) ---
  const charmap: XgfnGlyphRecord[] = [];
  let p = CHARMAP_START;
  for (let i = 0; i < numPairs; i++) {
    charmap.push({ charCode: view.getUint16(p, true), glyphIndex: view.getUint16(p + 2, true) });
    p += 4;
  }

  // --- u32 recordCount: measurement record count, independent of numPairs ---
  const recordCount = view.getUint32(p, true);
  p += 4;
  if (recordCount < 1 || recordCount > 100000) {
    throw new Error(`عدد سجلات القياسات غير معقول: ${recordCount}`);
  }

  // --- measurement table: recordCount full 36-byte records ---
  const measurements: XgfnMeasurement[] = [];
  for (let i = 0; i < recordCount; i++) {
    const rawBytes = bytes.slice(p, p + MEASUREMENT_RECORD_SIZE);
    if (rawBytes.length < MEASUREMENT_RECORD_SIZE) {
      throw new Error(`جدول القياسات مبتور: السجل ${i} يتجاوز نهاية الملف`);
    }
    const recView = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
    const fields: number[] = [];
    for (let k = 0; k < 9; k++) fields.push(recView.getInt32(k * 4, true));
    measurements.push({ rawBytes, fields });
    p += MEASUREMENT_RECORD_SIZE;
  }

  // --- trailing u32 (unresolved) then DDS; the DDS magic is the authority
  // that our arithmetic landed exactly where it should. ---
  const ddsOffset = indexOfDdsMagic(bytes, p);
  if (ddsOffset < 0) throw new Error("لم يتم العثور على بيانات DDS داخل ملف .xgfn");
  if (ddsOffset !== p + 4) {
    throw new Error(
      `عدم تطابق حدود جدول القياسات: انتهى عند ${p} لكن DDS يبدأ عند ${ddsOffset} (المتوقع ${p + 4}) — الصيغة غير مطابقة للمتوقع`
    );
  }
  const trailingBytes = bytes.slice(p, ddsOffset);

  const ddsBytes = bytes.slice(ddsOffset);

  return { headerPrefix, glyphCount, charmap, recordCount, measurements, trailingBytes, ddsBytes };
}

export function buildXgfn(doc: XgfnDocument): ArrayBuffer {
  if (doc.recordCount !== doc.measurements.length) {
    throw new Error(
      `recordCount (${doc.recordCount}) لا يطابق عدد سجلات القياسات الفعلي (${doc.measurements.length})`
    );
  }

  const charmapBytes = new Uint8Array(doc.charmap.length * 4);
  const charmapView = new DataView(charmapBytes.buffer);
  doc.charmap.forEach((rec, i) => {
    charmapView.setUint16(i * 4, rec.charCode, true);
    charmapView.setUint16(i * 4 + 2, rec.glyphIndex, true);
  });

  const recordCountBytes = new Uint8Array(4);
  new DataView(recordCountBytes.buffer).setUint32(0, doc.recordCount, true);

  const measurementsTotalLen = doc.measurements.reduce((sum, m) => sum + m.rawBytes.length, 0);
  const measurementsBytes = new Uint8Array(measurementsTotalLen);
  let mp = 0;
  for (const m of doc.measurements) {
    measurementsBytes.set(m.rawBytes, mp);
    mp += m.rawBytes.length;
  }

  const totalLen =
    doc.headerPrefix.length +
    charmapBytes.length +
    recordCountBytes.length +
    measurementsBytes.length +
    doc.trailingBytes.length +
    doc.ddsBytes.length;
  const out = new Uint8Array(totalLen);
  let o = 0;
  out.set(doc.headerPrefix, o); o += doc.headerPrefix.length;
  out.set(charmapBytes, o); o += charmapBytes.length;
  out.set(recordCountBytes, o); o += recordCountBytes.length;
  out.set(measurementsBytes, o); o += measurementsBytes.length;
  out.set(doc.trailingBytes, o); o += doc.trailingBytes.length;
  out.set(doc.ddsBytes, o);

  return out.buffer;
}
