/**
 * Patches Arabic glyphs into an Inazuma Eleven NFTR font, and encodes Arabic
 * text into the byte codes those glyphs answer to.
 *
 * The dialogue text in this ROM is Shift-JIS: single ASCII bytes, or a
 * lead/trail byte pair for anything Japanese. Each slot here reuses an
 * *existing* PAMC (character map) entry that already resolves to a real
 * glyph index -- confirmed absent from every text-bearing file found in the
 * ROM (see inazuma-arabic-glyphs.ts) -- so only the glyph bitmap and width
 * already stored at that index are overwritten. No CMAP block is added or
 * resized, which is what makes this safe without having reverse engineered
 * the NFTR header's own internal offsets.
 *
 * Earlier this reused the hiragana range (0x829F-0x82F1, glyphs 366-448) on
 * the assumption that an English-only ROM never draws hiragana. That was
 * wrong -- this cartridge still ships thousands of untranslated Japanese
 * lines that do -- so the codes and glyph indices here are an explicit,
 * verified, non-contiguous list rather than a single base + offset.
 *
 * Text is written one byte per Arabic letter, not two: the engine patch
 * (inazuma-rtl-patch.ts) makes every byte from 0x80 up a character of its
 * own except 0x81 and 0x82, and `addInazumaByteMap` points those bytes at
 * the same glyphs the two-byte codes above draw.
 */
import {
  INAZUMA_FONT12_GLYPHS_B64,
  INAZUMA_FONT12_WIDTHS,
  INAZUMA_FONT8_GLYPHS_B64,
  INAZUMA_FONT8_WIDTHS,
  INAZUMA_ARABIC_CODEPOINTS,
  INAZUMA_SHIFT_JIS_CODES,
  INAZUMA_GLYPH_INDICES,
} from "./inazuma-arabic-glyphs";

interface GlyphSetSpec {
  tileBytes: number;
  glyphsB64: string;
  widths: number[];
}

const FONT12_SPEC: GlyphSetSpec = { tileBytes: 17, glyphsB64: INAZUMA_FONT12_GLYPHS_B64, widths: INAZUMA_FONT12_WIDTHS };
const FONT8_SPEC: GlyphSetSpec = { tileBytes: 7, glyphsB64: INAZUMA_FONT8_GLYPHS_B64, widths: INAZUMA_FONT8_WIDTHS };

/** `FONT12.NFTR` and `FONT12N.NFTR` are byte-identical in shape (11x12, 1bpp). */
export function patchInazumaFont12(nftr: Uint8Array): Uint8Array {
  return patchGlyphSlots(nftr, FONT12_SPEC);
}

export function patchInazumaFont8(nftr: Uint8Array): Uint8Array {
  return patchGlyphSlots(nftr, FONT8_SPEC);
}

/**
 * The byte each Arabic form is written as, same order as
 * INAZUMA_ARABIC_CODEPOINTS: every byte from 0x80 up except 0x81 and 0x82,
 * which stay Shift-JIS lead bytes (the English script's quotes and brackets
 * and the right-to-left marker are two-byte codes starting with them), and
 * 0xBA, which this font draws as é ("Maid Café"). That leaves exactly 125,
 * one per form. The rest of 0xA1-0xDF is accented Latin the European text
 * never uses, apart from è and ï once each.
 */
export const INAZUMA_ARABIC_BYTES: number[] = [0x80];
for (let b = 0x83; b <= 0xff; b++) if (b !== 0xba) INAZUMA_ARABIC_BYTES.push(b);

interface FontBlocks {
  view: DataView;
  plgc: number;
  tileBytes: number;
  hdwc: number;
  cmaps: number[];
}

function fontBlocks(nftr: Uint8Array): FontBlocks {
  const view = new DataView(nftr.buffer, nftr.byteOffset, nftr.byteLength);
  let plgc = -1, tileBytes = 0, hdwc = -1;
  const cmaps: number[] = [];
  for (let p = 0x10; p < nftr.length - 8; ) {
    const kind = String.fromCharCode(nftr[p], nftr[p + 1], nftr[p + 2], nftr[p + 3]);
    const size = view.getUint32(p + 4, true);
    if (size === 0) break;
    if (kind === "PLGC") { plgc = p + 16; tileBytes = view.getUint16(p + 10, true); }
    if (kind === "HDWC") hdwc = p + 8;
    if (kind === "PAMC") cmaps.push(p + 8);
    p += size;
  }
  // The game searches the maps in list order, from FINF's pointer on.
  if (String.fromCharCode(nftr[0x10], nftr[0x11], nftr[0x12], nftr[0x13]) === "FNIF") {
    cmaps.length = 0;
    for (let at = view.getUint32(0x28, true); at && at < nftr.length; at = view.getUint32(at + 8, true)) cmaps.push(at);
  }
  return { view, plgc, tileBytes, hdwc, cmaps };
}

