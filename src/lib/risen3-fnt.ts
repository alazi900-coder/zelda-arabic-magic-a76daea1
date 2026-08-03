/**
 * Risen 3 font entries (`w_fnt_*.rom`) — parser and serializer.
 *
 * Risen 3 keeps its fonts in `0_na_fnt.pak`, a G3V0 archive the Risen 2 reader
 * in risen-images-pak.ts already opens unchanged. Every entry inside is zlib
 * (the same `size1 === size2 means raw` rule as Risen 2's fonts.pak), and what
 * comes out is the engine's font object: `GAR5` + `GEDXFNT0`.
 *
 * That is the same font object Risen 2 ships as `.xgfn` — see risen2-xgfn.ts,
 * whose field-by-field notes hold here too. Three things differ, all measured
 * against the seven fonts of a real `0_na_fnt.pak`:
 *
 *   1. The wrapper is `GAR5`, not `GAR3`, and it is shorter: the header runs
 *      to 0xAC instead of 0xF6. Everything inside keeps its order — the
 *      CreateFont height sits at 0x40 (0x7A in Risen 2), the weight at 0x50,
 *      the `03 02 01` markers at 0x58 and the family name, UTF-16LE, at 0x5C.
 *   2. A measurement record is 28 bytes, not 36 — seven int32 rather than
 *      nine. The first five are the same and were read off the file: x0, y0,
 *      x1, y1 and the advance.
 *   3. Three of the seven fonts carry a block between the measurements and the
 *      texture that the other four do not (12368, 15736 and 21768 bytes —
 *      kerning, most likely). Nothing here reads it; it is carried across
 *      verbatim, which is what the round-trip test checks.
 *
 * Two lengths have to be recomputed whenever the texture changes size, and a
 * stale one is not a cosmetic problem — the same mistake in Risen 2 made the
 * engine reject the whole font, Latin letters included:
 *
 *   - the u32 immediately before the texture, which is its byte length;
 *   - the 36-byte footer, which repeats where the texture ends.
 *
 * The footer's own shape, read off four fonts: u32(44), u32(end − 44), a pad
 * byte, then the end offset three times as int64, each followed by a pad byte.
 */

const MAGIC = "GEDXFNT0";
const MAGIC_OFFSET = 0x34;
/** Bytes [0, HEADER_END) are carried across untouched. */
const HEADER_END = 0xac;
const PAIR_COUNT_OFFSET = 0xac;
const CHARMAP_START = 0xb0;
const RECORD_SIZE = 28;
const FOOTER_SIZE = 36;
const DDS_MAGIC = [0x44, 0x44, 0x53, 0x20];

export interface Risen3FntPair {
  charCode: number;
  glyphIndex: number;
}

export interface Risen3FntGlyph {
  /** The record's 28 bytes exactly as stored. */
  rawBytes: Uint8Array;
  /** x0, y0, x1, y1, advance, and two fields whose meaning is unresolved. */
  fields: number[];
}

export interface Risen3FntDocument {
  /** Bytes [0, 0xAC): wrapper, height, weight and the family name. */
  headerPrefix: Uint8Array;
  charmap: Risen3FntPair[];
  /** The count stored before the records. Equal to the pair count in all seven. */
  recordCount: number;
  glyphs: Risen3FntGlyph[];
  /** Whatever sits between the records and the texture length — copied as-is. */
  opaqueTail: Uint8Array;
  /** The texture: a standard DDS, 8 bits a pixel, uncompressed. */
  dds: Uint8Array;
}

function u32(bytes: Uint8Array, at: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at, true);
}

/** True when these bytes are a Risen 3 font object. */
export function looksLikeRisen3Fnt(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER_END) return false;
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[MAGIC_OFFSET + i] !== MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

/** The family name the engine shows, read from the fixed UTF-16LE field. */
export function risen3FntName(bytes: Uint8Array): string {
  const field = bytes.subarray(0x5c, 0x5c + 64);
  let text = "";
  for (let i = 0; i + 1 < field.length; i += 2) {
    const code = field[i] | (field[i + 1] << 8);
    if (code === 0) break;
    text += String.fromCharCode(code);
  }
  return text;
}

