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

/**
 * `FONT12.NFTR` and `FONT12N.NFTR` are byte-identical in shape (11x12, 1bpp).
 *
 * `tightSpace` narrows the space: see `tightenSpace`. FONT12N's space is a
 * full 11-pixel cell -- a fixed-width font, whose space is deliberately as
 * wide as a letter -- so it is left alone there.
 */
export function patchInazumaFont12(nftr: Uint8Array, options: { tightSpace?: boolean } = {}): Uint8Array {
  const out = patchGlyphSlots(nftr, FONT12_SPEC);
  return options.tightSpace === false ? out : tightenSpace(out);
}

export function patchInazumaFont8(nftr: Uint8Array): Uint8Array {
  return tightenSpace(patchGlyphSlots(nftr, FONT8_SPEC));
}

/**
 * Takes the left bearing off the space, leaving its advance.
 *
 * This font's space is the only glyph with a bearing (FONT12: 3 bearing +
 * 3 advance), and the game adds the two: every word gap measured on a real
 * screenshot of Arabic dialogue is 6 pixels. English letters carry their own
 * side spacing, so 6 reads as one space there; Arabic letters join edge to
 * edge, so beside them the same 6 pixels read as a double space.
 */
export function tightenSpace(nftr: Uint8Array): Uint8Array {
  const out = nftr.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  let hdwc = -1;
  const cmaps: number[] = [];
  for (let p = 0x10; p < out.length - 8; ) {
    const kind = String.fromCharCode(out[p], out[p + 1], out[p + 2], out[p + 3]);
    const size = view.getUint32(p + 4, true);
    if (size === 0) break;
    if (kind === "HDWC") hdwc = p + 8;
    if (kind === "PAMC") cmaps.push(p + 8);
    p += size;
  }
  if (hdwc < 0) return out;
  let glyph = -1;
  for (const at of cmaps) {
    const first = view.getUint16(at, true), last = view.getUint16(at + 2, true), type = view.getUint32(at + 4, true);
    if (0x20 < first || 0x20 > last) continue;
    if (type === 0) glyph = view.getUint16(at + 12, true) + 0x20 - first;
    else if (type === 1) glyph = view.getUint16(at + 12 + (0x20 - first) * 2, true);
    else {
      const n = view.getUint16(at + 12, true);
      for (let i = 0; i < n; i++) if (view.getUint16(at + 14 + i * 4, true) === 0x20) glyph = view.getUint16(at + 16 + i * 4, true);
    }
  }
  const firstGlyph = view.getUint16(hdwc, true);
  if (glyph < firstGlyph) return out;
  out[hdwc + 8 + (glyph - firstGlyph) * 3] = 0; // leftBearing
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

/** The two raw bytes (as one 2-character string) this font draws `cp` as, or null if it has no glyph yet. */
export function inazumaArabicGlyphBytes(cp: number): string | null {
  const slot = CODEPOINT_TO_SLOT.get(cp);
  if (slot === undefined) return null;
  const code = INAZUMA_SHIFT_JIS_CODES[slot];
  return String.fromCharCode((code >> 8) & 0xff, code & 0xff);
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
 * `text` (already run through `reshapeArabic`) turned into the raw
 * Shift-JIS-shaped byte stream this ROM's strings are stored as. A
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
