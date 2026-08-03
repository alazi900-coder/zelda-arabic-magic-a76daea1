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
 * Where the new glyphs go: into the cells of letters an Arabic build will never
 * print. Every text font here carries the whole Russian alphabet — 256 cells,
 * already packed, already the right height — and an Arabic version of the game
 * shows none of them. Writing into those costs the atlas nothing.
 *
 * That is not only tidier, it is the difference between working and not. The
 * atlas's size is written down in three places — the texture length inside the
 * font, the font's own footer, and the archive's index file `w_fnt_0_na.db` —
 * and the first build missed the third: the engine read an index that disagreed
 * with the font and dropped the font entirely, Latin letters included, so the
 * game showed no text at all. A glyph that reuses a cell changes no size, so
 * none of the three can fall out of step.
 *
 * A form too wide for any free cell still has to go somewhere, and for those the
 * atlas grows: new rows below the last, height rounded up to a power of two (the
 * engine is DirectX 9-era and every shipped atlas is 256, 512, 1024 or 2048
 * tall). Growing also has a cost the Chinese translation of this game measured —
 * past 1024x2048 the game slows down noticeably — so the caller is told how much
 * was reused and how much was appended.
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

/** The block an Arabic build has no use for: the Russian alphabet. */
export const RISEN3_DEAD_RANGE = { from: 0x0400, to: 0x04ff };

export interface Risen3InjectResult {
  document: Risen3FntDocument;
  /** How many glyphs were written in total. */
  added: number;
  /** How many took over the cell of a character the build will not print. */
  reused: number;
  /** How many needed new rows, which is what makes the atlas grow. */
  appended: number;
  /** The atlas height before and after, for reporting. */
  heightBefore: number;
  heightAfter: number;
  /** Codepoints already in the font, whose record was rewritten rather than added. */
  replaced: number[];
}

export interface Risen3InjectOptions {
  spread?: number;
  /**
   * Take over the cells of characters in this range instead of growing the
   * atlas. Pass null to always append.
   */
  reuseRange?: { from: number; to: number } | null;
}

/** A cell this build may take over, with the character that used to own it. */
interface FreeCell {
  charCode: number;
  glyphIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Cells whose character will not be printed, largest first.
 *
 * A cell is only offered when exactly one character maps to it. Two characters
 * sharing a glyph is rare, but taking such a cell would put an Arabic letter
 * where the other character is drawn — a wrong letter rather than a missing one.
 */
function freeCells(doc: Risen3FntDocument, range: { from: number; to: number }): FreeCell[] {
  const users = new Map<number, number>();
  for (const pair of doc.charmap) users.set(pair.glyphIndex, (users.get(pair.glyphIndex) ?? 0) + 1);
  const out: FreeCell[] = [];
  for (const pair of doc.charmap) {
    if (pair.charCode < range.from || pair.charCode > range.to) continue;
    if (users.get(pair.glyphIndex) !== 1) continue;
    const g = doc.glyphs[pair.glyphIndex];
    if (!g) continue;
    const [x0, y0, x1, y1] = g.fields;
    if (x1 <= x0 || y1 <= y0) continue;
    out.push({ charCode: pair.charCode, glyphIndex: pair.glyphIndex, x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
  }
  return out.sort((a, b) => b.width * b.height - a.width * a.height);
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
  options: Risen3InjectOptions = {}
): Risen3InjectResult {
  const spread = options.spread ?? RISEN3_SDF_SPREAD;
  const range = options.reuseRange === undefined ? RISEN3_DEAD_RANGE : options.reuseRange;
  const atlas = risen3FntAtlas(doc);
  const width = atlas.width;
  const heightBefore = atlas.height;

  const drawable = glyphs.filter((g) => g.width > 0 && g.height > 0 && g.coverage.length >= g.width * g.height);
  if (drawable.some((g) => g.width > width)) {
    throw new Error("حرف أعرض من الأطلس نفسه — قلّل حجم الخطّ");
  }

  // Widest first, so the roomiest cells go to the forms that need them.
  const queue = [...drawable].sort((a, b) => b.width * b.height - a.width * a.height);
  const cells = range ? freeCells(doc, range) : [];
  const taken = new Map<number, FreeCell>();
  const overwritten = new Set<number>();
  const leftovers: DrawnGlyph[] = [];
  for (const g of queue) {
    // Smallest cell that still holds it, so a big form is not left without one.
    let best = -1;
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].width >= g.width && cells[i].height >= g.height) { best = i; break; }
    }
    if (best < 0) {
      leftovers.push(g);
      continue;
    }
    const cell = cells.splice(best, 1)[0];
    taken.set(g.codepoint, cell);
    overwritten.add(cell.charCode);
  }

