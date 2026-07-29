/**
 * Mother 3's hand-drawn Arabic as Wolfenstein RPG's glyphs.
 *
 * The TTF path in wolf-glyph-raster.ts rasterises an outline font into a 12x16
 * cell. At that size the pen is thinner than a pixel, so what the rounding
 * keeps is arbitrary and what it drops — the stem of ك, the bowl of ف — is
 * what made the letter readable. No threshold fixes it; the information is
 * gone before the threshold sees it.
 *
 * Mother 3's Arabic has no such problem because nobody rasterised it: the
 * fan-translation team drew every form by hand on the pixel grid. Measured
 * here, the ink of all 130 forms fits in **9 columns by 13 rows** — so in the
 * 12x16 and 13x18 cells the drawing is pasted at its own size, pixel for
 * pixel, and nothing is resampled at all.
 *
 * The two other cells the game ships cannot take it whole: 10x12 is one row
 * short of the ink, and 22x25 would leave the letter at half the cell. For
 * those, `fitSmallCells` decides whether to scale the drawing (nearest
 * neighbour, which costs a hand-drawn font its evenness) or to leave the cell
 * to the TTF path.
 *
 * Everything about joining — which side connects, running that stroke out to
 * the cell edge — is shared with the TTF path, because it is a property of
 * this engine's fixed-cell advance and not of where the pixels came from.
 */

import { M3_ARABIC_FONT_B64, M3_ARABIC_WIDTHS_B64 } from "@/lib/mother3/m3-arabic-font";
import { ARABIC_CHAR_TO_CODE } from "@/lib/mother3/m3-arabic-table";
import { M3_DRAWN_FORMS } from "./m3-extra-forms";
import { rasteriseWolfGlyphs } from "./wolf-glyph-raster";
import { arabicFormJoining } from "@/lib/risen/arabic-shaper";
import {
  parseWolfFont,
  serialiseWolfFont,
  drawGlyphIntoCell,
  wolfInkStyle,
  type WolfGlyphBitmap,
} from "./wolf-font";
import { wolfFontSlots } from "./wolf-charmap";

/** Mother 3 stores 16x16 glyphs, 1bpp, two bytes per row. */
const M3_GLYPH_SIZE = 16;
const M3_GLYPH_BYTES = 32;

/**
 * Codes at or above this hold the game's own symbols, not Arabic.
 *
 * The table maps twelve Arabic forms into that range. Read literally, صـ comes
 * out as a small circle and ـصـ as a diagonal — measured on screen in Pokémon
 * before the same forms were drawn by hand.
 */
const M3_SYMBOL_RANGE_START = 0xa0;

/** Where the drawn band sits inside the 16-row box, measured over all forms. */
const INK_TOP = 0;
const INK_BOTTOM = 12;
const INK_ROWS = INK_BOTTOM - INK_TOP + 1;

/** Row the letters are seated on inside that band. */
const M3_BASELINE = 7;

export interface CellSize {
  width: number;
  height: number;
}

/** What to do with a cell the drawing does not fit at its own size. */
export type WolfM3Fit = "scale" | "skip";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cached: { font: Uint8Array; widths: Uint8Array } | null = null;
function m3Data() {
  if (!cached) {
    cached = { font: b64ToBytes(M3_ARABIC_FONT_B64), widths: b64ToBytes(M3_ARABIC_WIDTHS_B64) };
  }
  return cached;
}

function m3Glyph(code: number): boolean[][] {
  const { font } = m3Data();
  const off = code * M3_GLYPH_BYTES;
  const rows: boolean[][] = [];
  for (let y = 0; y < M3_GLYPH_SIZE; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < M3_GLYPH_SIZE; x++) {
      row.push(((font[off + y * 2 + (x >> 3)] >> (7 - (x & 7))) & 1) === 1);
    }
    rows.push(row);
  }
  return rows;
}

/** The drawing for one presentation form, or null when there is none. */
export function m3Form(codepoint: number): { rows: boolean[][]; width: number } | null {
  const code = ARABIC_CHAR_TO_CODE[String.fromCodePoint(codepoint)];
  if (code !== undefined && code < M3_SYMBOL_RANGE_START) {
    const { widths } = m3Data();
    return { rows: m3Glyph(code), width: widths[code] || 8 };
  }
  const drawn = M3_DRAWN_FORMS[codepoint];
  if (drawn) return { rows: drawn.rows, width: drawn.width };
  // ض isolated is ص isolated with the dot over its loop — the one form built
  // rather than drawn, because its base is already in the font.
  if (codepoint === 0xfebd) {
    const sad = ARABIC_CHAR_TO_CODE[String.fromCodePoint(0xfeb9)];
    if (sad !== undefined && sad < M3_SYMBOL_RANGE_START) {
      const rows = m3Glyph(sad).map((r) => [...r]);
      rows[2][6] = true;
      const { widths } = m3Data();
      return { rows, width: widths[sad] || 8 };
    }
  }
  return null;
}

