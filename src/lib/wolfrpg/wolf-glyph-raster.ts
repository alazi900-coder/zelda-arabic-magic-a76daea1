/**
 * Draws the Arabic presentation forms into Wolfenstein RPG's fixed cells.
 *
 * Three measured facts shape everything here:
 *
 *   1. The engine advances a whole cell per byte. Measured on screen: the four
 *      menu rows fit a 56.9-58.8 px grid, and the space inside "لعبة جديدة"
 *      landed exactly on cell 5. Letter spacing is therefore not ours to
 *      choose, and a glyph has to reach the cell edge or the word comes apart.
 *   2. The cell is Latin-shaped. Fitted to the cell height, the median Arabic
 *      form is 5-8 px wide in a 12 px cell — the cell is ~1.7x wider than the
 *      letter wants to be. Stretching every glyph to close that gap (the first
 *      build in-game) turned ا ر د و into blocks, squeezed ص ع س, and
 *      distorted isolated ﺕ until its cup closed into a loop reading ة.
 *   3. An Arabic form joins on the baseline and nowhere else.
 *
 * So the letter is drawn at its own proportions, widened by a fixed factor
 * (1.6 was chosen by rendering candidates and comparing them in-game), and only
 * the joining stroke is run out to the cell edge. Which side joins is measured
 * — a form whose ink reaches the edge of its advance box connects there — but
 * only the run of edge ink sitting on the baseline counts: taking every run
 * instead turns the dots of ت and ب and the hamza of أ into horizontal bars
 * across the cell, which is exactly what the second in-game build showed.
 *
 * Height is fitted to the union ink box of the Arabic forms rather than to the
 * font's ascent+descent, which carries Latin room this text never uses.
 */

import {
  parseWolfFont,
  serialiseWolfFont,
  drawGlyphIntoCell,
  wolfInkStyle,
  type WolfGlyphBitmap,
} from "./wolf-font";
import { wolfFontSlots } from "./wolf-charmap";

/** How much wider than its natural proportions a glyph is drawn. */
export const WOLF_DEFAULT_WIDTH_FACTOR = 1.6;

/** Ink low enough to catch the thin end of an antialiased connector. */
const EDGE_INK = 64;
/** Supersampling factor; the cells are 10-22 px, so shapes need the room. */
const SS = 8;
const PAD = 32;
const PROBE_SIZE = 200;

interface CellSize {
  width: number;
  height: number;
}

function key(cell: CellSize, codepoint: number): string {
  return `${cell.width}x${cell.height}:${codepoint}`;
}

/** Contiguous vertical runs of ink in one column of a coverage bitmap. */
function edgeRuns(cov: Uint8Array, w: number, h: number, x: number): [number, number][] {
  const runs: [number, number][] = [];
  let start: number | null = null;
  for (let y = 0; y < h; y++) {
    if (cov[y * w + x] >= EDGE_INK) {
      if (start === null) start = y;
    } else if (start !== null) {
      runs.push([start, y - 1]);
      start = null;
    }
  }
  if (start !== null) runs.push([start, h - 1]);
  return runs;
}

/**
 * The joining stroke at one edge, or null when this side does not join.
 * Only the run of edge ink on the baseline is a connector; the dots and the
 * hamza touch the advance-box edge too and must not be extended.
 */
export function findConnector(
  cov: Uint8Array,
  w: number,
  h: number,
  x: number,
  baseline: number
): [number, number] | null {
  let best: { d: number; run: [number, number] } | null = null;
  for (const run of edgeRuns(cov, w, h, x)) {
    const d =
      run[0] <= baseline && baseline <= run[1]
        ? 0
        : Math.min(Math.abs(run[0] - baseline), Math.abs(run[1] - baseline));
    if (d <= 2 && (best === null || d < best.d)) best = { d, run };
  }
  return best ? best.run : null;
}

/**
 * Centres a scaled glyph in its cell and runs its joining strokes out to the
 * cell edges. Kept free of canvas so the join rule can be tested directly.
 *
 * `glyph` is `w * h` coverage values; `h` is the cell height minus the one-row
 * margin kept top and bottom for the outline the font style adds later.
 */
export function placeGlyphInCell(
  glyph: Uint8Array,
  w: number,
  h: number,
  cellW: number,
  cellH: number,
  baseline: number
): WolfGlyphBitmap {
  const coverage = new Uint8Array(cellW * cellH);
  const ox = Math.max(0, Math.floor((cellW - w) / 2));
  for (let y = 0; y < h && y + 1 < cellH; y++) {
    for (let x = 0; x < w && ox + x < cellW; x++) {
      coverage[(y + 1) * cellW + ox + x] = glyph[y * w + x];
    }
  }
  const left = findConnector(glyph, w, h, 0, baseline);
  if (left) {
    for (let y = left[0]; y <= left[1] && y + 1 < cellH; y++) {
      for (let x = 0; x < ox; x++) coverage[(y + 1) * cellW + x] = 255;
    }
  }
  const right = findConnector(glyph, w, h, w - 1, baseline);
  if (right) {
    for (let y = right[0]; y <= right[1] && y + 1 < cellH; y++) {
      for (let x = ox + w; x < cellW; x++) coverage[(y + 1) * cellW + x] = 255;
    }
  }
  return { width: cellW, height: cellH, coverage };
}

