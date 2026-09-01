/**
 * Reader/writer for FE12's dialogue font (`fonts/talk`). Despite the
 * NitroFS index heuristically flagging it as "compression-0x30", it is
 * stored raw — that byte is just the low byte of its own totalSize field,
 * not a real compression tag.
 *
 *   header 0x20: u32 totalSize, u32 indexRelOffset, u32 indexCount
 *   0x20..0x320: 0xC0 u32 slots, one per Shift-JIS TRAIL byte (0x40..0xFF);
 *                each is the relative offset of that trail byte's glyph
 *                list, or 0 if unused
 *   list entry (8 bytes): u16 sjisCode, u16 width, u32 glyphRelOffset,
 *                terminated by an all-zero code+width
 *   glyph data: 16x16 pixels, 4 bits each, run-length coded — groups of
 *                eight values, each group preceded by a flag byte whose
 *                bit b says whether value b is a literal pixel or a run of
 *                (value+1) zeros; the eight values pack as nibbles across
 *                the next four bytes, high nibble first.
 *
 * Verified this session: re-encoding all 1592 real glyphs in the font
 * reproduced every one of them pixel-for-pixel.
 *
 * Glyphs are patched IN PLACE, never by rebuilding the file: an Arabic
 * letter has far more blank space than the kanji it replaces, so it
 * re-encodes smaller and simply leaves the unread tail of the old glyph's
 * bytes alone (the decoder stops once it has produced 256 pixels). That
 * avoids touching the trailing index table, whose own meaning wasn't
 * needed for this.
 */

const HEADER_BASE = 0x20;
const TRAIL_TABLE_COUNT = 0xc0;
// Within a row, the first eight pixels fill columns 7..0 and the next eight
// fill columns 15..8 — the nibble packing order reversed back into place.
const COLUMN_ORDER = [...Array(8).keys()].reverse().concat([...Array(8).keys()].reverse().map((c) => c + 8));

export interface Fe12GlyphSlot {
  code: number;
  width: number;
  glyphAbs: number;
  entryAbs: number;
}

export function readFe12Font(data: Uint8Array): Fe12GlyphSlot[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const glyphs: Fe12GlyphSlot[] = [];
  for (let i = 0; i < TRAIL_TABLE_COUNT; i++) {
    const listRel = view.getUint32(HEADER_BASE + i * 4, true);
    if (listRel === 0) continue;
    let cursor = HEADER_BASE + listRel;
    while (cursor + 8 <= data.length) {
      const code = view.getUint16(cursor, true);
      const width = view.getUint16(cursor + 2, true);
      const glyphRel = view.getUint32(cursor + 4, true);
      if (code === 0 && width === 0) break;
      glyphs.push({ code, width, glyphAbs: HEADER_BASE + glyphRel, entryAbs: cursor });
      cursor += 8;
    }
  }
  glyphs.sort((a, b) => a.code - b.code);
  return glyphs;
}

export type Fe12Raster = number[][]; // 16 rows x 16 columns, 4-bit values

export interface Fe12DecodedGlyph {
  raster: Fe12Raster;
  byteLength: number;
}

export function decodeFe12Glyph(data: Uint8Array, glyphAbs: number): Fe12DecodedGlyph {
  let src = glyphAbs;
  const pixels: number[] = [];
  while (pixels.length < 256) {
    const flags = data[src++];
    const nibbles: number[] = [];
    for (let i = 0; i < 4; i++) {
      const byte = data[src++] ?? 0;
      nibbles.push(byte >> 4, byte & 0x0f);
    }
    for (let bit = 0; bit < 8 && pixels.length < 256; bit++) {
      const value = nibbles[bit];
      if (flags & (1 << bit)) {
        for (let n = 0; n < value + 1 && pixels.length < 256; n++) pixels.push(0);
      } else {
        pixels.push(value);
      }
    }
  }
  const raster: Fe12Raster = Array.from({ length: 16 }, () => Array(16).fill(0));
  for (let pos = 0; pos < 256; pos++) raster[Math.floor(pos / 16)][COLUMN_ORDER[pos % 16]] = pixels[pos];
  return { raster, byteLength: src - glyphAbs };
}

interface RunToken { run: boolean; value: number }

export function encodeFe12Glyph(raster: Fe12Raster): Uint8Array {
  const pixels: number[] = [];
  for (let pos = 0; pos < 256; pos++) pixels.push(raster[Math.floor(pos / 16)][COLUMN_ORDER[pos % 16]]);

  const tokens: RunToken[] = [];
  let i = 0;
  while (i < 256) {
    if (pixels[i] === 0) {
      let run = 0;
      while (i + run < 256 && pixels[i + run] === 0 && run < 16) run++;
      tokens.push({ run: true, value: run - 1 });
      i += run;
    } else {
      tokens.push({ run: false, value: pixels[i] });
      i += 1;
    }
  }

  const out: number[] = [];
  for (let g = 0; g < tokens.length; g += 8) {
    const group = tokens.slice(g, g + 8);
    let flags = 0;
    const nibbles: number[] = [];
    for (let b = 0; b < 8; b++) {
      const token = group[b];
      if (token?.run) flags |= 1 << b;
      nibbles.push(token ? token.value : 0);
    }
    out.push(flags);
    for (let n = 0; n < 8; n += 2) out.push((nibbles[n] << 4) | nibbles[n + 1]);
  }
  return Uint8Array.from(out);
}

/** Overwrites a glyph's bitmap in place; throws if the new encoding doesn't fit the original slot's byte budget. */
export function writeFe12GlyphInPlace(data: Uint8Array, slot: Fe12GlyphSlot, raster: Fe12Raster, newWidth?: number): void {
  const { byteLength } = decodeFe12Glyph(data, slot.glyphAbs);
  const encoded = encodeFe12Glyph(raster);
  if (encoded.length > byteLength) {
    throw new Error(`الرمز 0x${slot.code.toString(16)}: الترميز الجديد ${encoded.length} بايت يتجاوز مساحة الخانة الأصلية ${byteLength} بايت.`);
  }
  data.set(encoded, slot.glyphAbs);
  if (newWidth !== undefined) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    view.setUint16(slot.entryAbs + 2, newWidth, true);
  }
}
