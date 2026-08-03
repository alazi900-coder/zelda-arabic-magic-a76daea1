import { describe, it, expect } from "vitest";
import {
  EMERALD_GLYPH_BYTES,
  EMERALD_GLYPH_COUNT,
  EMERALD_GLYPH_SIZE,
  emeraldGlyphInkWidth,
  findEmeraldFont,
  readEmeraldGlyph,
  writeEmeraldGlyph,
} from "@/lib/gba/emerald-font";
import {
  EMERALD_CARRIER_CODES,
  EMERALD_BLANK_CODES,
  EMERALD_ARABIC_WIDTH,
  applyEmeraldArabicFont,
  encodeArabicForEmerald,
  decodeEmeraldBytes,
} from "@/lib/gba/emerald-arabic";
import { shapeArabicForRisen } from "@/lib/risen/arabic-shaper";

/** Where the font sits in the made-up ROM below. */
const WIDTHS = 0x1000;
const GLYPHS = WIDTHS + 0x200;

/**
 * A ROM shaped like Emerald's: a widths table, then 256 cells, and each cell
 * inked exactly as far as its width says. That agreement is the whole of what
 * the finder looks for, and drawing it by hand is what proves the finder is
 * reading structure rather than remembering an address.
 */
function emeraldRom(blanks: number[]): Uint8Array {
  const rom = new Uint8Array(GLYPHS + EMERALD_GLYPH_COUNT * EMERALD_GLYPH_BYTES + 0x400);
  const font = { glyphs: GLYPHS, widths: WIDTHS };
  for (let code = 0; code < EMERALD_GLYPH_COUNT; code++) {
    if (blanks.includes(code) || code === 0) {
      rom[WIDTHS + code] = 3;
      continue;
    }
    const width = 3 + (code % 6);
    rom[WIDTHS + code] = width;
    const cell = new Uint8Array(EMERALD_GLYPH_SIZE * EMERALD_GLYPH_SIZE);
    for (let y = 2; y < 13; y++) {
      for (let x = 0; x < width; x++) {
        // A shape that differs from cell to cell, and reaches the last column
        // so the ink is exactly as wide as the width claims.
        cell[y * EMERALD_GLYPH_SIZE + x] = x === width - 1 || (y + code + x) % 3 === 0 ? 1 : 3;
      }
    }
    writeEmeraldGlyph(rom, font, code, cell);
  }
  return rom;
}

describe("Emerald — reading and writing one letter", () => {
  it("gives back every pixel it was handed", () => {
    // The bytes of a row run right to left and the cell is four tiles, not one.
    // Getting either wrong is what made this font read as noise for a whole
    // session, and a round trip is what catches it.
    const rom = new Uint8Array(GLYPHS + EMERALD_GLYPH_COUNT * EMERALD_GLYPH_BYTES);
    const font = { glyphs: GLYPHS, widths: WIDTHS };
    const cell = new Uint8Array(EMERALD_GLYPH_SIZE * EMERALD_GLYPH_SIZE);
    for (let i = 0; i < cell.length; i++) cell[i] = (i * 7 + (i >> 4)) % 4;
    writeEmeraldGlyph(rom, font, 0x42, cell);
    expect(readEmeraldGlyph(rom, font, 0x42)).toEqual(cell);
  });

  it("writes one cell without touching its neighbours", () => {
    const rom = new Uint8Array(GLYPHS + EMERALD_GLYPH_COUNT * EMERALD_GLYPH_BYTES);
    rom.fill(0xaa, GLYPHS + 0x41 * EMERALD_GLYPH_BYTES, GLYPHS + 0x43 * EMERALD_GLYPH_BYTES);
    const font = { glyphs: GLYPHS, widths: WIDTHS };
    writeEmeraldGlyph(rom, font, 0x42, new Uint8Array(EMERALD_GLYPH_SIZE * EMERALD_GLYPH_SIZE));
    expect(rom[GLYPHS + 0x41 * EMERALD_GLYPH_BYTES]).toBe(0xaa);
    expect(rom[GLYPHS + 0x43 * EMERALD_GLYPH_BYTES - 1]).toBe(0);
  });

  it("measures how far a drawing reaches", () => {
    const cell = new Uint8Array(EMERALD_GLYPH_SIZE * EMERALD_GLYPH_SIZE);
    cell[3 * EMERALD_GLYPH_SIZE + 5] = 2;
    expect(emeraldGlyphInkWidth(cell)).toBe(6);
    expect(emeraldGlyphInkWidth(new Uint8Array(EMERALD_GLYPH_SIZE * EMERALD_GLYPH_SIZE))).toBe(0);
  });
});

