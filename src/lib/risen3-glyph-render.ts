/**
 * Drawing the Arabic presentation forms for a Risen 3 font — browser only.
 *
 * Kept apart from risen3-arabic-font-gen.ts, which does everything else and can
 * be tested without a DOM. All this does is turn a TTF into one box of coverage
 * bytes per form, with the two bearings that place it; the field, the packing
 * and the records happen there.
 *
 * A box is the letter's own ink plus the margin the font's packer leaves, not a
 * uniform cell — the game's own boxes run from 18 to 57 pixels tall in one font.
 * What puts a letter on the writing line is the top bearing, and getting that
 * wrong hangs every letter from the top of the line.
 */

import { getRisenArabicGlyphCodepoints, RISEN_ARABIC_QMARK_ALIAS } from "./risen/arabic-shaper";
import type { DrawnGlyph, Risen3Metrics } from "./risen3-arabic-font-gen";

/** The one codepoint stored under a different character than it draws. */
const DRAW_AS: Record<number, number> = { [RISEN_ARABIC_QMARK_ALIAS]: 0x061f };

export interface Risen3RenderOptions {
  /** Point size to draw at. Defaults to what matches the font's own letters. */
  fontSize?: number;
  /** Restrict to these codepoints; everything the shaper can emit otherwise. */
  codepoints?: number[];
}

/**
 * The size at which this Arabic face rises and falls like the font it joins.
 *
 * Fitted rather than assumed: an Arabic face's proportions differ from the
 * Latin one, and a size that suits Amiri leaves Cairo too tall. The probe holds
 * the letters that reach highest and dip lowest, and the target is the room the
 * font's own boxes take — its tallest box, less the margin on each side.
 */
function fitFontSize(ctx: CanvasRenderingContext2D, family: string, metrics: Risen3Metrics): number {
  const probe = "طكلمجحيبا";
  const room = Math.max(8, metrics.maxBoxHeight - 2 * metrics.margin);
  for (let size = Math.round(room * 1.6); size >= 6; size--) {
    ctx.font = `${size}px "${family}"`;
    const m = ctx.measureText(probe);
    const above = m.actualBoundingBoxAscent ?? size;
    const below = m.actualBoundingBoxDescent ?? 0;
    if (above + below <= room) return size;
  }
  return 6;
}

export async function renderArabicGlyphsForRisen3(
  fontBytes: ArrayBuffer,
  metrics: Risen3Metrics,
  options: Risen3RenderOptions = {}
): Promise<{ glyphs: DrawnGlyph[]; fontSize: number }> {
  const family = `Risen3Arabic${Math.random().toString(36).slice(2, 8)}`;
  const face = new FontFace(family, fontBytes);
  await face.load();
  document.fonts.add(face);

  try {
    // Roomy scratch space: the glyph is found inside it and cropped after.
    const pad = metrics.margin + 4;
    const height = metrics.maxBoxHeight + 4 * pad;
    const baselineY = Math.round(height * 0.7);
    const canvas = document.createElement("canvas");
    canvas.height = height;
    canvas.width = metrics.maxBoxHeight * 4;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("تعذّر إنشاء سياق Canvas لرسم الحروف");

    const fontSize = options.fontSize ?? fitFontSize(ctx, family, metrics);
    const codepoints = options.codepoints ?? getRisenArabicGlyphCodepoints();
    const glyphs: DrawnGlyph[] = [];

    for (const codepoint of codepoints) {
      const ch = String.fromCodePoint(DRAW_AS[codepoint] ?? codepoint);
      ctx.font = `${fontSize}px "${family}"`;
      const advance = Math.max(1, Math.round(ctx.measureText(ch).width));

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px "${family}"`;
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(ch, pad, baselineY);

      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          if (image.data[(y * canvas.width + x) * 4 + 3] >= 128) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) {
        // A form that draws nothing — a few marks do — still carries its
        // advance, so the engine spaces the word correctly.
        glyphs.push({ codepoint, width: 0, height: 0, coverage: new Uint8Array(0), advance, leftBearing: metrics.leftBearing, topBearing: 0 });
        continue;
      }

      // The box is the ink plus the same margin the font's own boxes carry.
      const x0 = minX - metrics.margin;
      const y0 = minY - metrics.margin;
      const w = maxX - minX + 1 + 2 * metrics.margin;
      const h = maxY - minY + 1 + 2 * metrics.margin;
      const coverage = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const sx = x0 + x;
          const sy = y0 + y;
          if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) continue;
          coverage[y * w + x] = image.data[(sy * canvas.width + sx) * 4 + 3];
        }
      }
      glyphs.push({
        codepoint,
        width: w,
        height: h,
        coverage,
        advance,
        // Where the pen was, relative to the box: the same shape the font's own
        // records use, so the engine places these exactly as it places its own.
        leftBearing: x0 - pad,
        topBearing: metrics.baseline - (baselineY - y0),
      });
    }
    return { glyphs, fontSize };
  } finally {
    document.fonts.delete(face);
  }
}
