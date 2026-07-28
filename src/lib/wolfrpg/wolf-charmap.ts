/**
 * Arabic for Wolfenstein RPG: which byte draws which glyph.
 *
 * The engine's font is a 16x9 grid of cells and the cell is picked straight
 * from the byte: `cell = byte - 0x21`. That was measured in-game — filling one
 * row of cells with ink turned exactly A..P into blocks, which is codes
 * 0x41..0x50, so the first cell is `!` and not the space. There are therefore
 * 144 drawable codes, 0x21..0xB0, and no more: the engine ignores extra rows
 * added to the bitmap (a taller atlas left byte 0xB0 drawing the last cell).
 *
 * 144 slots is less than Arabic wants, so the budget is spent deliberately:
 *
 *   16 codes stay Latin  — `!` `%` `.` `:` `0`-`9` `|`
 *                          Digits and punctuation appear in game text that
 *                          stays as it is (item counts, "%01" placeholders),
 *                          and `|` is the engine's line break: reusing its
 *                          code would turn every line break into a letter.
 *  129 codes carry Arabic — the 125 presentation forms the shaper can emit,
 *                          plus ء ، ؟ ؛
 *
 * Three characters are dropped at build time rather than given a slot:
 *   - tashkeel (harakat), which this engine cannot stack over a letter;
 *   - the tatweel ـ, a decorative stretch with no meaning;
 *   - Arabic-Indic digits ٠-٩, replaced by the ASCII digits already in the font.
 *
 * Direction is handled here too. The engine draws bytes left to right with no
 * bidi, so the text is shaped into presentation forms and reversed at build
 * time — the same approach already proven for Risen, Xenoblade and Metroid
 * Prime. Editor state keeps normal logical Arabic; only the bytes written into
 * the game are shaped and reversed.
 */

import { shapeArabicForRisen, RISEN_ARABIC_QMARK_ALIAS } from "@/lib/risen/arabic-shaper";

/** First and last byte the font can draw. */
export const WOLF_FIRST_CODE = 0x21;
export const WOLF_LAST_CODE = 0xb0;
export const WOLF_SLOT_COUNT = WOLF_LAST_CODE - WOLF_FIRST_CODE + 1; // 144

/** Codes whose Latin glyph must survive, because game text still uses them. */
export const WOLF_RESERVED_CODES: readonly number[] = [
  0x21, // !
  0x25, // % — "%01" parameter placeholders
  0x2e, // .
  0x3a, // :
  0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39,
  0x7c, // | — the engine's line break
];

/** Combining vowel marks: dropped, the engine has no way to stack them. */
const TASHKEEL_RE = /[ً-ٰٟ]/g;
const TATWEEL = 0x0640;
const ARABIC_INDIC_ZERO = 0x0660;

/** Every Arabic codepoint that gets a slot, ascending. */
function neededCodepoints(): number[] {
  const out: number[] = [0x060c, 0x061b, 0x061f, 0x0621]; // ، ؛ ؟ ء
  for (let c = 0xfe80; c <= 0xfefc; c++) out.push(c); // the presentation forms
  return out.sort((a, b) => a - b);
}

/** Codes free to carry Arabic, ascending. */
function freeCodes(): number[] {
  const reserved = new Set(WOLF_RESERVED_CODES);
  const out: number[] = [];
  for (let c = WOLF_FIRST_CODE; c <= WOLF_LAST_CODE; c++) if (!reserved.has(c)) out.push(c);
  return out;
}

function buildMap(): { toByte: Map<number, number>; toCodepoint: Map<number, number> } {
  const needed = neededCodepoints();
  const free = freeCodes();
  if (needed.length > free.length) {
    throw new Error(`Arabic needs ${needed.length} slots but only ${free.length} are free`);
  }
  const toByte = new Map<number, number>();
  const toCodepoint = new Map<number, number>();
  needed.forEach((cp, i) => {
    toByte.set(cp, free[i]);
    toCodepoint.set(free[i], cp);
  });
  return { toByte, toCodepoint };
}

const MAP = buildMap();

/** The byte that draws this Arabic codepoint, or null if it has no slot. */
export function wolfByteForCodepoint(cp: number): number | null {
  return MAP.toByte.get(cp) ?? null;
}

/** The Arabic codepoint a byte draws, or null if the byte stays Latin. */
export function wolfCodepointForByte(byte: number): number | null {
  return MAP.toCodepoint.get(byte) ?? null;
}

/**
 * What the font must contain, cell by cell: `slot[i]` is the codepoint to
 * draw in cell `i`, or null to leave that cell's original Latin glyph alone.
 * The font generator walks this and nothing else, so the font and the encoder
 * can never disagree about which cell holds which letter.
 */
export function wolfFontSlots(): (number | null)[] {
  const out: (number | null)[] = [];
  for (let c = WOLF_FIRST_CODE; c <= WOLF_LAST_CODE; c++) out.push(MAP.toCodepoint.get(c) ?? null);
  return out;
}

/** Normalises what the shaper emits into what actually has a slot. */
function normalise(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === RISEN_ARABIC_QMARK_ALIAS) {
      out += "؟"; // Risen's private-use swap has no meaning here
    } else if (cp === TATWEEL) {
      // A kashida only stretches a join; dropping it changes no word.
    } else if (cp >= ARABIC_INDIC_ZERO && cp <= ARABIC_INDIC_ZERO + 9) {
      out += String.fromCharCode(0x30 + (cp - ARABIC_INDIC_ZERO));
    } else {
      out += ch;
    }
  }
  return out;
}

export interface WolfEncodeResult {
  /** The bytes to store, as a latin1 string (one char per byte). */
  text: string;
  /** Characters that had no slot and were dropped, for reporting. */
  unmapped: string[];
}

/**
 * Turns logical Arabic into the bytes this engine draws: shaped into
 * presentation forms, reversed per line, then mapped to slots.
 *
 * Text with no Arabic in it is returned unchanged — an English line must not
 * be reversed or re-encoded.
 */
export function encodeArabicForWolf(text: string): WolfEncodeResult {
  const stripped = text.replace(TASHKEEL_RE, "");
  const shaped = normalise(shapeArabicForRisen(stripped));
  const unmapped: string[] = [];
  let out = "";
  for (const ch of shaped) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0xff && !MAP.toCodepoint.has(cp)) {
      // Plain ASCII / latin1 that keeps its own glyph.
      out += ch;
      continue;
    }
    const byte = MAP.toByte.get(cp);
    if (byte === undefined) {
      unmapped.push(ch);
      continue;
    }
    out += String.fromCharCode(byte);
  }
  return { text: out, unmapped };
}

/** Reads game bytes back as Arabic codepoints — for showing what a built file
 *  actually contains, which is the only way to check an encode end to end. */
export function decodeWolfBytes(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = MAP.toCodepoint.get(ch.charCodeAt(0));
    out += cp === undefined ? ch : String.fromCodePoint(cp);
  }
  return out;
}