/**
 * Turns a drawing into the coverage box `placeGlyphInCell` expects.
 *
 * The box is the **advance** box, not the ink box: the connecting stroke runs
 * to the edge of the advance, and trimming to ink would cut off the very thing
 * that joins.
 */
function toCoverage(
  rows: boolean[][],
  width: number,
  boxH: number,
  scale: number
): { cov: Uint8Array; w: number; h: number; baseline: number } {
  const w = Math.max(1, Math.round(width * scale));
  const h = boxH;
  const cov = new Uint8Array(w * h);
  // The band is seated at the bottom of the box, so the tails keep their room
  // and the baseline lands the same distance above it in every cell.
  const top = h - Math.round(INK_ROWS * scale);
  for (let y = 0; y < h; y++) {
    const srcY = INK_TOP + Math.floor((y - top) / scale);
    if (srcY < INK_TOP || srcY > INK_BOTTOM) continue;
    for (let x = 0; x < w; x++) {
      const srcX = Math.floor(x / scale);
      if (srcX < width && rows[srcY][srcX]) cov[y * w + x] = 255;
    }
  }
  return { cov, w, h, baseline: top + Math.round((M3_BASELINE - INK_TOP) * scale) };
}

function key(cell: CellSize, cp: number): string {
  return `${cell.width}x${cell.height}:${cp}`;
}

/** Blank left on a side that does not join, so two of them do not read as a
 *  word space — the same one pixel the TTF path settled on in-game. */
const EDGE_MARGIN = 1;
/** How far from the baseline a stroke may sit and still be the join. */
const JOIN_REACH = 1;

/**
 * Puts one drawing in its cell and runs its joining stroke out to the edge.
 *
 * This engine advances a whole cell per byte, so a letter that stops short of
 * the cell edge leaves a gap and the word comes apart. The stroke that has to
 * reach the edge is the one on the baseline; extending every row of edge ink
 * instead turns the dots of ت and the stem of ا into bars across the cell —
 * measured, and visible as solid blocks in the first sheet rendered here.
 *
 * Which side joins is not read off the drawing at all. It is what the shaper
 * already decided when it picked this form: a final or medial form joins
 * toward the letter before it, which in a right-to-left line sits to its
 * right; an initial or medial form joins toward the letter after it, on its
 * left.
 */
function placeM3Glyph(
  cov: Uint8Array,
  w: number,
  h: number,
  cell: CellSize,
  baseline: number,
  codepoint: number
): WolfGlyphBitmap {
  const join = arabicFormJoining(codepoint);
  const right = join.before;
  const left = join.after;
  const coverage = new Uint8Array(cell.width * cell.height);
  const spare = Math.max(0, cell.width - w);
  let ox: number;
  if (left && !right) ox = Math.max(0, spare - EDGE_MARGIN);
  else if (right && !left) ox = Math.min(spare, EDGE_MARGIN);
  else ox = Math.floor(spare / 2);

  for (let y = 0; y < h && y + 1 < cell.height; y++) {
    for (let x = 0; x < w && ox + x < cell.width; x++) {
      coverage[(y + 1) * cell.width + ox + x] = cov[y * w + x];
    }
  }

  const runOut = (edgeX: number, from: number, to: number) => {
    for (let y = Math.max(0, baseline - JOIN_REACH); y <= baseline + JOIN_REACH && y < h; y++) {
      if (cov[y * w + edgeX] === 0) continue;
      if (y + 1 >= cell.height) continue;
      for (let x = from; x < to; x++) coverage[(y + 1) * cell.width + x] = 255;
    }
  };
  if (left) runOut(0, 0, ox);
  if (right) runOut(w - 1, ox + w, cell.width);
  return { width: cell.width, height: cell.height, coverage };
}

