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
  /** How far the pen moves after it. */
  advance: number;
  /** Where the box sits relative to the pen — the font's own fields 5 and 6. */
  leftBearing: number;
  topBearing: number;
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
 * How this font places a glyph, read from its own records.
 *
 * A box here is not a uniform cell — that was Risen 2's shape, and assuming it
 * here was wrong. Measured on `Linux Biolinum O_30`: box heights run from 18 to
 * 57 across 31 distinct values, so each box is the letter's own ink plus a
 * margin. What positions it is the pair of bearings:
 *
 *   fields[5]  how far left of the pen the box starts — always negative, and
 *              the same value for nearly every glyph (the packer's margin).
 *   fields[6]  how far below the line's top the box starts.
 *
 * `fields[6] + height` therefore lands on the same number for every letter that
 * sits on the writing line — 44 on 171 of that font's glyphs, 54 on the ones
 * with a descender — which is what gives the baseline. Writing zeros into those
 * two fields, as this did at first, hangs every letter at the top of the line.
 */
export interface Risen3Metrics {
  /** Pixels from the top of a line to the writing line. */
  baseline: number;
  /** Blank border the packer leaves around the ink inside a box. */
  margin: number;
  /** The left bearing this font gives its glyphs. */
  leftBearing: number;
  /** Tallest box in the font, for judging how large to draw. */
  maxBoxHeight: number;
}

function mode(values: number[], fallback: number): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = fallback;
  let bestCount = 0;
  for (const [v, n] of counts) if (n > bestCount) { best = v; bestCount = n; }
  return best;
}

export function measureRisen3Metrics(doc: Risen3FntDocument): Risen3Metrics {
  const atlas = risen3FntAtlas(doc);
  const drawn = doc.glyphs.filter((g) => g.fields[2] > g.fields[0] && g.fields[3] > g.fields[1]);
  const baseline = mode(drawn.map((g) => g.fields[6] + (g.fields[3] - g.fields[1])), 44);
  const leftBearing = mode(drawn.map((g) => g.fields[5]), -6);

  // The margin is the blank the packer leaves above the ink inside a box.
  const tops: number[] = [];
  for (const g of drawn.slice(0, 200)) {
    const [x0, y0, x1, y1] = g.fields;
    let top = -1;
    for (let y = y0; y < y1 && top < 0; y++) {
      for (let x = x0; x < x1; x++) {
        if (atlas.pixels[y * atlas.width + x] >= 128) { top = y - y0; break; }
      }
    }
    if (top >= 0) tops.push(top);
  }
  return {
    baseline,
    margin: mode(tops, 8),
    leftBearing,
    maxBoxHeight: Math.max(...drawn.map((g) => g.fields[3] - g.fields[1]), 1),
  };
}

/**
 * Blocks an Arabic build will not print, in the order they may be spent.
 *
 * The Russian alphabet first: an Arabic version of the game shows none of it,
 * and every text font carries all 256. That is not always enough — two of the
 * three text fonts share glyphs between look-alike Cyrillic and Latin letters,
 * so only 134 of their cells can be taken and the alphabet needs 140.
 *
 * Latin Extended-A makes up the difference, and only the difference: those are
 * the Polish, Czech and Hungarian letters (Ł Ń Ś Ű Ő …). The accented letters
 * French, German and Spanish need live in Latin-1 Supplement, 0x00C0–0x00FF,
 * and are deliberately left alone — the game's own English text uses them.
 */
export const RISEN3_DEAD_RANGES = [
  { from: 0x0400, to: 0x04ff },
  { from: 0x0100, to: 0x017f },
];

/** Kept for the older name. */
export const RISEN3_DEAD_RANGE = RISEN3_DEAD_RANGES[0];