function context(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("تعذّر إنشاء سياق رسم Canvas");
  return ctx;
}

interface Union {
  ascent: number;
  descent: number;
}

function measureUnion(ctx: CanvasRenderingContext2D, codepoints: number[]): Union {
  let ascent = 0;
  let descent = 0;
  for (const cp of codepoints) {
    const m = ctx.measureText(String.fromCodePoint(cp));
    ascent = Math.max(ascent, m.actualBoundingBoxAscent);
    descent = Math.max(descent, m.actualBoundingBoxDescent);
  }
  return { ascent, descent };
}

let familyCounter = 0;

/**
 * Loads a .ttf/.otf and rasterises every codepoint for every cell size.
 * Returns a map keyed `<cellW>x<cellH>:<codepoint>`.
 */
export async function rasteriseWolfGlyphs(
  fontBytes: ArrayBuffer,
  cells: CellSize[],
  codepoints: number[],
  widthFactor = WOLF_DEFAULT_WIDTH_FACTOR
): Promise<Map<string, WolfGlyphBitmap>> {
  const family = `WolfArabicSrc${familyCounter++}`;
  const face = new FontFace(family, fontBytes);
  await face.load();
  document.fonts.add(face);
  try {
    const out = new Map<string, WolfGlyphBitmap>();
    const probe = context(1, 1);
    probe.font = `${PROBE_SIZE}px "${family}"`;
    const probeUnion = measureUnion(probe, codepoints);
    const probeHeight = probeUnion.ascent + probeUnion.descent;
    if (probeHeight <= 0) throw new Error("هذا الخط لا يرسم الأشكال العربية المطلوبة");

    for (const cell of cells) {
      const innerH = Math.max(1, cell.height - 2);
      const size = Math.max(8, Math.round((PROBE_SIZE * innerH * SS) / probeHeight));
      const measurer = context(1, 1);
      measurer.font = `${size}px "${family}"`;
      const union = measureUnion(measurer, codepoints);
      const boxH = Math.ceil(union.ascent + union.descent);
      const scale = innerH / (union.ascent + union.descent);
      const baseline = Math.round(union.ascent * scale);

      for (const cp of codepoints) {
        const ch = String.fromCodePoint(cp);
        const adv = Math.max(1, Math.ceil(measurer.measureText(ch).width));

        const big = context(adv + 2 * PAD, boxH + 2 * PAD);
        big.font = `${size}px "${family}"`;
        big.textBaseline = "alphabetic";
        big.fillStyle = "#fff";
        big.fillText(ch, PAD, PAD + union.ascent);

        // Only the few forms wider than the cell (ـسـ ـصـ ـشـ) get compressed;
        // the rest keep their proportions, which is the point of the rework.
        const w = Math.min(cell.width, Math.max(1, Math.round(adv * scale * widthFactor)));
        const small = context(w, innerH);
        small.imageSmoothingEnabled = true;
        small.imageSmoothingQuality = "high";
        // The advance box, not the ink box: the connecting stroke runs to the
        // edge of the advance, and trimming to ink would cut off the very
        // thing that joins.
        small.drawImage(big.canvas, PAD, PAD, adv, boxH, 0, 0, w, innerH);

        const data = small.getImageData(0, 0, w, innerH).data;
        const glyph = new Uint8Array(w * innerH);
        for (let i = 0; i < glyph.length; i++) glyph[i] = data[i * 4 + 3];
        out.set(key(cell, cp), placeGlyphInCell(glyph, w, innerH, cell.width, cell.height, baseline));
      }
    }
    return out;
  } finally {
    document.fonts.delete(face);
  }
}

/**
 * Rewrites the game's font bitmaps with Arabic, one per supplied original.
 * Only the pixel data changes; the header, palette and dimensions are copied
 * through, because the engine reads the cell size from the dimensions.
 */
export async function buildWolfArabicFonts(
  originals: Record<string, Uint8Array>,
  fontBytes: ArrayBuffer,
  widthFactor = WOLF_DEFAULT_WIDTH_FACTOR
): Promise<Record<string, Uint8Array>> {
  const slots = wolfFontSlots();
  const codepoints = slots.filter((cp): cp is number => cp !== null);
  const parsed = Object.entries(originals).map(([name, bytes]) => ({ name, font: parseWolfFont(bytes) }));

  const cells: CellSize[] = [];
  for (const { font } of parsed) {
    const cell = { width: font.cellWidth, height: font.cellHeight };
    if (!cells.some((c) => c.width === cell.width && c.height === cell.height)) cells.push(cell);
  }

  const glyphs = await rasteriseWolfGlyphs(fontBytes, cells, codepoints, widthFactor);
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
