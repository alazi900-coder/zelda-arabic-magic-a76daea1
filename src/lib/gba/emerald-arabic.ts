/**
 * Arabic in Pokémon Emerald: which of the game's own codes carry it.
 *
 * The engine has no room for a new alphabet — a string is bytes, and every
 * byte already means something. So Arabic moves into codes the English build
 * never prints, and each one is listed here rather than guessed at, because
 * taking the wrong one costs the game a symbol it needs. `Lv`, `PK`, `MN`,
 * `%`, the brackets, the four arrows and `é` are all inside the range Arabic
 * draws from, and none of them is touched.
 *
 * Three sets, in the order they are handed out — safest first:
 *
 *   82 codes whose cell in the shipped ROM is empty. Nothing can be lost by
 *      taking a drawing that does not exist.
 *   37 accented Latin letters (À Á Â Ç È … ñ), which an English build has no
 *      word for. `é` is excluded: it is the byte between "POK" and "MON".
 *    9 marks that survive translation without being missed — º ª ᵉʳ & + = ;
 *      ¿ ¡ — taken last, and only because Arabic needs exactly nine more.
 *
 * That comes to 128, which is exactly the number of shapes the shaper can
 * emit: 125 presentation forms plus ، ؛ ؟. Nothing is left over and nothing
 * is short.
 *
 * The drawings are the ones already in this tool — hand-pixelled Arabic from
 * the Mother 3 fan translation, 8 wide and 16 tall — converted from four bits
 * a pixel to Emerald's two, and lifted one row so the bottom row stays clear
 * as it is under every letter the game ships. Every carrier's width is set to
 * 8: the glyphs were drawn to reach both edges of the cell, so at a full-cell
 * advance the joining strokes meet and the letters connect.
 */

import { PKM_ARABIC_GLYPHS_B64, PKM_GLYPH_BYTES } from "@/lib/pokemon/pkm-font";
import {
  decodeBytesWithTables,
  encodeArabicWithTables,
  pkmGlyphCodepoints,
  type PkmCharTables,
  type PkmEncodeResult,
} from "@/lib/pokemon/pkm-charmap";
import {
  EMERALD_GLYPH_SIZE,
  EMERALD_GLYPH_LAST_ROW,
  findEmeraldFont,
  isEmeraldGlyphBlank,
  readEmeraldGlyph,
  writeEmeraldGlyph,
  type EmeraldFont,
} from "./emerald-font";

/** How far every Arabic carrier advances: the whole cell, so letters join. */
export const EMERALD_ARABIC_WIDTH = 8;

/** Codes whose cell the shipped ROM leaves empty — the ROM is checked against this. */
export const EMERALD_BLANK_CODES = expand([
  [0x0a, 0x0a], [0x18, 0x18], [0x1f, 0x1f], [0x2f, 0x33], [0x37, 0x4f],
  [0x5e, 0x67], [0x69, 0x6e], [0x70, 0x76], [0x78, 0x78], [0x87, 0x9f],
]);

/** The byte between "POK" and "MON" — an Arabic letter here shows up in it. */
const RESERVED_ACCENT = 0x1b;

/** Accented Latin the English build has no word for. */
const ACCENT_CODES = expand([[0x01, 0x29]]).filter(
  (c) => c !== RESERVED_ACCENT && !EMERALD_BLANK_CODES.includes(c)
);

/** º ª ᵉʳ & + = ; ¿ ¡ — given up last, and only because nine are needed. */
const SPARE_CODES = [0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x35, 0x36, 0x51, 0x52];

function expand(ranges: [number, number][]): number[] {
  const out: number[] = [];
  for (const [first, last] of ranges) for (let c = first; c <= last; c++) out.push(c);
  return out;
}

/** Every code Arabic may occupy, safest first. */
export const EMERALD_CARRIER_CODES: readonly number[] = [
  ...EMERALD_BLANK_CODES,
  ...ACCENT_CODES,
  ...SPARE_CODES,
];

/** Every shape the shaper emits, ascending — see `pkm-charmap` for the same list. */
function arabicCodepoints(): number[] {
  return pkmGlyphCodepoints().filter((cp) => cp !== 0x0621);
}