/**
 * Draws every form into every cell size it fits.
 *
 * A cell whose inner height is at least the 13 drawn rows takes the glyph
 * unscaled — the whole point. A cell that is taller has the glyph scaled up so
 * it does not sit lost in the middle, and a cell that is shorter has to lose
 * rows; both only happen when `fit` allows it, and the cell is otherwise left
 * out of the result for the caller to fill from elsewhere.
 */
export function buildM3WolfGlyphs(
  cells: CellSize[],
  codepoints: number[],
  fit: WolfM3Fit = "scale"
): Map<string, WolfGlyphBitmap> {
  const out = new Map<string, WolfGlyphBitmap>();
  for (const cell of cells) {
    const innerH = Math.max(1, cell.height - 2);
    // Native size whenever the drawing fits with a little room to spare; the
    // 22x25 title cell is more than twice the band and would leave the letter
    // stranded, so it is scaled toward the cell instead.
    const scale = innerH >= INK_ROWS && innerH < INK_ROWS * 1.5 ? 1 : innerH / INK_ROWS;
    if (scale !== 1 && fit === "skip") continue;
    for (const cp of codepoints) {
      const form = m3Form(cp);
      if (!form) continue;
      const { cov, w, h, baseline } = toCoverage(form.rows, form.width, innerH, scale);
      const clipped = Math.min(w, cell.width);
      if (clipped < w) {
        const narrow = new Uint8Array(clipped * h);
        for (let y = 0; y < h; y++) narrow.set(cov.subarray(y * w, y * w + clipped), y * clipped);
        out.set(key(cell, cp), placeM3Glyph(narrow, clipped, h, cell, baseline, cp));
      } else {
        out.set(key(cell, cp), placeM3Glyph(cov, w, h, cell, baseline, cp));
      }
    }
  }
  return out;
}

/** How a cell will be filled, for telling the user before anything is built. */
export function m3CellFit(cell: CellSize): "native" | "scaled" {
  const innerH = Math.max(1, cell.height - 2);
  return innerH >= INK_ROWS && innerH < INK_ROWS * 1.5 ? "native" : "scaled";
}

export interface WolfM3BuildOptions {
  /** `scale` draws every cell from Mother 3; `skip` leaves the misfitting
   *  cells — the 10x12 menu font and the 22x25 title — to the TTF. */
  fit: WolfM3Fit;
  /** Required for `skip`, which has cells left over for the TTF to fill. */
  fontBytes?: ArrayBuffer;
  widthFactor?: number;
  descenderScale?: number;
}

/**
 * Rewrites the game's font bitmaps with Mother 3's Arabic.
 *
 * Only the pixel data changes; the header, palette and dimensions are copied
 * through, because the engine reads the cell size from the dimensions.
 */
export async function buildWolfM3Fonts(
  originals: Record<string, Uint8Array>,
  options: WolfM3BuildOptions
): Promise<Record<string, Uint8Array>> {
  const slots = wolfFontSlots();
  const codepoints = slots.filter((cp): cp is number => cp !== null);
  const parsed = Object.entries(originals).map(([name, bytes]) => ({ name, font: parseWolfFont(bytes) }));

  const cells: CellSize[] = [];
  for (const { font } of parsed) {
    const cell = { width: font.cellWidth, height: font.cellHeight };
    if (!cells.some((c) => c.width === cell.width && c.height === cell.height)) cells.push(cell);
  }

  const glyphs = buildM3WolfGlyphs(cells, codepoints, options.fit);
  const left = cells.filter((c) => !glyphs.has(key(c, codepoints[0])));
  if (left.length > 0) {
    if (!options.fontBytes) {
      throw new Error("هذه المقاسات تحتاج خط ‎.ttf‎ لأن أشكال ماذر٣ لا تسعها بحجمها الأصلي");
    }
    const fromTtf = await rasteriseWolfGlyphs(
      options.fontBytes,
      left,
      codepoints,
      options.widthFactor,
      options.descenderScale
    );
    for (const [k, v] of fromTtf) glyphs.set(k, v);
  }

  const out: Record<string, Uint8Array> = {};
  for (const { name, font } of parsed) {
    const ink = wolfInkStyle(font);
    const cell = { width: font.cellWidth, height: font.cellHeight };
    slots.forEach((cp, slot) => {
      if (cp === null) return;
      const glyph = glyphs.get(key(cell, cp));
      if (glyph) drawGlyphIntoCell(font, slot, glyph, ink);
    });
    out[name] = serialiseWolfFont(font);
  }
  return out;
}
