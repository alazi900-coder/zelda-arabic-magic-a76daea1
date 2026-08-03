/**
 * Adding Arabic to a Risen 3 font.
 *
 * The pure half of the job: it takes glyphs already drawn by a rasteriser —
 * one byte of coverage a pixel — and writes them into a font object as a
 * signed distance field, a charmap entry and a measurement record each. The
 * drawing itself belongs to the browser (Canvas and FontFace), and is kept out
 * of here so this can be tested without one, the same split the Risen 2 tool
 * uses.
 *
 * Where the new glyphs go: below the existing atlas, never inside it. Every
 * one of the seven shipped fonts is packed to its last row — `Linux Biolinum
 * O_30` uses row 1022 of 1024 — so the empty 57% of a texture is scattered
 * between letters, not a strip anything can be placed in. The atlas therefore
 * grows, and the two lengths that describe it are rebuilt with it (see
 * buildRisen3Fnt); a stale one makes the engine read a truncated texture and
 * drop the whole font.
 *
 * Height is rounded up to a power of two. The engine is DirectX 9-era and
 * every shipped atlas is 256, 512, 1024 or 2048 tall.
 */

import { coverageToSdf, RISEN3_SDF_SPREAD } from "./risen3-sdf";
import type { Risen3FntDocument, Risen3FntGlyph, Risen3FntPair } from "./risen3-fnt";
import { risen3FntAtlas } from "./risen3-fnt";

/** A glyph drawn by the rasteriser, ready to be turned into a field. */
export interface DrawnGlyph {
  codepoint: number;
  width: number;
  height: number;
  /** One byte a pixel: 0 where nothing was drawn, 255 fully inside the letter. */
  coverage: Uint8Array;
  /** How far the pen moves after it, in the font's own units. */
  advance: number;
}

/** Gap between packed cells, so a glyph never samples its neighbour's ink. */
const GAP = 1;
const RECORD_SIZE = 28;

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * The uniform cell every glyph of this font is drawn into, and where its
 * writing line sits inside it.
 *
 * Both are read off the font's own glyphs rather than chosen. The engine draws
 * each cell top-aligned on a fixed line, so a new glyph rendered to a
 * different height hangs at the wrong place — measured the hard way in Risen 2,
 * where tight-cropped boxes made every letter dangle from the line's top.
 *
 * The baseline is taken from characters whose ink stops exactly on it — digits
 * and flat-bottomed capitals — and in a distance field "ink" means at or above
 * the edge value, since that is where the letter actually is.
 */
export interface Risen3CellMetrics {
  cellHeight: number;
  baseline: number;
}

const BASELINE_REF_CHARS = "0123456789ABDEFHIKLMNPRTUVWXZ";

export function measureRisen3CellMetrics(doc: Risen3FntDocument): Risen3CellMetrics {
  const heights = new Map<number, number>();
  for (const g of doc.glyphs) {
    const h = g.fields[3] - g.fields[1];
    if (g.fields[2] > g.fields[0] && h > 0) heights.set(h, (heights.get(h) ?? 0) + 1);
  }
  let cellHeight = 20;
  let best = 0;
  for (const [h, n] of heights) if (n > best) { cellHeight = h; best = n; }

  const atlas = risen3FntAtlas(doc);
  const byChar = new Map(doc.charmap.map((p) => [p.charCode, p.glyphIndex]));
  const bottoms = new Map<number, number>();
  for (const ch of BASELINE_REF_CHARS) {
    const gi = byChar.get(ch.charCodeAt(0));
    if (gi === undefined || gi >= doc.glyphs.length) continue;
    const [x0, y0, x1, y1] = doc.glyphs[gi].fields;
    if (x1 <= x0 || y1 <= y0) continue;
    let inkMaxY = -1;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (atlas.pixels[y * atlas.width + x] >= 128 && y > inkMaxY) inkMaxY = y;
      }
    }
    if (inkMaxY >= 0) {
      const rel = inkMaxY - y0 + 1;
      bottoms.set(rel, (bottoms.get(rel) ?? 0) + 1);
    }
  }
  let baseline = Math.round(cellHeight * 0.8);
  let bestBottom = 0;
  for (const [rel, n] of bottoms) if (n > bestBottom) { baseline = rel; bestBottom = n; }
  return { cellHeight, baseline };
}