export interface Risen3InjectResult {
  document: Risen3FntDocument;
  /** How many glyphs were written in total. */
  added: number;
  /** How many took over the cell of a character the build will not print. */
  reused: number;
  /** How many were narrowed to fit the widest cell left, and by how little. */
  squeezed: number;
  narrowestScale: number;
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
   * Take over the cells of characters in these blocks instead of growing the
   * atlas, spending them in order and only as far as needed. Pass null to
   * always append.
   */
  reuseRanges?: { from: number; to: number }[] | null;
  /**
   * Allow the atlas to grow when a form fits nowhere.
   *
   * Off, because growing is what has broken every build so far. The largest
   * atlas the game itself ships is 2048x1024; a build that doubled one to
   * 2048x2048 was refused outright and the game showed no text at all, even
   * with every other field correct. A form that finds no cell is narrowed
   * instead — see below.
   */
  allowGrow?: boolean;
}

/**
 * Resamples a drawn glyph into a smaller box, keeping it on the writing line.
 *
 * Used only for the few forms that fit no free cell as drawn — measured on a
 * real font, 134 of 140 fitted and 6 did not, and those 6 were doubling the
 * atlas. A few percent smaller on a handful of letters is not visible; an atlas
 * the engine refuses is fatal.
 *
 * The bearing moves with the shape: what sat below the writing line shrinks by
 * the same factor, so the letter still rests on the line rather than floating.
 */
function scaleGlyph(glyph: DrawnGlyph, width: number, height: number, baseline: number): DrawnGlyph {
  const sx = glyph.width / width;
  const sy = glyph.height / height;
  const coverage = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const fromY = y * sy;
    const toY = (y + 1) * sy;
    for (let x = 0; x < width; x++) {
      const fromX = x * sx;
      const toX = (x + 1) * sx;
      let sum = 0;
      let count = 0;
      for (let gy = Math.floor(fromY); gy < Math.min(glyph.height, Math.ceil(toY)); gy++) {
        for (let gx = Math.floor(fromX); gx < Math.min(glyph.width, Math.ceil(toX)); gx++) {
          sum += glyph.coverage[gy * glyph.width + gx];
          count++;
        }
      }
      coverage[y * width + x] = count > 0 ? Math.round(sum / count) : 0;
    }
  }
  const descent = baseline - glyph.topBearing - glyph.height;
  return {
    codepoint: glyph.codepoint,
    width,
    height,
    coverage,
    advance: Math.max(1, Math.round(glyph.advance / sx)),
    leftBearing: Math.round(glyph.leftBearing / sx),
    topBearing: Math.round(baseline - height - descent / sy),
  };
}

export interface Risen3InjectResult {
  document: Risen3FntDocument;
  /** How many glyphs were written in total. */
  added: number;
  /** How many took over the cell of a character the build will not print. */
  reused: number;
  /** How many were narrowed to fit the widest cell left, and by how little. */
  squeezed: number;
  narrowestScale: number;
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
   * Take over the cells of characters in these blocks instead of growing the
   * atlas, spending them in order and only as far as needed. Pass null to
   * always append.
   */
  reuseRanges?: { from: number; to: number }[] | null;
  /**
   * Allow the atlas to grow when a form fits nowhere.
   *
   * Off, because growing is what has broken every build so far. The largest
   * atlas the game itself ships is 2048x1024; a build that doubled one to
   * 2048x2048 was refused outright and the game showed no text at all, even
   * with every other field correct. A form that finds no cell is narrowed
   * instead — see below.
   */
  allowGrow?: boolean;
}

/**
 * Narrows a drawn glyph to a given width, keeping its height and its baseline.
 *
 * Used only for the few forms wider than any cell left — measured on a real
 * font, 132 of 140 fitted and 8 did not, and those 8 were doubling the atlas.
 * A few percent of horizontal squeeze on eight letters is not visible; an
 * atlas the engine refuses is fatal.
 */
