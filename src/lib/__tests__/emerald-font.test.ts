import { describe, it, expect } from "vitest";
import {
  EMERALD_GLYPH_BYTES,
  EMERALD_GLYPH_COUNT,
  EMERALD_GLYPH_SIZE,
  emeraldGlyphInkWidth,
  findEmeraldFont,
  findEmeraldFonts,
  readEmeraldGlyph,
  renderEmeraldLine,
  writeEmeraldGlyph,
} from "@/lib/gba/emerald-font";
import {
  EMERALD_CARRIER_CODES,
  EMERALD_BLANK_CODES,
  EMERALD_ARABIC_CELL,
  applyEmeraldArabicFont,
  emeraldCharTables,
  encodeArabicForEmerald,
  decodeEmeraldBytes,
} from "@/lib/gba/emerald-arabic";
import { shapeArabicForRisen } from "@/lib/risen/arabic-shaper";

/**
 * Where the fonts sit in the made-up ROM below.
 *
 * The widths table is 0x8000 *after* its glyphs — the game's own layout, read
 * out of its code. Putting it before, where a different font's table happens to
 * sit, is the mistake this file now guards: that pairing looks right (the fonts
 * are one alphabet at several sizes, so their widths nearly agree) and quietly
 * writes every advance into a font that has no Arabic in it.
 */
const GLYPHS = 0x1000;
const WIDTHS = GLYPHS + 0x8000;
/** A second font, clear of the first's 0x4000 of cells and of its widths. */
const GLYPHS2 = 0x9200;
const WIDTHS2 = GLYPHS2 + 0x8000;

/**
 * A ROM shaped like Emerald's: a widths table, then 256 cells, and each cell
 * inked exactly as far as its width says. That agreement is the whole of what
 * the finder looks for, and drawing it by hand is what proves the finder is
 * reading structure rather than remembering an address.
 */
function emeraldRom(blanks: number[], fonts: { glyphs: number; widths: number }[] = [
  { glyphs: GLYPHS, widths: WIDTHS },
  { glyphs: GLYPHS2, widths: WIDTHS2 },
]): Uint8Array {
  const rom = new Uint8Array(WIDTHS2 + 0x400);
  for (const font of fonts) {
    for (let code = 0; code < EMERALD_GLYPH_COUNT; code++) {
      if (blanks.includes(code) || code === 0) {
        rom[font.widths + code] = 3;
        continue;
      }
      const width = 3 + ((code + font.glyphs) % 6);
      rom[font.widths + code] = width;
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
  it("finds every font, each paired with its own widths", () => {
    // Not the first font only: this game has several and a window draws with
    // whichever it was given, so Arabic has to reach all of them.
    expect(findEmeraldFonts(emeraldRom([0x0a]))).toEqual([
      { glyphs: GLYPHS, widths: WIDTHS },
      { glyphs: GLYPHS2, widths: WIDTHS2 },
    ]);
  });

  it("does not pair a font's drawings with a neighbour's widths", () => {
    // The mistake that cost a round of builds: the wrong table is close enough
    // to look right, and every advance written into it lands in a font that has
    // no Arabic. Here the two fonts' widths disagree by construction.
    const rom = emeraldRom([]);
    for (const font of findEmeraldFonts(rom)) {
      expect(font.widths - font.glyphs).toBe(0x8000);
    }
  });

  it("refuses when too many drawings run past their width", () => {
    // Two unrelated regions can look like a table and a picture; what they
    // cannot do is agree, cell by cell, about where each drawing ends.
    const rom = emeraldRom([]);
    for (let code = 0x40; code < 0x60; code++) rom[WIDTHS + code] = 1;
    for (let code = 0x40; code < 0x60; code++) rom[WIDTHS2 + code] = 1;
    expect(findEmeraldFont(rom)).toBeNull();
  });

  it("says nothing rather than guess when there is no font", () => {
    expect(findEmeraldFont(new Uint8Array(0x20000).fill(7))).toBeNull();
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

  it("fills the carriers in every font, and leaves the letters alone", () => {
    const rom = emeraldRom(blanks);
    const before = new Uint8Array(rom);
    const { rom: out, fonts } = applyEmeraldArabicFont(rom);
    expect(fonts.length).toBe(2);
    const font = fonts[0];

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
      // The advance is the drawing's own width, not the cell's. A fixed 8 left
      // dead space behind every narrow letter, and in a short word that gap
      // reads as a break — «ولد» came out looking like half a word.
      const width = out[font.widths + code];
      expect(width).toBe(emeraldGlyphInkWidth(cell));
      expect(width).toBeGreaterThan(0);
      expect(width).toBeLessThanOrEqual(EMERALD_ARABIC_CELL);
      // And the bottom row stays clear, as it is under every letter the game ships.
      for (let x = 0; x < EMERALD_GLYPH_SIZE; x++) expect(cell[15 * EMERALD_GLYPH_SIZE + x]).toBe(0);
    }

    // The narrowing must cost no join: a form that connects on both sides has
    // ink in the last column, so it keeps the full cell. This is the guard —
    // without it, shrinking the advance would pull letters apart mid-word.
    const tables = emeraldCharTables();
    for (const joined of [0xfee0, 0xfe92, 0xfeae]) {
      const code = tables.arabicToByte.get(joined)!;
      expect(out[font.widths + code]).toBe(EMERALD_ARABIC_CELL);
    }
    // And something narrow really did shrink, or the test above proves nothing.
    expect(EMERALD_CARRIER_CODES.some((c) => out[font.widths + c] < EMERALD_ARABIC_CELL)).toBe(true);

    // The comma is a real drawing, not an empty cell.
    const comma = readEmeraldGlyph(out, font, EMERALD_CARRIER_CODES[0]);
    expect(comma.some((v) => v === 1)).toBe(true);

    // And the second font got the same treatment — a window drawing with it
    // must not come up blank.
    for (const other of fonts.slice(1)) {
      for (const code of EMERALD_CARRIER_CODES) {
        expect(readEmeraldGlyph(out, other, code)).toEqual(readEmeraldGlyph(out, font, code));
        expect(out[other.widths + code]).toBe(out[font.widths + code]);
      }
    }
  });

  it("previews a line the way the engine lays it out", () => {
    // The preview has to advance by each cell's own width, not by the cell —
    // that is what decides whether Arabic joins, and a picture of the letters
    // side by side would hide exactly the thing being judged.
    const { rom: out, fonts } = applyEmeraldArabicFont(emeraldRom(blanks));
    const font = fonts[0];
    const { bytes } = encodeArabicForEmerald("هل");
    const line = renderEmeraldLine(out, font, bytes, 1);
    let span = 0;
    for (const b of bytes) span += out[font.widths + b];
    expect(line.width).toBe(span);
    expect(line.height).toBe(EMERALD_GLYPH_SIZE);
    // And it draws something: the letters are there, not a blank strip.
    expect([...line.rgba].some((v) => v < 200)).toBe(true);
  });

  it("refuses a ROM whose empty cells are no longer empty", () => {
    // A ROM someone else has already patched no longer matches the list of
    // codes that are safe to take, and writing anyway costs it a symbol.
    const rom = emeraldRom(blanks.slice(1));
    expect(() => applyEmeraldArabicFont(rom)).toThrow("مُعدَّل");
  });
});