describe("Emerald — finding the font without being told where it is", () => {
  it("finds it by the widths agreeing with the drawings", () => {
    expect(findEmeraldFont(emeraldRom([0x0a]))).toEqual({ glyphs: GLYPHS, widths: WIDTHS });
  });

  it("refuses when a drawing runs past what its width allows", () => {
    // Two unrelated regions can look like a table and a picture; what they
    // cannot do is agree, cell by cell, about where each drawing ends.
    const rom = emeraldRom([]);
    rom[WIDTHS + 0x40] = 1;
    rom[WIDTHS + 0x41] = 1;
    expect(findEmeraldFont(rom)).toBeNull();
  });

  it("says nothing rather than guess when there is no font", () => {
    expect(findEmeraldFont(new Uint8Array(0x8000).fill(7))).toBeNull();
  });
});

describe("Emerald — Arabic in the codes the game does not print", () => {
  it("leaves every symbol the game still needs", () => {
    // Each of these is inside the range Arabic draws from, and each is one the
    // game prints: the level marker, POKé's own two glyphs, the é between them,
    // the arrows inside real lines, and the brackets.
    for (const kept of [0x1b, 0x34, 0x50, 0x53, 0x54, 0x55, 0x56, 0x5b, 0x5c, 0x5d, 0x79, 0x7a, 0x7b, 0x7c]) {
      expect(EMERALD_CARRIER_CODES).not.toContain(kept);
    }
    // Nor any letter, digit or mark of the Latin alphabet the game writes with.
    expect(EMERALD_CARRIER_CODES.every((c) => c < 0xa0)).toBe(true);
    expect(new Set(EMERALD_CARRIER_CODES).size).toBe(EMERALD_CARRIER_CODES.length);
  });

  it("shapes, reverses and comes back to the same letters", () => {
    const line = "هل تريد الحفظ";
    const { bytes, unmapped } = encodeArabicForEmerald(line);
    expect(unmapped).toEqual([]);
    // Every Arabic byte is one of the codes set aside for it — nothing lands on
    // a glyph the game still draws.
    const arabic = [...bytes].filter((b) => b !== 0x00);
    expect(arabic.every((b) => EMERALD_CARRIER_CODES.includes(b))).toBe(true);
    // And every byte draws the shape the shaper chose for it, in the order the
    // engine draws them — the line, shaped and reversed, and nothing lost.
    expect(decodeEmeraldBytes(bytes)).toBe(shapeArabicForRisen(line));
  });

  it("keeps a line break and the Latin digits", () => {
    const { bytes } = encodeArabicForEmerald("سطر\n2024");
    expect(bytes).toContain(0xfe);
    expect([...bytes].slice(-4)).toEqual([0xa3, 0xa1, 0xa3, 0xa5]);
  });
});

describe("Emerald — drawing Arabic into a ROM", () => {
  const blanks = EMERALD_BLANK_CODES;

  it("fills the carriers, sets their width, and leaves the letters alone", () => {
    const rom = emeraldRom(blanks);
    const before = new Uint8Array(rom);
    const { rom: out, font } = applyEmeraldArabicFont(rom);

    // Latin is untouched, byte for byte.
    for (const latin of [0x00, 0xbb, 0xd5, 0xa1, 0x34, 0x53]) {
      const at = font.glyphs + latin * EMERALD_GLYPH_BYTES;
      expect(out.subarray(at, at + EMERALD_GLYPH_BYTES)).toEqual(
        before.subarray(at, at + EMERALD_GLYPH_BYTES)
      );
      expect(out[font.widths + latin]).toBe(before[font.widths + latin]);
    }

    for (const code of EMERALD_CARRIER_CODES) {
      const cell = readEmeraldGlyph(out, font, code);
      expect(out[font.widths + code]).toBe(EMERALD_ARABIC_WIDTH);
      // Nothing past the width, and the bottom row clear — the two rules every
      // glyph the game ships obeys, and the blitter enforces the first.
      expect(emeraldGlyphInkWidth(cell)).toBeLessThanOrEqual(EMERALD_ARABIC_WIDTH);
      for (let x = 0; x < EMERALD_GLYPH_SIZE; x++) expect(cell[15 * EMERALD_GLYPH_SIZE + x]).toBe(0);
    }

    // The comma is a real drawing, not an empty cell.
    const comma = readEmeraldGlyph(out, font, EMERALD_CARRIER_CODES[0]);
    expect(comma.some((v) => v === 1)).toBe(true);
  });

  it("refuses a ROM whose empty cells are no longer empty", () => {
    // A ROM someone else has already patched no longer matches the list of
    // codes that are safe to take, and writing anyway costs it a symbol.
    const rom = emeraldRom(blanks.slice(1));
    expect(() => applyEmeraldArabicFont(rom)).toThrow("مُعدَّل");
  });
});
