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
 * The two palette entries a glyph is made of.
 *
 * Every font here draws each glyph as a solid body with a contrasting outline
 * — that is what gives the game's text its cut-out look — so a new glyph has
 * to be built the same way or it does not belong on the screen. Treating the
 * whole palette as one brightness ramp instead produced letters speckled with
 * outline colours, which is what the first Arabic build looked like in-game.
 *
 * Both entries are measured from the font rather than assumed: a pixel whose
 * four neighbours are all painted is inside a glyph, so the commonest such
 * index is the body; the commonest index on a glyph's edge is the outline.
 * That reads correctly for the light fonts, the dark one and the title font
 * alike, none of which share a palette layout.
 */
export interface WolfInkStyle {
  body: number;
  outline: number;
}

export function wolfInkStyle(font: WolfFontImage): WolfInkStyle {
  const inner = new Map<number, number>();
  const edge = new Map<number, number>();
  const at = (x: number, y: number) => font.pixels[y * font.width + x];
  for (let y = 1; y < font.height - 1; y++) {
    for (let x = 1; x < font.width - 1; x++) {
      const v = at(x, y);
      if (v === 0) continue;
      const surrounded = at(x, y - 1) !== 0 && at(x, y + 1) !== 0 && at(x - 1, y) !== 0 && at(x + 1, y) !== 0;
      const bucket = surrounded ? inner : edge;
      bucket.set(v, (bucket.get(v) ?? 0) + 1);
    }
  }
  const ranked = (m: Map<number, number>) => [...m].sort((a, b) => b[1] - a[1]).map(([i]) => i);
  const bodies = ranked(inner);
  const edges = ranked(edge);
  const body = bodies[0] ?? edges[0] ?? 1;
  // A font whose body and edge agree (the dark one does) still has a second
  // edge colour, and that is its outline.
  const outline = edges.find((i) => i !== body) ?? body;
  return { body, outline };
}

/**
 * Draws a glyph into a cell, replacing whatever was there, in the game's own
 * two-tone style: a solid body with a one-pixel outline around it.
 *
 * Coverage is thresholded rather than dithered across the palette. The cells
 * are 10 to 13 pixels wide, so there is no room for a smooth ramp, and the
 * palette is not ordered as one anyway — mixing entries by index number is
 * what speckled the first build.
 */
export function drawGlyphIntoCell(
  font: WolfFontImage,
  slot: number,
  glyph: WolfGlyphBitmap,
  ink: WolfInkStyle
): void {
  const { x: ox, y: oy } = wolfCellOrigin(font, slot);
  for (let y = 0; y < font.cellHeight; y++) {
    for (let x = 0; x < font.cellWidth; x++) {
      font.pixels[(oy + y) * font.width + ox + x] = 0;
    }
  }
  // Centre in the cell: the engine advances by the whole cell, so a glyph
  // drawn off-centre looks misaligned against its neighbours.
  const offX = Math.max(0, Math.floor((font.cellWidth - glyph.width) / 2));
  const offY = Math.max(0, Math.floor((font.cellHeight - glyph.height) / 2));
  const solid: boolean[] = new Array(font.cellWidth * font.cellHeight).fill(false);
  for (let y = 0; y < glyph.height; y++) {
    const cy = offY + y;
    if (cy < 0 || cy >= font.cellHeight) continue;
    for (let x = 0; x < glyph.width; x++) {
      const cx = offX + x;
      if (cx < 0 || cx >= font.cellWidth) continue;
      if (glyph.coverage[y * glyph.width + x] >= 128) solid[cy * font.cellWidth + cx] = true;
    }
  }
  for (let y = 0; y < font.cellHeight; y++) {
    for (let x = 0; x < font.cellWidth; x++) {
      const i = y * font.cellWidth + x;
      let value: number;
      if (solid[i]) {
        value = ink.body;
      } else {
        const touchesBody =
          (y > 0 && solid[i - font.cellWidth]) ||
          (y < font.cellHeight - 1 && solid[i + font.cellWidth]) ||
          (x > 0 && solid[i - 1]) ||
          (x < font.cellWidth - 1 && solid[i + 1]);
        if (!touchesBody) continue;
        value = ink.outline;
      }
      font.pixels[(oy + y) * font.width + ox + x] = value;
    }
  }
}

