import { describe, it, expect } from "vitest";
import {
  parseWolfFont, serialiseWolfFont, wolfCellOrigin, drawGlyphIntoCell, wolfInkRamp,
  WOLF_GRID_COLS, WOLF_GRID_ROWS,
} from "@/lib/wolfrpg/wolf-font";

/** An 8bpp BMP shaped like the game's fonts: bottom-up rows, 256-entry
 *  palette, a 16x9 grid of cells. */
function makeFont(cellW: number, cellH: number): Uint8Array {
  const width = cellW * WOLF_GRID_COLS;
  const height = cellH * WOLF_GRID_ROWS;
  const stride = Math.ceil((width * 8) / 32) * 4;
  const dataOffset = 54 + 256 * 4;
  const bytes = new Uint8Array(dataOffset + stride * height);
  bytes[0] = 0x42; bytes[1] = 0x4d;
  const put32 = (o: number, v: number) => {
    bytes[o] = v & 0xff; bytes[o + 1] = (v >> 8) & 0xff;
    bytes[o + 2] = (v >> 16) & 0xff; bytes[o + 3] = (v >>> 24) & 0xff;
  };
  put32(2, bytes.length);
  put32(10, dataOffset);
  put32(14, 40);
  put32(18, width);
  put32(22, height);           // positive: rows stored bottom-up
  bytes[26] = 1;
  bytes[28] = 8;
  put32(34, stride * height);
  // A greyscale ramp so wolfInkRamp has something to find.
  for (let i = 0; i < 256; i++) {
    const o = 54 + i * 4;
    bytes[o] = bytes[o + 1] = bytes[o + 2] = i;
  }
  // Mark the top-left pixel of the image so row order is testable.
  bytes[dataOffset + (height - 1) * stride] = 9;
  return bytes;
}

describe("Wolfenstein RPG bitmap font", () => {
  it("round-trips a font byte for byte", () => {
    const src = makeFont(13, 18);
    expect(Buffer.from(serialiseWolfFont(parseWolfFont(src)))).toEqual(Buffer.from(src));
  });

  it("derives the cell size from the image, since the engine does too", () => {
    const font = parseWolfFont(makeFont(13, 18));
    expect(font.cellWidth).toBe(13);
    expect(font.cellHeight).toBe(18);
    expect(font.width).toBe(13 * 16);
    expect(font.height).toBe(18 * 9);
  });

  it("reads bottom-up rows the right way up", () => {
    // The marker was written to the last stored row, which is image row 0.
    const font = parseWolfFont(makeFont(13, 18));
    expect(font.pixels[0]).toBe(9);
  });

  it("places cells in reading order, 16 per row", () => {
    const font = parseWolfFont(makeFont(13, 18));
    expect(wolfCellOrigin(font, 0)).toEqual({ x: 0, y: 0 });
    expect(wolfCellOrigin(font, 15)).toEqual({ x: 15 * 13, y: 0 });
    expect(wolfCellOrigin(font, 16)).toEqual({ x: 0, y: 18 });
    expect(() => wolfCellOrigin(font, 144)).toThrow();
  });

  it("draws a glyph inside its own cell and nowhere else", () => {
    const font = parseWolfFont(makeFont(13, 18));
    const glyph = { width: 13, height: 18, coverage: new Uint8Array(13 * 18).fill(255) };
    drawGlyphIntoCell(font, 20, glyph, [1, 8, 15]);
    const { x, y } = wolfCellOrigin(font, 20);
    expect(font.pixels[(y + 5) * font.width + x + 5]).toBe(15);
    // The neighbouring cell must be untouched.
    const n = wolfCellOrigin(font, 21);
    expect(font.pixels[(n.y + 5) * font.width + n.x + 5]).toBe(0);
  });

  it("clears whatever the cell held before", () => {
    const font = parseWolfFont(makeFont(13, 18));
    const { x, y } = wolfCellOrigin(font, 3);
    font.pixels[(y + 2) * font.width + x + 2] = 15;
    drawGlyphIntoCell(font, 3, { width: 1, height: 1, coverage: new Uint8Array([255]) }, [15]);
    expect(font.pixels[(y + 2) * font.width + x + 2]).toBe(0);
  });

  it("maps coverage onto the font's own ink ramp", () => {
    const font = parseWolfFont(makeFont(13, 18));
    const glyph = { width: 3, height: 1, coverage: new Uint8Array([0, 128, 255]) };
    drawGlyphIntoCell(font, 0, glyph, [4, 9, 15]);
    const row = font.pixels.slice(Math.floor((18 - 1) / 2) * font.width + 5, Math.floor((18 - 1) / 2) * font.width + 8);
    expect(row[0]).toBe(0);   // no coverage stays transparent
    expect(row[1]).toBe(9);   // half coverage picks the middle of the ramp
    expect(row[2]).toBe(15);  // full coverage picks the darkest ink
  });

  it("never writes outside the cell, even for an oversized glyph", () => {
    const font = parseWolfFont(makeFont(13, 18));
    const glyph = { width: 40, height: 40, coverage: new Uint8Array(40 * 40).fill(255) };
    drawGlyphIntoCell(font, 0, glyph, [15]);
    const n = wolfCellOrigin(font, 1);
    expect(font.pixels[n.y * font.width + n.x]).toBe(0);
    expect(font.pixels[18 * font.width]).toBe(0); // the cell below
  });

  it("reports the ink shades the font already uses", () => {
    const font = parseWolfFont(makeFont(13, 18));
    // Cell 5, so the marker pixel in cell 0 survives and shows that reading
    // the ramp looks at the whole font, not just what was drawn.
    drawGlyphIntoCell(font, 5, { width: 3, height: 1, coverage: new Uint8Array([255, 128, 40]) }, [3, 9, 12]);
    expect(wolfInkRamp(font)).toEqual([3, 9, 12]);
  });

  it("refuses a bitmap that is not a whole grid of cells", () => {
    const bad = makeFont(13, 18);
    bad[18] = 13 * 16 + 1; // width no longer divides by 16
    expect(() => parseWolfFont(bad)).toThrow(/grid/);
  });
});