function narrowGlyph(glyph: DrawnGlyph, width: number): DrawnGlyph {
  const coverage = new Uint8Array(width * glyph.height);
  const scale = glyph.width / width;
  for (let y = 0; y < glyph.height; y++) {
    for (let x = 0; x < width; x++) {
      // Average the source columns this column stands for, so a thin stroke is
      // dimmed rather than dropped.
      const from = x * scale;
      const to = (x + 1) * scale;
      let sum = 0;
      let count = 0;
      for (let sx = Math.floor(from); sx < Math.min(glyph.width, Math.ceil(to)); sx++) {
        sum += glyph.coverage[y * glyph.width + sx];
        count++;
      }
      coverage[y * width + x] = count > 0 ? Math.round(sum / count) : 0;
    }
  }
  return {
    codepoint: glyph.codepoint,
    width,
    height: glyph.height,
    coverage,
    advance: Math.max(1, Math.round(glyph.advance / scale)),
    leftBearing: glyph.leftBearing,
    topBearing: glyph.topBearing,
  };
}

/**
 * The character the one-glyph test writes over: Cyrillic А.
 *
 * Chosen because every text font in the game carries it, an Arabic build never
 * prints it, and the translator can paste it into a line without a Russian
 * keyboard.
 */
export const RISEN3_PROBE_CHAR = 0x0410;

export interface Risen3ProbeResult {
  document: Risen3FntDocument;
  /** The cell that was written over, for the note shown to the translator. */
  cell: { x: number; y: number; width: number; height: number };
}

/**
 * Draws one Arabic letter into one existing cell, and changes nothing else.
 *
 * Every build so far has lost the game's text entirely — the English with the
 * Arabic — which cannot be a drawing fault: injection never touches a Latin
 * letter's pixels, record or charmap entry. So the engine is refusing the font
 * as it loads it, and the question is which of the things injection changes it
 * refuses. Three change at once: pixels, records, and the charmap (about 140
 * codes leave, 140 arrive, all of them above 0xFE70 — while not one of the
 * 2698 codes in the seven shipped fonts reaches 0x8000).
 *
 * This separates them. The letter is resampled into the cell exactly as it
 * stands, so the record keeps its own numbers and the file's length, counts,
 * charmap and every field stay identical to the original — only the pixels of
 * that one cell differ. If the game then shows an alef where `А` is written and
 * keeps the rest of its text, the pixel path is proven and the fault is in the
 * charmap; if the text disappears, it is the pixels, and the charmap is
 * innocent.
 */