function findDds(bytes: Uint8Array, from: number): number {
  for (let i = from; i + 4 <= bytes.length; i++) {
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

export function parseRisen3Fnt(bytes: Uint8Array): Risen3FntDocument {
  if (!looksLikeRisen3Fnt(bytes)) {
    throw new Error("هذا ليس ملف خطّ Risen 3 — لم أجد GEDXFNT0 في موضعه");
  }
  const pairCount = u32(bytes, PAIR_COUNT_OFFSET);
  const charmapEnd = CHARMAP_START + 4 * pairCount;
  if (charmapEnd + 4 > bytes.length) throw new Error("خريطة الحروف أطول من الملف");

  const charmap: Risen3FntPair[] = [];
  for (let i = 0; i < pairCount; i++) {
    const at = CHARMAP_START + 4 * i;
    charmap.push({ charCode: bytes[at] | (bytes[at + 1] << 8), glyphIndex: bytes[at + 2] | (bytes[at + 3] << 8) });
  }

  const recordCount = u32(bytes, charmapEnd);
  const recordsStart = charmapEnd + 4;
  const recordsEnd = recordsStart + RECORD_SIZE * recordCount;
  if (recordsEnd > bytes.length) throw new Error("جدول القياسات أطول من الملف");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const glyphs: Risen3FntGlyph[] = [];
  for (let i = 0; i < recordCount; i++) {
    const at = recordsStart + RECORD_SIZE * i;
    const fields: number[] = [];
    for (let k = 0; k < RECORD_SIZE / 4; k++) fields.push(view.getInt32(at + 4 * k, true));
    glyphs.push({ rawBytes: bytes.slice(at, at + RECORD_SIZE), fields });
  }

  const ddsAt = findDds(bytes, recordsEnd);
  if (ddsAt < 0) throw new Error("لم أجد صورة الحروف (DDS) داخل ملف الخطّ");
  const ddsLength = u32(bytes, ddsAt - 4);

  return {
    headerPrefix: bytes.slice(0, HEADER_END),
    charmap,
    recordCount,
    glyphs,
    // The length field itself is rebuilt, so it is not part of the blob.
    opaqueTail: bytes.slice(recordsEnd, ddsAt - 4),
    dds: bytes.slice(ddsAt, ddsAt + ddsLength),
  };
}

/**
 * Writes a font object back out.
 *
 * The charmap is sorted by character code first, and that is not tidiness. All
 * seven shipped fonts are strictly ascending, without one exception, and a
 * build that appended Arabic after the last existing code — «… 8250, 8364,
 * 1548 …» — made the game show no text at all: not the Arabic, not the Latin.
 * The engine binary-searches this table, the same way Risen 3 searches its
 * string archive, so a single step out of order loses every character rather
 * than the ones added. (Risen 2 tolerated an unsorted charmap; this one does
 * not, which is why the note in risen2-xgfn.ts does not carry over.)
 */
export function buildRisen3Fnt(doc: Risen3FntDocument): Uint8Array {
  const sorted = [...doc.charmap].sort((a, b) => a.charCode - b.charCode);
  const charmapBytes = new Uint8Array(4 * sorted.length);
  sorted.forEach((pair, i) => {
    charmapBytes[4 * i] = pair.charCode & 0xff;
    charmapBytes[4 * i + 1] = (pair.charCode >> 8) & 0xff;
    charmapBytes[4 * i + 2] = pair.glyphIndex & 0xff;
    charmapBytes[4 * i + 3] = (pair.glyphIndex >> 8) & 0xff;
  });

  const size =
    HEADER_END + 4 + charmapBytes.length + 4 + RECORD_SIZE * doc.glyphs.length +
    doc.opaqueTail.length + 4 + doc.dds.length + FOOTER_SIZE;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let p = 0;
  const put = (chunk: Uint8Array) => {
    out.set(chunk, p);
    p += chunk.length;
  };

  put(doc.headerPrefix);
  view.setUint32(p, sorted.length, true);
  p += 4;
  put(charmapBytes);
  view.setUint32(p, doc.glyphs.length, true);
  p += 4;
  for (const glyph of doc.glyphs) put(glyph.rawBytes);
  put(doc.opaqueTail);
  view.setUint32(p, doc.dds.length, true);
  p += 4;
  put(doc.dds);

  // The footer repeats where the texture ends. Left stale, the engine reads a
  // truncated texture and drops the font — Latin letters and all.
  const end = p;
  view.setUint32(p, 44, true);
  view.setUint32(p + 4, end - 44, true);
  out[p + 8] = 0;
  for (let k = 0; k < 3; k++) {
    view.setBigInt64(p + 9 + 9 * k, BigInt(end), true);
    out[p + 17 + 9 * k] = 0;
  }
  return out;
}

/**
 * Writes a font's new size into the archive's index, `w_fnt_0_na.db`.
 *
 * The index repeats what the font's own footer says: after the font's name it
 * carries u32(44), u32(end - 44), a pad byte, then the end offset three times
 * as int64, each followed by a pad byte — byte for byte the same block. Checked
 * on all seven fonts of a real archive: every recorded number equalled that
 * font's length minus 36, exactly.
 *
 * Leaving it stale is not a small error. The first build grew an atlas, updated
 * the font and left the index saying the old size; the engine found the two
 * disagreeing and dropped the font altogether — the game showed no text at all,
 * Latin included. Nothing on screen said why.
 */
export function patchRisen3FontDb(db: Uint8Array, fontName: string, fontLength: number): Uint8Array {
  const name = new TextEncoder().encode(fontName);
  let at = -1;
  outer: for (let i = 0; i + name.length <= db.length; i++) {
    for (let k = 0; k < name.length; k++) if (db[i + k] !== name[k]) continue outer;
    // The name is preceded by its own length, which tells a real record from a
    // stretch of bytes that happens to read the same way.
    if (i >= 4 && u32(db, i - 4) === name.length) { at = i; break; }
  }
  if (at < 0) throw new Error(`لم أجد «${fontName}» في فهرس الخطوط`);
  const p = at + name.length;
  if (u32(db, p) !== 44) throw new Error(`سجلّ «${fontName}» في الفهرس ليس بالشكل المتوقّع`);

  const end = fontLength - FOOTER_SIZE;
  const out = db.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setUint32(p + 4, end - 44, true);
  for (let k = 0; k < 3; k++) view.setBigInt64(p + 9 + 9 * k, BigInt(end), true);
  return out;
}

/**
 * Every font name the index lists, in order.
 *
 * The index knows a font by its full name — «Linux Biolinum O_30__sdf» — while
 * the font's own header carries only the family, «Linux Biolinum O». Two of the
 * seven share that family, so the caller matches on the full name and this is
 * what gives it.
 */
export function readRisen3FontDbNames(db: Uint8Array): string[] {
  const decoder = new TextDecoder("latin1");
  const out: string[] = [];
  for (let i = 4; i + 4 < db.length; i++) {
    const length = u32(db, i - 4);
    if (length < 4 || length > 64 || i + length + 4 > db.length) continue;
    if (u32(db, i + length) !== 44) continue;
    let printable = true;
    for (let k = 0; k < length; k++) {
      const c = db[i + k];
      if (c < 0x20 || c > 0x7e) { printable = false; break; }
    }
    if (printable) out.push(decoder.decode(db.subarray(i, i + length)));
  }
  return out;
}

/**
 * The archive's manifest, `w_fnt_0_na.csv`: which name belongs to which hash.
 *
 * Needed because a font's header carries only its family — «Linux Biolinum O» —
 * and two of the seven share one, while the index knows them apart by their full
 * names («…_30__sdf» and «…_40_b_sdf»). The hash is in the entry's own filename,
 * `w_fnt_0_na_7bbf1d60.rom`, so this is the one mapping that cannot be
 * ambiguous — and writing a size into the wrong font's record would drop that
 * font in game.
 */
export function readRisen3FontCsv(csv: Uint8Array): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of new TextDecoder("latin1").decode(csv).split("\n")) {
    const parts = line.split("|");
    if (parts.length < 2) continue;
    const hash = parts[0].trim().toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(hash)) continue;
    out.set(hash, parts[1].trim());
  }
  return out;
}

