/**
 * Patches Arabic glyphs into an Inazuma Eleven NFTR font, and encodes Arabic
 * text into the byte codes those glyphs answer to.
 *
 * The dialogue text in this ROM is Shift-JIS: single ASCII bytes, or a
 * lead/trail byte pair for anything Japanese. Its fonts' character map
 * (PAMC) already routes the hiragana pair range `0x829F`-`0x82F1` (83 codes)
 * straight to glyph indices 366-448 -- and an English-only ROM never prints
 * hiragana. Those 83 glyphs are overwritten with Arabic in place: same
 * indices, same widths-table slot, same CMAP entry, so the font's block
 * sizes and every pointer between them stay byte-identical. No CMAP block is
 * added or resized, which is what makes this safe without having reverse
 * engineered the NFTR header's own internal offsets.
 *
 * `INAZUMA_ARABIC_CODEPOINTS[i]` owns hiragana slot `i`: Shift-JIS code
 * `0x829F + i`, glyph index `366 + i`.
 */
import {
  INAZUMA_FONT12_GLYPHS_B64,
  INAZUMA_FONT12_WIDTHS,
  INAZUMA_FONT8_GLYPHS_B64,
  INAZUMA_FONT8_WIDTHS,
  INAZUMA_ARABIC_CODEPOINTS,
} from "./inazuma-arabic-glyphs";

const HIRAGANA_BASE_CODE = 0x829f;
const HIRAGANA_BASE_GLYPH = 366;

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
    const glyphIndex = HIRAGANA_BASE_GLYPH + i;
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

/** The two raw bytes (as one 2-character string) this font draws `cp` as, or null if it has no glyph yet. */
export function inazumaArabicGlyphBytes(cp: number): string | null {
  const slot = CODEPOINT_TO_SLOT.get(cp);
  if (slot === undefined) return null;
  const code = HIRAGANA_BASE_CODE + slot;
  return String.fromCharCode((code >> 8) & 0xff, code & 0xff);
}

/**
 * `text` (already run through `reshapeArabic`) turned into the raw
 * Shift-JIS-shaped byte stream this ROM's strings are stored as. A
 * presentation form with no glyph yet is left as-is and reported, rather than
 * silently dropped or replaced with something misleading.
 */
export function encodeInazumaArabicText(shapedText: string): { text: string; missing: string[] } {
  let out = "";
  const missing = new Set<string>();
  for (const ch of shapedText) {
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