/** The glyph `code` draws, through the first of the font's maps that holds it; -1 if none. */
function fontGlyphIndex({ view, cmaps }: FontBlocks, code: number): number {
  for (const at of cmaps) {
    const first = view.getUint16(at, true), last = view.getUint16(at + 2, true), type = view.getUint32(at + 4, true);
    if (code < first || code > last) continue;
    let glyph = 0xffff;
    if (type === 0) glyph = view.getUint16(at + 12, true) + code - first;
    else if (type === 1) glyph = view.getUint16(at + 12 + (code - first) * 2, true);
    else {
      const n = view.getUint16(at + 12, true);
      for (let i = 0; i < n; i++) if (view.getUint16(at + 14 + i * 4, true) === code) glyph = view.getUint16(at + 16 + i * 4, true);
    }
    return glyph === 0xffff ? -1 : glyph;
  }
  return -1;
}

/**
 * Makes the glyph `code` draws an empty, zero-width one -- for the
 * right-to-left marker (see inazuma-rtl-patch.ts), which must take no room
 * and show nothing. The glyph is found through the font's own character map,
 * so it works on every font whatever its glyph numbering.
 */
export function blankInazumaGlyph(nftr: Uint8Array, code: number): Uint8Array {
  const out = nftr.slice();
  const font = fontBlocks(out);
  const { view, plgc, tileBytes, hdwc } = font;
  const glyph = fontGlyphIndex(font, code);
  if (plgc < 0 || hdwc < 0 || glyph < 0) throw new Error(`الخطّ لا يحتوي الرمز 0x${code.toString(16)}`);
  out.fill(0, plgc + glyph * tileBytes, plgc + (glyph + 1) * tileBytes);
  const firstGlyph = view.getUint16(hdwc, true);
  out.fill(0, hdwc + 8 + (glyph - firstGlyph) * 3, hdwc + 8 + (glyph - firstGlyph) * 3 + 3);
  return out;
}

/**
 * Adds a character-map block for the single bytes 0x80-0xFF: each byte in
 * INAZUMA_ARABIC_BYTES draws the glyph its form's two-byte code draws (so
 * run this after the glyphs are patched in, on FONT12, FONT12N and FONT8),
 * and every other byte keeps what it drew before -- 0xBA its é.
 *
 * The block goes at the end of the file and first in the font's list of
 * maps (FINF's pointer at 0x28 now points at it, and it points on to the old
 * first map), because the game takes the first map whose range holds a code,
 * and the old 0xA1-0xDF block would otherwise still answer for those bytes.
 */