/** The hash in an entry's filename, e.g. `w_fnt_0_na_7bbf1d60.rom`. */
export function risen3FntHashFromPath(path: string): string | null {
  const m = /_([0-9a-f]{8})\.rom$/i.exec(path);
  return m ? m[1].toLowerCase() : null;
}

/** The end offset the index currently records for a font, for checking. */
export function readRisen3FontDbEnd(db: Uint8Array, fontName: string): number | null {
  const name = new TextEncoder().encode(fontName);
  outer: for (let i = 0; i + name.length <= db.length; i++) {
    for (let k = 0; k < name.length; k++) if (db[i + k] !== name[k]) continue outer;
    if (i >= 4 && u32(db, i - 4) === name.length && u32(db, i + name.length) === 44) {
      const view = new DataView(db.buffer, db.byteOffset, db.byteLength);
      return Number(view.getBigInt64(i + name.length + 9, true));
    }
  }
  return null;
}

/** Width, height and pixel bytes of the glyph texture — 8 bits a pixel. */
export function risen3FntAtlas(doc: Risen3FntDocument): { width: number; height: number; pixels: Uint8Array } {
  const height = u32(doc.dds, 12);
  const width = u32(doc.dds, 16);
  return { width, height, pixels: doc.dds.subarray(128, 128 + width * height) };
}