const ARABIC_TO_CODE = new Map<number, number>();
const CODE_TO_ARABIC = new Map<number, number>();
{
  const needed = arabicCodepoints();
  if (needed.length !== EMERALD_CARRIER_CODES.length) {
    throw new Error(
      `العربية تحتاج ${needed.length} خانة والمتاح ${EMERALD_CARRIER_CODES.length}`
    );
  }
  needed.forEach((cp, i) => {
    ARABIC_TO_CODE.set(cp, EMERALD_CARRIER_CODES[i]);
    CODE_TO_ARABIC.set(EMERALD_CARRIER_CODES[i], cp);
  });
}

/** Latin, digits and the marks Arabic text still uses, in the game's own codes. */
const LATIN_TO_BYTE = new Map<string, number>();
const BYTE_TO_LATIN = new Map<number, string>();
{
  const add = (ch: string, byte: number) => {
    LATIN_TO_BYTE.set(ch, byte);
    BYTE_TO_LATIN.set(byte, ch);
  };
  add(" ", 0x00);
  "0123456789".split("").forEach((c, i) => add(c, 0xa1 + i));
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((c, i) => add(c, 0xbb + i));
  "abcdefghijklmnopqrstuvwxyz".split("").forEach((c, i) => add(c, 0xd5 + i));
  // The marks between 0xAB and 0xBA, read off the ROM's own cells rather than
  // remembered. Naming them matters: 3703 of this game's lines carry `…` and
  // 1111 carry `-`, and an unnamed byte reaches the translator as `{b0}`.
  add("!", 0xab);
  add("?", 0xac);
  add(".", 0xad);
  add("-", 0xae);
  add("·", 0xaf);
  add("…", 0xb0);
  add("“", 0xb1);
  add("”", 0xb2);
  add("‘", 0xb3);
  add("♂", 0xb5);
  add("♀", 0xb6);
  add(",", 0xb8);
  add("×", 0xb9);
  add("/", 0xba);
  // The low codes the English build still prints, which is exactly why Arabic
  // was kept out of them: `é` sits between POK and MON in 2984 of this game's
  // lines, and the arrows sit inside real sentences.
  add("é", 0x1b);
  add("↑", 0x79);
  add("↓", 0x7a);
  add("←", 0x7b);
  add("→", 0x7c);
  // Both apostrophes write 0xB4; the curly one is what it reads back as, so a
  // line that came out of the ROM goes back into it unchanged.
  add("'", 0xb4);
  add("’", 0xb4);
  // 0xB7 is the game's own money sign, which no character stands for. It is
  // left unnamed rather than given a wrong one: the translator sees `{b7}`,
  // keeps it, and it goes back as the byte it was.
}

/** The engine's own line break. */
export const EMERALD_NEWLINE = 0xfe;
/** The byte that ends a string. */
export const EMERALD_TERMINATOR = 0xff;

/** This game's four tables, for the shared Gen 3 reader and writer. */
export function emeraldCharTables(): PkmCharTables {
  return {
    arabicToByte: ARABIC_TO_CODE,
    byteToArabic: CODE_TO_ARABIC,
    latinToByte: LATIN_TO_BYTE,
    byteToLatin: BYTE_TO_LATIN,
  };
}

/**
 * One line of ordinary Arabic into the bytes this engine draws.
 *
 * The engine has no bidi and no shaping: it takes bytes left to right and
 * draws whatever each one holds. So the text is shaped into its presentation
 * forms and reversed at build time, and the editor keeps holding plain logical
 * Arabic. The shaping, the reversal and the handling of the game's own codes
 * are the same work Ruby Destiny needs, so they are done in one place — only
 * the tables above are this game's.
 */
export function encodeArabicForEmerald(text: string): PkmEncodeResult {
  return encodeArabicWithTables(text, emeraldCharTables());
}

/**
 * Reads those bytes back. Arabic comes back as presentation forms — this is
 * for checking a build, not for the editor, which holds logical Arabic.
 */
export function decodeEmeraldBytes(bytes: Uint8Array): string {
  return decodeBytesWithTables(bytes, emeraldCharTables());
}