export interface Risen3InjectResult {
  document: Risen3FntDocument;
  /** How many glyphs were written. */
  added: number;
  /** The atlas height before and after, for reporting. */
  heightBefore: number;
  heightAfter: number;
  /** Codepoints already in the font, whose record was rewritten rather than added. */
  replaced: number[];
}

/**
 * Writes the drawn glyphs into a copy of the font.
 *
 * A codepoint the font already carries keeps its glyph index and has its
 * record rewritten, so nothing that points at it breaks; a new one is appended
 * and given a charmap entry.
 */
export function addArabicToRisen3Fnt(
  doc: Risen3FntDocument,
  glyphs: DrawnGlyph[],
  spread: number = RISEN3_SDF_SPREAD
): Risen3InjectResult {
  const atlas = risen3FntAtlas(doc);
  const width = atlas.width;
  const heightBefore = atlas.height;

  const drawable = glyphs.filter((g) => g.width > 0 && g.height > 0 && g.coverage.length >= g.width * g.height);
  if (drawable.some((g) => g.width > width)) {
    throw new Error("حرف أعرض من الأطلس نفسه — قلّل حجم الخطّ");
  }

  // Shelf-pack below the last existing row.
  const placements = new Map<number, { x: number; y: number }>();
  let cursorX = 0;
  let cursorY = heightBefore + GAP;
  let rowHeight = 0;
  for (const g of drawable) {
    if (cursorX + g.width > width) {
      cursorY += rowHeight + GAP;
      cursorX = 0;
      rowHeight = 0;
    }
    placements.set(g.codepoint, { x: cursorX, y: cursorY });
    cursorX += g.width + GAP;
    if (g.height > rowHeight) rowHeight = g.height;
  }
  const heightAfter = nextPowerOfTwo(cursorY + rowHeight);

  // The new texture: the old pixels untouched, the new rows written into the
  // space below them. Zero is "far outside a glyph", which is what the unused
  // remainder should read as, and a fresh array already holds it.
  const pixels = new Uint8Array(width * heightAfter);
  pixels.set(atlas.pixels.subarray(0, width * heightBefore), 0);
  for (const g of drawable) {
    const at = placements.get(g.codepoint)!;
    const field = coverageToSdf(g.coverage, g.width, g.height, spread);
    for (let y = 0; y < g.height; y++) {
      pixels.set(field.subarray(y * g.width, (y + 1) * g.width), (at.y + y) * width + at.x);
    }
  }

  const dds = new Uint8Array(128 + pixels.length);
  dds.set(doc.dds.subarray(0, 128), 0);
  new DataView(dds.buffer).setUint32(12, heightAfter, true); // dwHeight
  dds.set(pixels, 128);

  const charmap: Risen3FntPair[] = doc.charmap.map((p) => ({ ...p }));
  const outGlyphs: Risen3FntGlyph[] = doc.glyphs.map((g) => ({ rawBytes: g.rawBytes.slice(), fields: [...g.fields] }));
  const byCode = new Map(charmap.map((p) => [p.charCode, p]));
  const replaced: number[] = [];
  let added = 0;

  for (const g of drawable) {
    const at = placements.get(g.codepoint)!;
    // x0, y0, x1, y1, advance, then the two fields whose meaning is
    // unresolved — left at zero, as the Risen 2 tool leaves its own.
    const fields = [at.x, at.y, at.x + g.width, at.y + g.height, g.advance, 0, 0];
    const rawBytes = new Uint8Array(RECORD_SIZE);
    const view = new DataView(rawBytes.buffer);
    fields.forEach((v, i) => view.setInt32(4 * i, v, true));

    const existing = byCode.get(g.codepoint);
    if (existing) {
      outGlyphs[existing.glyphIndex] = { rawBytes, fields };
      replaced.push(g.codepoint);
    } else {
      const index = outGlyphs.length;
      outGlyphs.push({ rawBytes, fields });
      const pair = { charCode: g.codepoint, glyphIndex: index };
      charmap.push(pair);
      byCode.set(g.codepoint, pair);
      added++;
    }
  }

  return {
    document: { ...doc, charmap, recordCount: outGlyphs.length, glyphs: outGlyphs, dds },
    added,
    heightBefore,
    heightAfter,
    replaced,
  };
}
