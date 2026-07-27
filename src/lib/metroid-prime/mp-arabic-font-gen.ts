/**
 * Rasterizes Arabic text into real glyph bitmaps for Metroid Prime
 * Remastered's FONT format, using Canvas 2D + the project's existing
 * Arabic shaping (reshapeArabic).
 *
 * Unlike Risen's font format (uniform-height cells), MP's glyph records
 * store standard per-glyph font metrics — confirmed by inspecting real
 * records from the game's own font: `y0` is the ascent (baseline to ink
 * top), `height - y0` is the descent, and `x0` is the left-side bearing
 * (can be negative). That maps directly onto a tight ink-bounding-box scan
 * of a canvas the glyph was drawn onto — no uniform-cell fitting needed.
 */
import { reshapeArabic, hasArabicChars } from "@/lib/arabic-processing";

export interface RenderedMpGlyph {
  code: number;
  x0: number;
  y0: number;
  width: number;
  height: number;
  advance: number;
  /** Grayscale (R8) coverage, row-major top-down, width*height bytes. */
  pixels: Uint8Array;
}

function inkBoundingBox(data: Uint8ClampedArray, width: number, height: number) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > 10) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

/** Sources selected codepoints from a second TTF/OTF instead of the main
 *  one — mirrors Risen's per-character alternate-font override. */
export interface MpAlternateFontOverride {
  fontBytes: ArrayBuffer;
  codepoints: Set<number>;
}

/** Expands a base Arabic letter into every contextual presentation-form
 * codepoint it can shape into (isolated/initial/medial/final) — replacing a
 * letter must replace ALL its forms or joined text mixes styles mid-word.
 * Reuses reshapeArabic itself (with a neutral connecting neighbor, ب) rather
 * than needing direct access to its private shaping table. */
export function getMpPresentationForms(baseChar: string): number[] {
  const out = new Set<number>();
  const neighbor = "ب";
  out.add(reshapeArabic(baseChar).charCodeAt(0));
  out.add(reshapeArabic(baseChar + neighbor).charCodeAt(0));
  out.add(reshapeArabic(neighbor + baseChar).charCodeAt(1));
  out.add(reshapeArabic(neighbor + baseChar + neighbor).charCodeAt(1));
  return [...out];
}

/**
 * Shapes `text` (reshapeArabic joins letters by context) and rasterizes
 * every unique resulting codepoint at `fontSizePx` using `fontBytes`
 * (a TTF/OTF) — except codepoints listed in `override.codepoints`, which are
 * sourced from `override.fontBytes` instead, both at the same declared
 * size. Returns one glyph per unique codepoint (space excluded — the game
 * font already has one). Browser-only (FontFace + Canvas 2D).
 */
export async function renderArabicGlyphsForMp(
  fontBytes: ArrayBuffer,
  text: string,
  fontSizePx: number,
  override?: MpAlternateFontOverride
): Promise<{ shapedText: string; glyphs: RenderedMpGlyph[] }> {
  if (!hasArabicChars(text)) throw new Error("النص المُدخل لا يحتوي على حروف عربية");
  const shaped = reshapeArabic(text);
  const codepoints = [...new Set([...shaped].map((ch) => ch.charCodeAt(0)))].filter((cp) => cp !== 0x20);
  if (codepoints.length === 0) throw new Error("لا توجد حروف قابلة للرسم في هذا النص");
  const glyphs = await renderMpGlyphsForCodepoints(fontBytes, codepoints, fontSizePx, override);
  return { shapedText: shaped, glyphs };
}

/**
 * Rasterizes an explicit list of codepoints — the same drawing path
 * `renderArabicGlyphsForMp` uses, but without deriving the list from sample
 * text. Used to insert the COMPLETE Arabic set in one go (every presentation
 * form the build-time shaper can emit), so a translation can never hit a
 * codepoint the font happens to lack just because it wasn't in whatever
 * sample the user typed.
 */
export async function renderMpGlyphsForCodepoints(
  fontBytes: ArrayBuffer,
  codepoints: number[],
  fontSizePx: number,
  override?: MpAlternateFontOverride
): Promise<RenderedMpGlyph[]> {
  const fontFace = new FontFace("MpArabicGen", fontBytes);
  await fontFace.load();
  document.fonts.add(fontFace);
  let altFace: FontFace | null = null;
  if (override && override.codepoints.size > 0) {
    altFace = new FontFace("MpArabicGenAlt", override.fontBytes);
    await altFace.load();
    document.fonts.add(altFace);
  }
  try {
    const pad = Math.ceil(fontSizePx * 0.6);
    const canvas = document.createElement("canvas");
    const originX = pad;
    const baselineY = pad + fontSizePx;
    canvas.width = fontSizePx * 3;
    canvas.height = baselineY + pad;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذّر إنشاء سياق Canvas 2D لرسم الحروف العربية");

    const setupCtx = (family: string) => {
      ctx.font = `${fontSizePx}px ${family}`;
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#fff";
    };

    const glyphs: RenderedMpGlyph[] = [];
    for (const cp of codepoints) {
      const useAlt = altFace !== null && override!.codepoints.has(cp);
      const family = useAlt ? "MpArabicGenAlt" : "MpArabicGen";
      setupCtx(family);
      const ch = String.fromCharCode(cp);
      const advance = Math.max(1, Math.round(ctx.measureText(ch).width));

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillText(ch, originX, baselineY);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const bbox = inkBoundingBox(imageData.data, canvas.width, canvas.height);
      if (!bbox) {
        glyphs.push({ code: cp, x0: 0, y0: 0, width: 0, height: 0, advance, pixels: new Uint8Array(0) });
        continue;
      }
      const width = bbox.maxX - bbox.minX + 1;
      const height = bbox.maxY - bbox.minY + 1;
      const pixels = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixels[y * width + x] = imageData.data[((bbox.minY + y) * canvas.width + (bbox.minX + x)) * 4 + 3];
        }
      }
      glyphs.push({
        code: cp,
        x0: bbox.minX - originX,
        y0: baselineY - bbox.minY,
        width,
        height,
        advance,
        pixels,
      });
    }
    return glyphs;
  } finally {
    document.fonts.delete(fontFace);
    if (altFace) document.fonts.delete(altFace);
  }
}
