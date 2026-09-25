/**
 * Overlays the hand-drawn Arabic glyphs onto Golden Sun's own font table.
 *
 * The font (`Data_32224` in the decomp) lives at ROM offset 0x32224: one
 * 32-byte cell per character code from 0x20 up (a u16 advance width, then 15
 * rows of u16). The overlay never touches the Latin cells the ROM already
 * has -- it only replaces the ~125 slots this project always uses for a
 * hand-drawn font: 0x90-0xFF except 0xDE/0xDF (110 codes, the common
 * presentation forms), which stay the Japanese voicing marks the renderer
 * folds into the previous glyph, and 13 otherwise-unused ASCII slots for the
 * rare forms. That is why this file needs the user's uploaded ROM to build
 * anything -- everything else in the cell it writes is the ROM's own,
 * unmodified. See goldensun-arabic/scripts/gsfont.py for how the codes
 * below were chosen.
 */
import { GOLDENSUN_ARABIC_CODEPOINTS, GOLDENSUN_ARABIC_GLYPH_CELLS_B64 } from "./goldensun-arabic-glyphs";

export const GOLDENSUN_FONT_OFFSET = 0x32224;
export const GOLDENSUN_FONT_FIRST_CHAR = 0x20;
export const GOLDENSUN_FONT_CELL_BYTES = 32;
/** Chars 0x20-0xFF: (0x100-0x20) cells of 32 bytes. */
export const GOLDENSUN_FONT_TABLE_BYTES = (0x100 - GOLDENSUN_FONT_FIRST_CHAR) * GOLDENSUN_FONT_CELL_BYTES;

/** 0xDE/0xDF stay the dakuten/handakuten marks AdvanceMsgText folds into the previous glyph. */
const RARE_OVERFLOW_SLOTS = [0x8c, 0x8d, 0x3c, 0x3e, 0x40, 0x5b, 0x5c, 0x5d, 0x5e, 0x60, 0x7b, 0x7c, 0x7d, 0x7e, 0x7f];
const COMMON_HIGH_SLOTS: number[] = [];
for (let b = 0x90; b <= 0xff; b++) if (b !== 0xde && b !== 0xdf) COMMON_HIGH_SLOTS.push(b);

/**
 * Codepoint -> byte the text encoder writes for it. The 15 rarest
 * presentation forms (isolated/medial forms barely used once shaped) go to
 * the 15 spare ASCII slots; the other 110 (every codepoint actually reached
 * by `reshapeArabic` for this font's coverage) take 0x90-0xFF.
 */
export const GOLDENSUN_ARABIC_BYTE_MAP: Record<number, number> = (() => {
  // In this exact order: gsfont.py pairs this list with the overflow slots
  // one-to-one, and the RTL+font patch's font was drawn from it.
  const rare = [0xfef5, 0xfef6, 0xfef7, 0xfef8, 0xfef9, 0xfefa, 0xfe81, 0xfe82, 0xfe85, 0xfe86, 0xfec5, 0xfec6, 0xfe99, 0xfe9a, 0xfe89];
  const rareSet = new Set(rare);
  const common = GOLDENSUN_ARABIC_CODEPOINTS.filter((cp) => !rareSet.has(cp));
  if (common.length !== COMMON_HIGH_SLOTS.length || rare.length !== RARE_OVERFLOW_SLOTS.length) {
    throw new Error("goldensun-arabic-font: codepoint/slot count mismatch");
  }
  const map: Record<number, number> = {};
  common.forEach((cp, i) => (map[cp] = COMMON_HIGH_SLOTS[i]));
  rare.forEach((cp, i) => (map[cp] = RARE_OVERFLOW_SLOTS[i]));
  return map;
})();

/** Every byte 0x90-0xFF (minus 0xDE/0xDF) plus the 15 overflow ASCII slots -- what the RTL byte tests must accept as "Arabic, one byte, don't touch". */
export const GOLDENSUN_ARABIC_BYTES: number[] = [...COMMON_HIGH_SLOTS, ...RARE_OVERFLOW_SLOTS];

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Returns a copy of the ROM's font table (read from the user's own upload
 * at GOLDENSUN_FONT_OFFSET) with the Arabic cells overlaid. Every other
 * cell -- every Latin letter, digit and symbol the ROM already draws -- is
 * passed through untouched.
 */
export function buildGoldenSunFont(rom: Uint8Array): Uint8Array {
  const table = rom.slice(GOLDENSUN_FONT_OFFSET, GOLDENSUN_FONT_OFFSET + GOLDENSUN_FONT_TABLE_BYTES);
  const cells = b64ToBytes(GOLDENSUN_ARABIC_GLYPH_CELLS_B64);
  GOLDENSUN_ARABIC_CODEPOINTS.forEach((cp, i) => {
    const byte = GOLDENSUN_ARABIC_BYTE_MAP[cp];
    const at = (byte - GOLDENSUN_FONT_FIRST_CHAR) * GOLDENSUN_FONT_CELL_BYTES;
    table.set(cells.subarray(i * 32, i * 32 + 32), at);
  });
  return table;
}
