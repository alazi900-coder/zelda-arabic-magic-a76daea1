import { describe, it, expect } from "vitest";
import {
  parseWolfFont, serialiseWolfFont, wolfCellOrigin, drawGlyphIntoCell, wolfInkStyle,
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
    drawGlyphIntoCell(font, 20, glyph, { body: 1, outline: 15 });
    const { x, y } = wolfCellOrigin(font, 20);
    expect(font.pixels[(y + 5) * font.width + x + 5]).toBe(1);
    const n = wolfCellOrigin(font, 21);
    expect(font.pixels[(n.y + 5) * font.width + n.x + 5]).toBe(0);
  });

  it("clears whatever the cell held before", () => {
    const font = parseWolfFont(makeFont(13, 18));
    const { x, y } = wolfCellOrigin(font, 3);
    font.pixels[(y + 2) * font.width + x + 2] = 15;
    drawGlyphIntoCell(font, 3, { width: 1, height: 1, coverage: new Uint8Array([255]) }, { body: 1, outline: 15 });
    expect(font.pixels[(y + 2) * font.width + x + 2]).toBe(0);
  });

  it("gives the glyph the outline the game's own letters have", () => {
    // A single solid pixel must come out as body surrounded by outline —
    // without it, new letters read as flat blobs next to the originals.
    const font = parseWolfFont(makeFont(13, 18));
    drawGlyphIntoCell(font, 4, { width: 1, height: 1, coverage: new Uint8Array([255]) }, { body: 7, outline: 12 });
    const { x, y } = wolfCellOrigin(font, 4);
    const cx = x + Math.floor((13 - 1) / 2);
    const cy = y + Math.floor((18 - 1) / 2);
    expect(font.pixels[cy * font.width + cx]).toBe(7);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      expect(font.pixels[(cy + dy) * font.width + cx + dx]).toBe(12);
    }
    // Diagonals stay clear, so the outline is one pixel and not a blob.
    expect(font.pixels[(cy + 1) * font.width + cx + 1]).toBe(0);
  });

  it("treats faint coverage as nothing rather than smearing the cell", () => {
    const font = parseWolfFont(makeFont(13, 18));
    drawGlyphIntoCell(font, 6, { width: 1, height: 1, coverage: new Uint8Array([40]) }, { body: 7, outline: 12 });
    const { x, y } = wolfCellOrigin(font, 6);
    let painted = 0;
    for (let yy = 0; yy < 18; yy++) for (let xx = 0; xx < 13; xx++) if (font.pixels[(y + yy) * font.width + x + xx]) painted++;
    expect(painted).toBe(0);
  });

  it("never writes outside the cell, even for an oversized glyph", () => {
    const font = parseWolfFont(makeFont(13, 18));
    const glyph = { width: 40, height: 40, coverage: new Uint8Array(40 * 40).fill(255) };
    drawGlyphIntoCell(font, 0, glyph, { body: 1, outline: 15 });
    const n = wolfCellOrigin(font, 1);
    expect(font.pixels[n.y * font.width + n.x]).toBe(0);
    expect(font.pixels[18 * font.width]).toBe(0);
  });

  it("finds the body and outline colours a real font is drawn with", () => {
    // A glyph shaped the way the game draws them: a filled block with a ring.
    const font = parseWolfFont(makeFont(13, 18));
    for (let y = 3; y <= 9; y++) {
      for (let x = 3; x <= 9; x++) {
        const edge = y === 3 || y === 9 || x === 3 || x === 9;
        font.pixels[y * font.width + x] = edge ? 31 : 7;
      }
    }
    expect(wolfInkStyle(font)).toEqual({ body: 7, outline: 31 });
  });

  it("refuses a bitmap that is not a whole grid of cells", () => {
    const bad = makeFont(13, 18);
    bad[18] = 13 * 16 + 1; // width no longer divides by 16
    expect(() => parseWolfFont(bad)).toThrow(/grid/);
  });
});