/** The 4-bit drawings, as shipped. */
function pkmGlyphBytes(): Uint8Array {
  const bin = atob(PKM_ARABIC_GLYPHS_B64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * One Mother 3 glyph as an Emerald cell.
 *
 * The source is 8x16 at four bits a pixel, where 15 is the letter and 14 its
 * shadow. Emerald wants two bits, where 1 is the letter, 2 the shadow, 3 the
 * background inside the letter's width and 0 everything past it. The drawing
 * is lifted one row, because it sits on rows 3..15 and no glyph in the game
 * inks row 15.
 */
function toEmeraldCell(source: Uint8Array): Uint8Array {
  const cell = new Uint8Array(EMERALD_GLYPH_SIZE * EMERALD_GLYPH_SIZE);
  for (let y = 0; y < EMERALD_GLYPH_LAST_ROW; y++) {
    for (let x = 0; x < EMERALD_ARABIC_WIDTH; x++) cell[y * EMERALD_GLYPH_SIZE + x] = 3;
  }
  for (let y = 0; y < EMERALD_GLYPH_SIZE; y++) {
    const row = y - 1;
    if (row < 0 || row >= EMERALD_GLYPH_LAST_ROW) continue;
    for (let x = 0; x < EMERALD_ARABIC_WIDTH; x++) {
      const value = (source[y * 4 + (x >> 1)] >> (4 * (x & 1))) & 0xf;
      if (value === 15) cell[row * EMERALD_GLYPH_SIZE + x] = 1;
      else if (value === 14) cell[row * EMERALD_GLYPH_SIZE + x] = 2;
    }
  }
  return cell;
}

/** The cell this codepoint's drawing becomes, or null when there is none. */
function arabicCell(cp: number): Uint8Array | null {
  const index = pkmGlyphCodepoints().indexOf(cp);
  if (index < 0) return null;
  const glyphs = pkmGlyphBytes();
  return toEmeraldCell(glyphs.subarray(index * PKM_GLYPH_BYTES, (index + 1) * PKM_GLYPH_BYTES));
}

/**
 * True when this ROM already carries the Arabic glyphs — it came out of a build.
 *
 * Worth asking before anything else is read from it. The scanner recognises a
 * line by the game's own character set, and Arabic lives in codes that set does
 * not contain, so a line already written in Arabic is invisible to it: opening
 * a built ROM in the editor would quietly drop every translation belonging to a
 * line that had vanished.
 *
 * The test is one cell against the drawing that would be written into it —
 * cheaper than reading them all, and decisive, because no unrelated ROM has
 * that exact 64 bytes in that exact code.
 */
export function hasEmeraldArabicFont(rom: Uint8Array): boolean {
  const font = findEmeraldFont(rom);
  if (!font) return false;
  const [cp, code] = [...ARABIC_TO_CODE][0];
  const expected = arabicCell(cp);
  if (!expected) return false;
  const found = readEmeraldGlyph(rom, font, code);
  return expected.every((v, i) => v === found[i]);
}

/**
 * Draws Arabic into a copy of the ROM.
 *
 * It refuses rather than guess. If the font cannot be found the ROM is not
 * Emerald as this code understands it; if a cell listed as empty is not, the
 * ROM has been changed and the list of safe codes no longer describes it —
 * writing anyway would quietly cost the game a symbol.
 */
export function applyEmeraldArabicFont(rom: Uint8Array): { rom: Uint8Array; font: EmeraldFont } {
  const font = findEmeraldFont(rom);
  if (!font) throw new Error("لم أجد خطّ اللعبة في هذا الملف — هل هو روم Pokémon Emerald؟");

  const taken = EMERALD_BLANK_CODES.filter((code) => !isEmeraldGlyphBlank(rom, font, code));
  if (taken.length > 0) {
    const list = taken.slice(0, 6).map((c) => `0x${c.toString(16).toUpperCase()}`).join("، ");
    throw new Error(`خانات كان يجب أن تكون فارغة وفيها رسمٌ الآن: ${list} — الروم مُعدَّل مسبقاً`);
  }

  const out = new Uint8Array(rom);
  for (const [cp, code] of ARABIC_TO_CODE) {
    const cell = arabicCell(cp);
    if (!cell) throw new Error(`لا رسم للحرف U+${cp.toString(16).toUpperCase()}`);
    writeEmeraldGlyph(out, font, code, cell);
    out[font.widths + code] = EMERALD_ARABIC_WIDTH;
  }
  return { rom: out, font };
}
