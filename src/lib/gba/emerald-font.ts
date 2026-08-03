/**
 * Pokémon Emerald's font: where it is, and how one letter is stored.
 *
 * Every fact below was read out of the shipped ROM, and the layout was settled
 * by rendering it until Latin letters appeared. The English ROM keeps the
 * glyphs at 0x64C2E4 and their widths at 0x64C0E4, but neither address is
 * written down here: a Turkish translation of the same game moved the pair to
 * 0x79DBD4 and repointed the engine at it, which is the ordinary way a hack
 * makes room. So the font is found by its shape instead.
 *
 * A cell is 64 bytes and draws 16x16 pixels as four 8x8 tiles, in the order the
 * decoder reads them: top-left, top-right, bottom-left, bottom-right. Latin
 * letters are 8 wide and leave the two right tiles empty; `Lv`, which advances
 * 10, is one of the few that uses them.
 *
 * Two bits a pixel, and the bytes of a row run right to left: the byte at
 * `2*y` holds the row's right four pixels and `2*y + 1` its left four, most
 * significant pair first. That ordering is why every earlier reading of this
 * data came out as noise.
 *
 * The four values are not colours but roles, read off the glyphs themselves:
 * 1 is the letter, 2 the shadow one pixel down and right, 3 the background
 * inside the letter's own width, and 0 everything past it. The engine's
 * blitter (0x08004F4E) skips a pixel whose value is 0 and only walks as many
 * columns as the widths table gives, so a letter drawn wider than its width
 * simply loses the rest.
 *
 * No glyph in the ROM inks row 15. Anything written here keeps that clear.
 */

/** Bytes per cell: four 8x8 tiles at two bits a pixel. */
export const EMERALD_GLYPH_BYTES = 64;
/** Cells in the table — one for every byte a string can hold. */
export const EMERALD_GLYPH_COUNT = 256;
/** A cell is square: 16 pixels each way. */
export const EMERALD_GLYPH_SIZE = 16;
/** The row the game leaves empty under every letter. */
export const EMERALD_GLYPH_LAST_ROW = 15;
/** How far the widths table sits before the glyphs, in both ROMs seen. */
const WIDTHS_BEFORE_GLYPHS = 0x200;
/** Where each of the four tiles lands in the cell. */
const TILE_ORIGINS: readonly (readonly [number, number])[] = [
  [0, 0],
  [8, 0],
  [0, 8],
  [8, 8],
];

export interface EmeraldFont {
  /** Offset of the first cell. */
  glyphs: number;
  /** Offset of the widths table, one byte a cell. */
  widths: number;
}

/** The 256 pixels of one cell, row by row, each 0..3. */
export function readEmeraldGlyph(rom: Uint8Array, font: EmeraldFont, code: number): Uint8Array {
  const out = new Uint8Array(EMERALD_GLYPH_SIZE * EMERALD_GLYPH_SIZE);
  const cell = font.glyphs + code * EMERALD_GLYPH_BYTES;
  TILE_ORIGINS.forEach(([ox, oy], tile) => {
    const at = cell + tile * 16;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const byte = rom[at + 2 * y + (1 - (x >> 2))];
        out[(oy + y) * EMERALD_GLYPH_SIZE + ox + x] = (byte >> (2 * (3 - (x & 3)))) & 3;
      }
    }
  });
  return out;
}

/** Writes those 256 pixels back into the ROM, in place. */
export function writeEmeraldGlyph(
  rom: Uint8Array,
  font: EmeraldFont,
  code: number,
  pixels: Uint8Array
): void {
  if (pixels.length !== EMERALD_GLYPH_SIZE * EMERALD_GLYPH_SIZE) {
    throw new Error(`الخليّة تحتاج ${EMERALD_GLYPH_SIZE * EMERALD_GLYPH_SIZE} بكسلاً وجاءت ${pixels.length}`);
  }
  const cell = font.glyphs + code * EMERALD_GLYPH_BYTES;
  rom.fill(0, cell, cell + EMERALD_GLYPH_BYTES);
  TILE_ORIGINS.forEach(([ox, oy], tile) => {
    const at = cell + tile * 16;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const value = pixels[(oy + y) * EMERALD_GLYPH_SIZE + ox + x] & 3;
        rom[at + 2 * y + (1 - (x >> 2))] |= value << (2 * (3 - (x & 3)));
      }
    }
  });
}

/** How far right this cell is inked — what the widths table has to cover. */
export function emeraldGlyphInkWidth(pixels: Uint8Array): number {
  let width = 0;
  for (let y = 0; y < EMERALD_GLYPH_SIZE; y++) {
    for (let x = width; x < EMERALD_GLYPH_SIZE; x++) {
      if (pixels[y * EMERALD_GLYPH_SIZE + x] !== 0) width = x + 1;
    }
  }
  return width;
}

/** True when the cell draws nothing at all. */
export function isEmeraldGlyphBlank(rom: Uint8Array, font: EmeraldFont, code: number): boolean {
  const cell = font.glyphs + code * EMERALD_GLYPH_BYTES;
  for (let i = 0; i < EMERALD_GLYPH_BYTES; i++) if (rom[cell + i] !== 0) return false;
  return true;
}

/** The widest a letter is allowed to advance — `Lv` is 10, nothing exceeds 16. */
const MAX_WIDTH = 16;
/** How many cells must agree with their width before the region is believed. */
const MIN_EXACT = 100;

/**
 * Finds the font by the one thing a font has and other data does not: a table
 * of widths that agrees, cell by cell, with how far the drawings actually
 * reach.
 *
 * Two hundred and fifty-six bytes each between 1 and 16 is a cheap first
 * sieve — it throws out the ROM's empty stretches at once — and the agreement
 * test is what no unrelated pair of regions passes. In the English ROM 130
 * cells match their width exactly; a hack that redraws letters keeps that,
 * because the engine reads the same two tables.
 *
 * A cell may ink one column past its width — nine of the game's own do, the
 * narrow spacing glyphs among them — but no further, since the blitter would
 * never draw it.
 */
export function findEmeraldFont(rom: Uint8Array): EmeraldFont | null {
  const span = EMERALD_GLYPH_COUNT * EMERALD_GLYPH_BYTES;
  let run = 0;
  for (let at = 0; at < rom.length; at++) {
    const b = rom[at];
    if (b < 1 || b > MAX_WIDTH) {
      run = 0;
      continue;
    }
    run++;
    if (run < EMERALD_GLYPH_COUNT) continue;
    const widths = at - EMERALD_GLYPH_COUNT + 1;
    if (widths % 4 !== 0) continue;
    const glyphs = widths + WIDTHS_BEFORE_GLYPHS;
    if (glyphs + span > rom.length) continue;
    const font = { glyphs, widths };
    if (!isEmeraldGlyphBlank(rom, font, 0)) continue;
    if (agrees(rom, font)) return font;
  }
  return null;
}

function agrees(rom: Uint8Array, font: EmeraldFont): boolean {
  let exact = 0;
  for (let code = 0; code < EMERALD_GLYPH_COUNT; code++) {
    const ink = emeraldGlyphInkWidth(readEmeraldGlyph(rom, font, code));
    if (ink === 0) continue;
    const width = rom[font.widths + code];
    if (ink > width + 1) return false;
    if (ink === width) exact++;
  }
  return exact >= MIN_EXACT;
}
