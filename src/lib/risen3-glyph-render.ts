/**
 * Drawing the Arabic presentation forms for a Risen 3 font — browser only.
 *
 * Kept apart from risen3-arabic-font-gen.ts, which does everything else and can
 * be tested without a DOM. All this does is turn a TTF into one cell of
 * coverage bytes per form; the field, the packing and the records happen there.
 *
 * Every cell is the same height and shares one baseline, because the engine
 * draws a cell top-aligned on a fixed line. Cropping each glyph to its own ink
 * was tried in Risen 2 and every letter hung from the top of the line.
 */

import { getRisenArabicGlyphCodepoints, RISEN_ARABIC_QMARK_ALIAS } from "./risen/arabic-shaper";
import type { DrawnGlyph, Risen3CellMetrics } from "./risen3-arabic-font-gen";

/** The one codepoint stored under a different character than it draws. */
const DRAW_AS: Record<number, number> = { [RISEN_ARABIC_QMARK_ALIAS]: 0x061f };

/**
 * Cells are exactly as tall as the font's own, not a pixel more.
 *
 * The room under the baseline is already there — `Linux Biolinum O_30` puts its
 * line at 33 of 44, leaving 11 for the tails of g and y — and Arabic's tails
 * use the same room. Adding to the height would also put every glyph out of
 * reach of the cells this tool reuses, which are the font's own size.
 */
const DESCENT_EXTRA = 0;
/** Blank columns kept on each side so the field has room to fall to zero. */
const SIDE_PADDING = 3;

export interface Risen3RenderOptions {
  /** Point size to draw at. Defaults to what fills the cell without clipping. */
  fontSize?: number;
  /** Restrict to these codepoints; everything the shaper can emit otherwise. */
  codepoints?: number[];
}

/**
 * Largest size at which the reference letters still fit the cell.
 *
 * Fitted rather than assumed: an Arabic face's ascent and descent differ from
 * the Latin face the cell was built for, and a size that fits Amiri clips
 * Cairo. The probe uses letters with the tallest and deepest parts.
 */
function fitFontSize(ctx: CanvasRenderingContext2D, family: string, cellHeight: number): number {
  const probe = "طكلمجحيبا";
  for (let size = Math.round(cellHeight * 1.1); size >= 6; size--) {
    ctx.font = `${size}px "${family}"`;
    const m = ctx.measureText(probe);
    const above = m.actualBoundingBoxAscent ?? size;
    const below = m.actualBoundingBoxDescent ?? 0;
    if (above + below <= cellHeight + DESCENT_EXTRA) return size;
  }
  return 6;
}

export async function renderArabicGlyphsForRisen3(
  fontBytes: ArrayBuffer,
  metrics: Risen3CellMetrics,
  options: Risen3RenderOptions = {}
): Promise<{ glyphs: DrawnGlyph[]; fontSize: number }> {
  const family = `Risen3Arabic${Math.random().toString(36).slice(2, 8)}`;
  const face = new FontFace(family, fontBytes);
  await face.load();
  document.fonts.add(face);

  try {
    const cellH = metrics.cellHeight + DESCENT_EXTRA;
    const canvas = document.createElement("canvas");
    canvas.height = cellH;
    canvas.width = Math.max(64, metrics.cellHeight * 3);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("تعذّر إنشاء سياق Canvas لرسم الحروف");

    const fontSize = options.fontSize ?? fitFontSize(ctx, family, metrics.cellHeight);
    const codepoints = options.codepoints ?? getRisenArabicGlyphCodepoints();
    const glyphs: DrawnGlyph[] = [];

    for (const codepoint of codepoints) {
      const ch = String.fromCodePoint(DRAW_AS[codepoint] ?? codepoint);
      ctx.font = `${fontSize}px "${family}"`;
      const advance = Math.max(1, Math.round(ctx.measureText(ch).width));
      const cellW = advance + 2 * SIDE_PADDING;
      if (canvas.width < cellW) canvas.width = cellW;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // The font must be set again: resizing a canvas resets its context.
      ctx.font = `${fontSize}px "${family}"`;
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(ch, SIDE_PADDING, metrics.baseline);

      const image = ctx.getImageData(0, 0, cellW, cellH);
      const coverage = new Uint8Array(cellW * cellH);
      let inked = false;
      for (let i = 0; i < coverage.length; i++) {
        const a = image.data[i * 4 + 3];
        coverage[i] = a;
        if (a >= 128) inked = true;
      }
      // A form with no ink — a few marks draw nothing — still carries its
      // advance, so the engine spaces the word correctly.
      glyphs.push(
        inked
          ? { codepoint, width: cellW, height: cellH, coverage, advance }
          : { codepoint, width: 0, height: 0, coverage: new Uint8Array(0), advance }
      );
    }
    return { glyphs, fontSize };
  } finally {
    document.fonts.delete(face);
  }
}