  // Shelf-pack whatever found no cell, below the last existing row.
  const placements = new Map<number, { x: number; y: number }>();
  let cursorX = 0;
  let cursorY = heightBefore + GAP;
  let rowHeight = 0;
  for (const g of leftovers) {
    if (cursorX + g.width > width) {
      cursorY += rowHeight + GAP;
      cursorX = 0;
      rowHeight = 0;
    }
    placements.set(g.codepoint, { x: cursorX, y: cursorY });
    cursorX += g.width + GAP;
    if (g.height > rowHeight) rowHeight = g.height;
  }
  const heightAfter = leftovers.length > 0 ? nextPowerOfTwo(cursorY + rowHeight) : heightBefore;

  const pixels = new Uint8Array(width * heightAfter);
  pixels.set(atlas.pixels.subarray(0, width * Math.min(heightBefore, heightAfter)), 0);

  const writeField = (g: DrawnGlyph, x: number, y: number) => {
    const field = coverageToSdf(g.coverage, g.width, g.height, spread);
    for (let row = 0; row < g.height; row++) {
      pixels.set(field.subarray(row * g.width, (row + 1) * g.width), (y + row) * width + x);
    }
  };

  for (const g of drawable) {
    const cell = taken.get(g.codepoint);
    if (cell) {
      // Clear the old letter first: the form may be narrower than the cell, and
      // zero is what "far outside a glyph" reads as.
      for (let row = 0; row < cell.height; row++) {
        pixels.fill(0, (cell.y + row) * width + cell.x, (cell.y + row) * width + cell.x + cell.width);
      }
      writeField(g, cell.x, cell.y);
      continue;
    }
    const at = placements.get(g.codepoint);
    if (at) writeField(g, at.x, at.y);
  }

  const dds = new Uint8Array(128 + pixels.length);
  dds.set(doc.dds.subarray(0, 128), 0);
  new DataView(dds.buffer).setUint32(12, heightAfter, true); // dwHeight
  dds.set(pixels, 128);

  // The characters whose cells were taken lose their entry, so the game draws
  // nothing for them rather than an Arabic letter in a Russian word.
  const charmap: Risen3FntPair[] = doc.charmap
    .filter((p) => !overwritten.has(p.charCode))
    .map((p) => ({ ...p }));
  const outGlyphs: Risen3FntGlyph[] = doc.glyphs.map((g) => ({ rawBytes: g.rawBytes.slice(), fields: [...g.fields] }));
  const byCode = new Map(charmap.map((p) => [p.charCode, p]));
  const replaced: number[] = [];
  let added = 0;

  const record = (fields: number[]) => {
    const rawBytes = new Uint8Array(RECORD_SIZE);
    const view = new DataView(rawBytes.buffer);
    fields.forEach((v, i) => view.setInt32(4 * i, v, true));
    return { rawBytes, fields };
  };

  for (const g of drawable) {
    const cell = taken.get(g.codepoint);
    const at = cell ? { x: cell.x, y: cell.y } : placements.get(g.codepoint);
    if (!at) continue;
    // x0, y0, x1, y1, advance, then the two fields whose meaning is
    // unresolved — left at zero, as the Risen 2 tool leaves its own.
    const fields = [at.x, at.y, at.x + g.width, at.y + g.height, g.advance, 0, 0];

    const existing = byCode.get(g.codepoint);
    if (existing) {
      outGlyphs[existing.glyphIndex] = record(fields);
      replaced.push(g.codepoint);
      continue;
    }
    // A reused cell keeps its own glyph index, so nothing else has to move.
    const index = cell ? cell.glyphIndex : outGlyphs.length;
    if (cell) outGlyphs[index] = record(fields);
    else outGlyphs.push(record(fields));
    const pair = { charCode: g.codepoint, glyphIndex: index };
    charmap.push(pair);
    byCode.set(g.codepoint, pair);
    added++;
  }

  return {
    document: { ...doc, charmap, recordCount: outGlyphs.length, glyphs: outGlyphs, dds },
    added,
    reused: taken.size,
    appended: leftovers.length,
    heightBefore,
    heightAfter,
    replaced,
  };
}