export function addInazumaByteMap(nftr: Uint8Array): Uint8Array {
  const font = fontBlocks(nftr);
  const table = new Uint16Array(0x80);
  for (let b = 0x80; b <= 0xff; b++) {
    const slot = INAZUMA_ARABIC_BYTES.indexOf(b);
    const glyph = fontGlyphIndex(font, slot >= 0 ? INAZUMA_SHIFT_JIS_CODES[slot] : b);
    if (slot >= 0 && glyph < 0) throw new Error(`الخطّ لا يرسم الرمز 0x${INAZUMA_SHIFT_JIS_CODES[slot].toString(16)}`);
    table[b - 0x80] = glyph < 0 ? 0xffff : glyph;
  }
  const at = Math.ceil(nftr.length / 4) * 4;
  const size = 8 + 12 + table.length * 2;
  const out = new Uint8Array(at + size);
  out.set(nftr);
  const view = new DataView(out.buffer);
  out.set([0x50, 0x41, 0x4d, 0x43], at); // "PAMC"
  view.setUint32(at + 4, size, true);
  view.setUint16(at + 8, 0x80, true);
  view.setUint16(at + 10, 0xff, true);
  view.setUint16(at + 12, 1, true); // a table, one glyph index per code
  view.setUint32(at + 16, view.getUint32(0x28, true), true); // on to the old first map
  table.forEach((glyph, i) => view.setUint16(at + 20 + i * 2, glyph, true));
  view.setUint32(0x28, at + 8, true);
  view.setUint32(0x08, out.length, true); // file size
  view.setUint16(0x0e, view.getUint16(0x0e, true) + 1, true); // block count
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Overwrites glyph bitmaps and widths at the existing hiragana indices.
 *
 * PLGC's block starts `PLGC`(4) + size(4) + a 8-byte glyph-metrics header
 * (char_w, char_h, tile_bytes, bearing_w, bearing_h, encoding, pad) = 16
 * bytes, then glyph data packed contiguously, `tileBytes` each, MSB-first
 * within each byte -- verified against this ROM's own glyph 33 (Latin 'A')
 * before anything here was written.
 *
 * HDWC's block starts `HDWC`(4) + size(4) + start(2) + end(2) + next(4) = 16
 * bytes, then a 3-byte {leftBearing, glyphWidth, charWidth} per glyph. The
 * font's own non-space entries all carry leftBearing=0 and glyphWidth ==
 * charWidth, which is the shape used here.
 */
function patchGlyphSlots(nftr: Uint8Array, spec: GlyphSetSpec): Uint8Array {
  const out = nftr.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  let p = 0x10; // past the FNIF block header this module never touches
  let plgcDataOffset = -1;
  let hdwcDataOffset = -1;
  while (p < out.length - 8) {
    const kind = String.fromCharCode(out[p], out[p + 1], out[p + 2], out[p + 3]);
    const size = view.getUint32(p + 4, true);
    if (size === 0) break;
    if (kind === "PLGC") {
      const tileBytes = view.getUint16(p + 10, true);
      if (tileBytes !== spec.tileBytes) {
        throw new Error(`شكل خانة الحرف في NFTR (${tileBytes}) لا يطابق المتوقّع (${spec.tileBytes}).`);
      }
      plgcDataOffset = p + 16;
    }
    if (kind === "HDWC") hdwcDataOffset = p + 16;
    p += size;
  }
  if (plgcDataOffset < 0 || hdwcDataOffset < 0) throw new Error("لم يُعثر على PLGC أو HDWC في ملفّ الخطّ.");

  const glyphBytes = base64ToBytes(spec.glyphsB64);
  const count = INAZUMA_ARABIC_CODEPOINTS.length;
  if (glyphBytes.length !== count * spec.tileBytes) {
    throw new Error(`بيانات رموز عربية غير مكتملة: ${glyphBytes.length} بايت لِـ ${count} حرفاً.`);
  }
  for (let i = 0; i < count; i++) {
    const glyphIndex = INAZUMA_GLYPH_INDICES[i];
    out.set(glyphBytes.subarray(i * spec.tileBytes, (i + 1) * spec.tileBytes), plgcDataOffset + glyphIndex * spec.tileBytes);
    const w = spec.widths[i];
    const hdwcAt = hdwcDataOffset + glyphIndex * 3;
    out[hdwcAt] = 0; // leftBearing
    out[hdwcAt + 1] = w; // glyphWidth
    out[hdwcAt + 2] = w; // charWidth
  }
  return out;
}

const CODEPOINT_TO_SLOT = new Map<number, number>(INAZUMA_ARABIC_CODEPOINTS.map((cp, i) => [cp, i]));

/** The one raw byte (as a 1-character string) the patched game draws `cp` as, or null if it has no glyph yet. */
export function inazumaArabicGlyphBytes(cp: number): string | null {
  const slot = CODEPOINT_TO_SLOT.get(cp);
  if (slot === undefined) return null;
  return String.fromCharCode(INAZUMA_ARABIC_BYTES[slot]);
}

/**
 * Arabic punctuation this font carries no glyph for, mapped to the Latin
 * mark every English line already draws with -- no new font slot needed,
 * since these pass straight through the `cp <= 0x7e` check below untouched.
 * Reshaping and BiDi reversal don't touch punctuation, so this can run on
 * either side of them; it runs here because this is the one place that
 * already knows which codepoints this font can and can't draw.
 */
const PUNCTUATION_TO_LATIN: Record<string, string> = {
  "؟": "?", // ؟
  "،": ",", // ،
  "؛": ";", // ؛
  "٫": ".", // ٫ arabic decimal separator
  "…": "...", // …
};

/**
 * `text` (already run through `reshapeArabic`) turned into the raw byte
 * stream this ROM's strings are stored as, one byte per Arabic letter. A
 * presentation form with no glyph yet is left as-is and reported, rather than
 * silently dropped or replaced with something misleading.
 */
export function encodeInazumaArabicText(shapedText: string): { text: string; missing: string[] } {
  let out = "";
  const missing = new Set<string>();
  for (const raw of shapedText) {
    const ch = PUNCTUATION_TO_LATIN[raw] ?? raw;
    const cp = ch.codePointAt(0)!;
    if (cp <= 0x7e) {
      out += ch;
      continue;
    }
    const bytes = inazumaArabicGlyphBytes(cp);
    if (bytes === null) {
      missing.add(ch);
      out += ch;
      continue;
    }
    out += bytes;
  }
  return { text: out, missing: [...missing] };
}

/** One character this font has no slot for, and how often a line asked for it. */
export interface InazumaUnsupportedCharacter {
  character: string;
  /** `U+0651` — what to show for a character that has nothing to draw. */
  unicode: string;
  count: number;
}

/**
 * Every character `encodeInazumaArabicText` would refuse, counted rather
 * than just named once.
 *
 * The encoder itself only needs to know *that* a line has one, to refuse the
 * whole line rather than write it half-encoded. A translator needs to know
 * *which* character, and how many lines it costs, to find and fix it --
 * this is the same walk with that answer collected instead of thrown away.
 */
export function analyzeInazumaUnsupportedCharacters(shapedText: string): InazumaUnsupportedCharacter[] {
  const found = new Map<string, InazumaUnsupportedCharacter>();
  for (const raw of shapedText) {
    const ch = PUNCTUATION_TO_LATIN[raw] ?? raw;
    const cp = ch.codePointAt(0)!;
    if (cp <= 0x7e || inazumaArabicGlyphBytes(cp) !== null) continue;
    const previous = found.get(ch);
    found.set(ch, previous
      ? { ...previous, count: previous.count + 1 }
      : { character: ch, unicode: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`, count: 1 });
  }
  return [...found.values()];
}