export function probeRisen3Fnt(
  doc: Risen3FntDocument,
  glyph: DrawnGlyph,
  options: { spread?: number; charCode?: number } = {}
): Risen3ProbeResult {
  const charCode = options.charCode ?? RISEN3_PROBE_CHAR;
  const pair = doc.charmap.find((p) => p.charCode === charCode);
  if (!pair) throw new Error(`لا يحمل هذا الخطّ الرمز ${charCode} — جرّب خطّاً نصّياً`);
  const record = doc.glyphs[pair.glyphIndex];
  if (!record) throw new Error(`الرمز ${charCode} يشير إلى رسم غير موجود`);
  const [x0, y0, x1, y1] = record.fields;
  const width = x1 - x0;
  const height = y1 - y0;
  if (width <= 0 || height <= 0) throw new Error(`خليّة الرمز ${charCode} فارغة، فلا شيء يُرسم فيها`);

  const atlas = risen3FntAtlas(doc);
  const fitted =
    glyph.width === width && glyph.height === height
      ? glyph
      : scaleGlyph(glyph, width, height, measureRisen3Metrics(doc).baseline);
  const field = coverageToSdf(fitted.coverage, width, height, options.spread ?? RISEN3_SDF_SPREAD);

  const pixels = atlas.pixels.slice();
  for (let row = 0; row < height; row++) {
    pixels.set(field.subarray(row * width, (row + 1) * width), (y0 + row) * atlas.width + x0);
  }
  const dds = new Uint8Array(128 + pixels.length);
  dds.set(doc.dds.subarray(0, 128), 0);
  dds.set(pixels, 128);

  return { document: { ...doc, dds }, cell: { x: x0, y: y0, width, height } };
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
  const metrics = measureRisen3Metrics(doc);
  const spread = options.spread ?? RISEN3_SDF_SPREAD;
  const ranges = options.reuseRanges === undefined ? RISEN3_DEAD_RANGES : options.reuseRanges;
  const allowGrow = options.allowGrow ?? false;
  const atlas = risen3FntAtlas(doc);
  const width = atlas.width;
  const heightBefore = atlas.height;

  const drawable = glyphs.filter((g) => g.width > 0 && g.height > 0 && g.coverage.length >= g.width * g.height);
  if (drawable.some((g) => g.width > width)) {
    throw new Error("حرف أعرض من الأطلس نفسه — قلّل حجم الخطّ");
  }

  // Widest first, so the roomiest cells go to the forms that need them.
  const queue = [...drawable].sort((a, b) => b.width * b.height - a.width * a.height);
  // Spent in order, and only as deep as the alphabet needs: the first block is
  // free of consequence, the second costs letters other languages use.
  const cells: FreeCell[] = [];
  for (const range of ranges ?? []) {
    if (cells.length >= drawable.length) break;
    const found = freeCells(doc, range);
    cells.push(...found.slice(0, Math.max(0, drawable.length - cells.length)));
  }
  cells.sort((a, b) => b.width * b.height - a.width * a.height);
  const taken = new Map<number, FreeCell>();
  const placed = new Map<number, DrawnGlyph>();
  const overwritten = new Set<number>();
  const leftovers: DrawnGlyph[] = [];
  let squeezed = 0;
  let narrowestScale = 1;
  for (const g of queue) {
    // Smallest cell that still holds it, so a big form is not left without one.
    let best = -1;
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].width >= g.width && cells[i].height >= g.height) { best = i; break; }
    }
    let glyph = g;
    if (best < 0 && !allowGrow) {
      // Nothing holds it as drawn. Rather than grow the atlas — which is what
      // the engine refuses — take the roomiest cell left and resample the form
      // into it, shrinking as little as the cell demands.
      let roomiest = -1;
      for (let i = 0; i < cells.length; i++) {
        if (roomiest < 0 || cells[i].width * cells[i].height > cells[roomiest].width * cells[roomiest].height) roomiest = i;
      }
      if (roomiest >= 0) {
        const cell = cells[roomiest];
        glyph = scaleGlyph(g, Math.min(g.width, cell.width), Math.min(g.height, cell.height), metrics.baseline);
        squeezed++;
        narrowestScale = Math.min(narrowestScale, Math.min(glyph.width / g.width, glyph.height / g.height));
        best = roomiest;
      }
    }
    if (best < 0) {
      leftovers.push(g);
      continue;
    }
    const cell = cells.splice(best, 1)[0];
    taken.set(g.codepoint, cell);
    placed.set(g.codepoint, glyph);
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
  if (leftovers.length > 0 && !allowGrow) {
    // Growing is what the engine refuses, so a font that cannot hold the
    // alphabet in its own cells is refused here instead — with the number, so
    // the caller can say which font and by how much.
    throw new Error(
      `لا تتّسع خلايا هذا الخطّ لـ${leftovers.length} شكلاً، وتكبير الأطلس ترفضه اللعبة — اختر خطّاً آخر`
    );
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

  for (const original of drawable) {
    const g = placed.get(original.codepoint) ?? original;
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

  for (const original of drawable) {
    const g = placed.get(original.codepoint) ?? original;
    const cell = taken.get(g.codepoint);
    const at = cell ? { x: cell.x, y: cell.y } : placements.get(g.codepoint);
    if (!at) continue;
    // x0, y0, x1, y1, advance, then the two fields whose meaning is
    // unresolved — left at zero, as the Risen 2 tool leaves its own.
    const fields = [at.x, at.y, at.x + g.width, at.y + g.height, g.advance, g.leftBearing, g.topBearing];

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
    squeezed,
    narrowestScale,
    appended: leftovers.length,
    heightBefore,
    heightAfter,
    replaced,
  };
}
