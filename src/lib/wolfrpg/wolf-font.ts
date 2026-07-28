/**
 * Wolfenstein RPG bitmap fonts — read the cell grid, draw new glyphs into it.
 *
 * Every font the game ships is an 8bpp Windows BMP holding a 16x9 grid of
 * equal cells, and the engine picks the cell straight from the byte
 * (`cell = byte - 0x21`; see wolf-charmap.ts for how that was measured). The
 * grid is always 16 columns by 9 rows, so the cell size follows from the
 * image: 12x16 for the 16pt fonts, 13x18 for the 18pt one, 10x12 for the
 * small one, 22x25 for the title font.
 *
 * Only the pixel data is ever rewritten. The file header, the palette and the
 * dimensions are copied through untouched, because the engine reads the cell
 * size from the dimensions — changing them would move every glyph at once.
 * Growing the bitmap does not add slots either: the engine ignored a tenth row
 * when it was tried in-game.
 *
 * BMP rows are stored bottom-up when the header's height is positive, which is
 * the case for all five shipped fonts; getting that backwards flips every
 * glyph, so it is handled once here and nowhere else.
 */

export const WOLF_GRID_COLS = 16;
export const WOLF_GRID_ROWS = 9;

export interface WolfFontImage {
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  /** Palette index per pixel, top-down, `width * height` entries. */
  pixels: Uint8Array;
  /** Everything before the pixel data: file header, info header, palette. */
  header: Uint8Array;
  /** Bytes per stored row, including the 4-byte alignment padding. */
  stride: number;
  /** True when the height is positive and rows are stored bottom-up. */
  bottomUp: boolean;
}

function u16(b: Uint8Array, o: number) {
  return b[o] | (b[o + 1] << 8);
}
function u32(b: Uint8Array, o: number) {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}
function i32(b: Uint8Array, o: number) {
  return u32(b, o) | 0;
}

export function parseWolfFont(bytes: Uint8Array): WolfFontImage {
  if (bytes[0] !== 0x42 || bytes[1] !== 0x4d) throw new Error("not a BMP file");
  const dataOffset = u32(bytes, 10);
  const width = i32(bytes, 18);
  const rawHeight = i32(bytes, 22);
  const bpp = u16(bytes, 28);
  if (bpp !== 8) throw new Error(`expected an 8bpp font, got ${bpp}bpp`);
  const height = Math.abs(rawHeight);
  if (width % WOLF_GRID_COLS !== 0 || height % WOLF_GRID_ROWS !== 0) {
    throw new Error(`${width}x${height} is not a ${WOLF_GRID_COLS}x${WOLF_GRID_ROWS} grid of whole cells`);
  }
  const stride = Math.ceil((width * bpp) / 32) * 4;
  const bottomUp = rawHeight > 0;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const src = dataOffset + (bottomUp ? height - 1 - y : y) * stride;
    pixels.set(bytes.subarray(src, src + width), y * width);
  }
  return {
    width,
    height,
    cellWidth: width / WOLF_GRID_COLS,
    cellHeight: height / WOLF_GRID_ROWS,
    pixels,
    header: bytes.slice(0, dataOffset),
    stride,
    bottomUp,
  };
}

export function serialiseWolfFont(font: WolfFontImage): Uint8Array {
  const out = new Uint8Array(font.header.length + font.stride * font.height);
  out.set(font.header, 0);
  for (let y = 0; y < font.height; y++) {
    const dst = font.header.length + (font.bottomUp ? font.height - 1 - y : y) * font.stride;
    out.set(font.pixels.subarray(y * font.width, (y + 1) * font.width), dst);
  }
  return out;
}

/** Top-left pixel of a cell, by slot index (`byte - 0x21`). */
export function wolfCellOrigin(font: WolfFontImage, slot: number): { x: number; y: number } {
  if (slot < 0 || slot >= WOLF_GRID_COLS * WOLF_GRID_ROWS) {
    throw new Error(`slot ${slot} is outside the ${WOLF_GRID_COLS * WOLF_GRID_ROWS}-cell grid`);
  }
  return {
    x: (slot % WOLF_GRID_COLS) * font.cellWidth,
    y: Math.floor(slot / WOLF_GRID_COLS) * font.cellHeight,
  };
}

/** One glyph's coverage, `width * height` values of 0..255. */
export interface WolfGlyphBitmap {
  width: number;
  height: number;
  coverage: Uint8Array;
}

/**
 * Draws a glyph into a cell, replacing whatever was there.
 *
 * `inkIndex` is the palette entry to use for a fully covered pixel and
 * `rampIndices` the darker-to-lighter entries for partial coverage; the fonts
 * carry an anti-aliasing ramp and using it keeps new glyphs looking like the
 * old ones instead of hard-edged. Coverage below the first ramp step is left
 * transparent (index 0), which is the colour key.
 */
export function drawGlyphIntoCell(
  font: WolfFontImage,
  slot: number,
  glyph: WolfGlyphBitmap,
  ramp: readonly number[]
): void {
  if (ramp.length === 0) throw new Error("no palette ramp given");
  const { x: ox, y: oy } = wolfCellOrigin(font, slot);
  for (let y = 0; y < font.cellHeight; y++) {
    for (let x = 0; x < font.cellWidth; x++) {
      font.pixels[(oy + y) * font.width + ox + x] = 0;
    }
  }
  // Centre horizontally, and sit on the same baseline the cell implies by
  // centring vertically too — the engine advances by the whole cell, so a
  // glyph drawn off-centre looks misaligned against its neighbours.
  const offX = Math.max(0, Math.floor((font.cellWidth - glyph.width) / 2));
  const offY = Math.max(0, Math.floor((font.cellHeight - glyph.height) / 2));
  for (let y = 0; y < glyph.height; y++) {
    const dy = oy + offY + y;
    if (dy < oy || dy >= oy + font.cellHeight) continue;
    for (let x = 0; x < glyph.width; x++) {
      const dx = ox + offX + x;
      if (dx < ox || dx >= ox + font.cellWidth) continue;
      const cov = glyph.coverage[y * glyph.width + x];
      if (cov === 0) continue;
      const step = Math.min(ramp.length - 1, Math.floor((cov / 256) * ramp.length));
      font.pixels[dy * font.width + dx] = ramp[step];
    }
  }
}

/**
 * The palette indices the font already uses for ink, darkest first.
 *
 * Reading them from the file rather than hard-coding keeps a rebuilt font
 * consistent with the original's look, and works for the dark and light
 * variants without special-casing either. Index 0 is the colour key and is
 * never part of the ramp.
 */
export function wolfInkRamp(font: WolfFontImage): number[] {
  const used = new Set<number>();
  for (const p of font.pixels) if (p !== 0) used.add(p);
  return [...used].sort((a, b) => a - b);
}
