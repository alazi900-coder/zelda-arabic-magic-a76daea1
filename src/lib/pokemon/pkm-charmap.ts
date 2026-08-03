/**
 * Arabic for Pokémon Ruby Destiny: which byte draws which glyph.
 *
 * The game uses its own character set, not ASCII. Everything below was read
 * out of the shipped ROM, not from a wiki: `A` is 0xBB and `a` is 0xD5 because
 * the words "hello there" and "Nice day today" are found at those codes, 0xFE
 * ends a line and 0xFF a string, 0xFD introduces a variable (`FD 01` is the
 * player's name), and the punctuation was confirmed the same way — "huh" is
 * followed by 0xAC and "Nice day today" by 0xB8.
 *
 * Codes 0x01..0x81 hold Japanese kana the English build never prints. That is
 * exactly 129 free slots, and the Arabic presentation forms plus ء ، ؛ ؟ come
 * to exactly 129, so Arabic moves in without costing a single Latin letter.
 *
 * The engine advances a fixed 8 pixels for every one of those codes — measured
 * by filling code 0x40 with a solid block and printing four in a row, which
 * inked exactly 32 pixels. The Latin codes advance less (`a` 6, `i` 4), so the
 * Arabic font is drawn to fill 8.
 *
 * In the dialogue box it advances 6, not 8. Measured the same way and later: a
 * line of «ااااب» repeated printed the ب every 30 pixels, five glyphs to the
 * group. So the two numbers are both real and belong to different windows, and
 * the box the player reads text in is the narrow one. Two things follow: the
 * line fits 33 cells, not 25 (see PKM_DIALOGUE_LINE_GLYPHS below), and a glyph
 * drawn to fill 8 loses its last two columns under the next one — thin letters
 * are unharmed, wide ones (س ش ص) are not.
 *
 * Direction is handled here, as in the other games: the engine draws bytes left
 * to right with no bidi, so text is shaped into presentation forms and reversed
 * at build time. The editor always holds normal logical Arabic.
 */

import { shapeArabicForRisen, RISEN_ARABIC_QMARK_ALIAS } from "@/lib/risen/arabic-shaper";
import { pkmSlotsByWidth, PKM_SLOT_ADVANCES } from "./pkm-metrics";

export const PKM_SPACE = 0x00;
export const PKM_NEWLINE = 0xfe;
export const PKM_SCROLL = 0xfa;
export const PKM_PARAGRAPH = 0xfb;
export const PKM_TERMINATOR = 0xff;
/** 0xFD is followed by one byte naming the value to substitute. */
export const PKM_VARIABLE = 0xfd;

/**
 * The formatting code, and how many bytes follow it.
 *
 * Thousands of lines open with it — «<fc><1><f>» sets the colour, «<fc><2>»
 * the highlight — and the scan used to stop dead at 0xFC, so the line was
 * recorded starting after the code, at an address no pointer names. Reading
 * the code and its arguments keeps the line whole and keeps its address.
 *
 * The lengths are the engine's own (pokeemerald's `text.h`); anything not
 * listed takes one argument, which is the common case.
 */
export const PKM_FORMAT = 0xfc;

const PKM_FORMAT_ARGS: Record<number, number> = {
  0x04: 3, // colour + highlight + shadow
  0x07: 0, // reset size
  0x09: 0, // wait for button
  0x0a: 0, // wait for sound
  0x0b: 2, // play music
  0x0f: 0, // fill window
  0x10: 2, // play sound effect
  0x15: 0, // Japanese
  0x16: 0, // Latin
  0x17: 0, // pause music
  0x18: 0, // resume music
};

/** Total length of a formatting code, the 0xFC byte included. */
export function pkmFormatLength(kind: number): number {
  return 2 + (PKM_FORMAT_ARGS[kind] ?? 1);
}

/** First and last kana code Arabic is allowed to occupy. */
export const PKM_FIRST_SLOT = 0x01;
export const PKM_LAST_SLOT = 0x86;

/**
 * Codes in that range the English build still prints, so Arabic may not have
 * them.
 *
 * Each was found by decoding text the ROM itself points at, not by guessing:
 *
 *   0x1B  `é`. The byte between "POK" and "MON" in 2017 places. Taking it put
 *         an Arabic letter inside every POKéMON not yet translated.
 *   0x79–0x7C  the four arrows. They sit inside real lines — «Bug Forest⏎
 *         <79> Pass Path<fa><7b> Green Path» is one string, and cutting the
 *         scan at them recorded «HEAT PATH» as a line of its own, at an
 *         address nothing points to, so it could never be moved or grown.
 */
export const PKM_RESERVED_SLOTS = [0x1b, 0x79, 0x7a, 0x7b, 0x7c];

/** Kept for the older name; `é` is the one this file refers to by itself. */
export const PKM_RESERVED_SLOT = 0x1b;

/** Codes Arabic may occupy, in order — the range minus what the game prints. */
export function pkmArabicSlots(): number[] {
  const out: number[] = [];
  for (let b = PKM_FIRST_SLOT; b <= PKM_LAST_SLOT; b++) {
    if (!PKM_RESERVED_SLOTS.includes(b)) out.push(b);
  }
  return out;
}

export const PKM_SLOT_COUNT = pkmArabicSlots().length; // 129

/** Latin, digits and punctuation, all confirmed against the shipped strings. */
const LATIN_TO_BYTE = new Map<string, number>();
const BYTE_TO_LATIN = new Map<number, string>();
{
  const add = (ch: string, byte: number) => {
    LATIN_TO_BYTE.set(ch, byte);
    BYTE_TO_LATIN.set(byte, ch);
  };
  add(" ", PKM_SPACE);
  "0123456789".split("").forEach((c, i) => add(c, 0xa1 + i));
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((c, i) => add(c, 0xbb + i));
  "abcdefghijklmnopqrstuvwxyz".split("").forEach((c, i) => add(c, 0xd5 + i));
  add("!", 0xab);
  add("?", 0xac);
  add(".", 0xad);
  add("é", 0x1b);
  add("↑", 0x79);
  add("↓", 0x7a);
  add("←", 0x7b);
  add("→", 0x7c);
  add("’", 0xb4);
  add("'", 0xb4);
  add(",", 0xb8);
}

const TASHKEEL_RE = /[ً-ْٰٟ]/g;
const TATWEEL = 0x0640;
const ARABIC_INDIC_ZERO = 0x0660;

/** Every Arabic codepoint that gets a slot, ascending. */
function neededCodepoints(): number[] {
  const out: number[] = [0x060c, 0x061b, 0x061f, 0x0621]; // ، ؛ ؟ ء
  for (let c = 0xfe80; c <= 0xfefc; c++) out.push(c);
  return out.sort((a, b) => a - b);
}

/**
 * The codepoint each glyph in `PKM_ARABIC_GLYPHS_B64` draws, in the order the
 * glyphs are stored. Exported because the Emerald font writes the same drawings
 * into a different set of codes, and reading the order off this one list is
 * what keeps the two from disagreeing about which glyph is which letter.
 */
export function pkmGlyphCodepoints(): number[] {
  return neededCodepoints();
}

function buildMap(): { toByte: Map<number, number>; toCodepoint: Map<number, number> } {
  const needed = neededCodepoints();
  if (needed.length !== PKM_SLOT_COUNT) {
    throw new Error(`Arabic needs ${needed.length} slots but ${PKM_SLOT_COUNT} are free`);
  }
  const slots = pkmArabicSlots();
  // Not in order: by width. The codes advance 4 to 8 pixels and the glyphs are
  // drawn 8 wide, so handing them out in codepoint order clipped 37 forms under
  // their neighbour and left a two-pixel gap after 42 others — the reason the
  // letters looked torn and disjoined. See pkm-metrics.ts.
  const byWidth = pkmSlotsByWidth(slots);
  const toByte = new Map<number, number>();
  const toCodepoint = new Map<number, number>();
  needed.forEach((cp, i) => {
    toByte.set(cp, byWidth[i]);
    toCodepoint.set(byWidth[i], cp);
  });
  return { toByte, toCodepoint };
}

const MAP = buildMap();

/** The byte that draws this Arabic codepoint, or null if it has no slot. */
export function pkmByteForCodepoint(cp: number): number | null {
  return MAP.toByte.get(cp) ?? null;
}

/** The Arabic codepoint a byte draws, or null if the byte stays Latin. */
export function pkmCodepointForByte(byte: number): number | null {
  return MAP.toCodepoint.get(byte) ?? null;
}

/**
 * Where each glyph goes: `pkmFontSlots()[i]` is the byte that must hold the
 * glyph for the `i`-th codepoint, in the order `neededCodepoints()` gives.
 *
 * The font writer walks this and nothing else, so the font and the encoder
 * cannot disagree about which code holds which letter — which matters now that
 * the codes are handed out by width rather than in order.
 */
export function pkmFontSlots(): number[] {
  return neededCodepoints().map((cp) => MAP.toByte.get(cp)!);
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

export interface PkmEncodeResult {
  bytes: Uint8Array;
  /** Characters that had no slot and were dropped, for reporting. */
  unmapped: string[];
}

/**
 * How wide the dialogue box is inside its frame, in pixels.
 *
 * Measured, not reasoned about. A line of N identical Arabic letters was
 * written over the professor's opening speech and the ROM run for N = 26…38,
 * checking every frame whether a white window pixel appeared outside the frame
 * (x = 21…218, read off the same capture): nothing at all up to 33 letters, and
 * from 34 on the window spills past its own border. That letter advances 6
 * pixels, so the box holds 33 x 6 = 198.
 *
 * The engine does not wrap. Past the last cell it keeps writing into the
 * background map, which is 256 pixels wide, so the overflow reappears at the
 * screen's other edge outside the box — and clearing the box never reaches
 * there, so it stays on screen through the next message and the one after. That
 * is the debris the player sees around the box, not a drawing fault.
 */
export const PKM_DIALOGUE_LINE_PIXELS = 198;


/** The space: 3 pixels, measured the same way — a bar, a space, a bar. */
const PKM_SPACE_WIDTH = 3;

/**
 * A Latin letter, digit or mark. Not measured one by one — the ink of those
 * glyphs touches the measuring bar, so the trick above cannot separate them —
 * and 6 is what this ROM's own notes give for the widest of them.
 */
const PKM_LATIN_WIDTH = 6;

/**
 * A value the game substitutes. Its length is only known while the game runs,
 * so it is counted as a seven-character name, the longest the player can enter.
 */
const PKM_VARIABLE_WIDTH = 7 * PKM_LATIN_WIDTH;

const SLOT_WIDTH = new Map<number, number>();
pkmArabicSlots().forEach((slot, i) => SLOT_WIDTH.set(slot, PKM_SLOT_ADVANCES.charCodeAt(i) - 48));

/**
 * How many pixels this line takes on screen.
 *
 * The line is shaped and mapped to its codes first — the same path the build
 * takes — because that is what decides the widths: «لا» is one code, not two,
 * and a letter's width depends on which of its four forms the word calls for.
 */
export function pkmLineWidth(line: string): number {
  let width = 0;
  const { bytes } = encodeArabicForPkm(line.split("\n")[0]);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === PKM_SPACE) width += PKM_SPACE_WIDTH;
    else if (b === PKM_VARIABLE) { width += PKM_VARIABLE_WIDTH; i++; }
    else if (b === PKM_FORMAT) i += pkmFormatLength(bytes[i + 1] ?? 0) - 1;
    else width += SLOT_WIDTH.get(b) ?? PKM_LATIN_WIDTH;
  }
  return width;
}

/** Where a message breaks: a newline, or the codes that wait and clear the box. */
const PKM_LINE_SPLIT = /\n|\{fa\}|\{fb\}/;

/** The lines of this message too wide for the box, widest first. */
export function pkmOverlongLines(text: string): { line: number; width: number }[] {
  return text
    .split(PKM_LINE_SPLIT)
    .map((line, i) => ({ line: i + 1, width: pkmLineWidth(line) }))
    .filter((l) => l.width > PKM_DIALOGUE_LINE_PIXELS)
    .sort((a, b) => b.width - a.width);
}

/** `{FD:01}` — a value the game substitutes — and `{7f}` — a byte we cannot name. */
const TOKEN_RE = /\{(?:FD:([0-9a-fA-F]{2})|FC:((?:[0-9a-fA-F]{2})(?::[0-9a-fA-F]{2})*)|([0-9a-fA-F]{2}))\}/g;
/** Private-use characters that stand in for a token while the line is shaped. */
const TOKEN_BASE = 0xe200;
const TOKEN_LIMIT = 64;

/**
 * Takes the tokens out of a line before shaping and gives back the bytes each
 * one stands for.
 *
 * Shaping reverses the line, and a token written out in full comes back with
 * its braces swapped — the first build wrote `{FD:01}` through as literal text
 * and lost the player's name. A token is one thing, not seven characters, so
 * it travels as a single placeholder and the bidi ordering moves it whole.
 */
function liftTokens(line: string): { text: string; tokens: number[][] } {
  const tokens: number[][] = [];
  const text = line.replace(TOKEN_RE, (whole, variable?: string, format?: string, raw?: string) => {
    if (tokens.length >= TOKEN_LIMIT) return whole;
    if (variable) tokens.push([PKM_VARIABLE, parseInt(variable, 16)]);
    else if (format) tokens.push([PKM_FORMAT, ...format.split(":").map((h) => parseInt(h, 16))]);
    else tokens.push([parseInt(raw!, 16)]);
    return String.fromCharCode(TOKEN_BASE + tokens.length - 1);
  });
  return { text, tokens };
}

/**
 * Which byte draws which character.
 *
 * Everything else about reading and writing a Gen 3 line — the terminator, the
 * line break, the paragraph and scroll codes, the variables and the formatting
 * codes and how many bytes each one carries — belongs to the engine and is the
 * same in every game built on it. Only these four tables differ, because only
 * the choice of which codes Arabic may take differs. So the two games share the
 * machinery below and hand it their own tables.
 */
export interface PkmCharTables {
  arabicToByte: Map<number, number>;
  byteToArabic: Map<number, number>;
  latinToByte: Map<string, number>;
  byteToLatin: Map<number, string>;
}

/** Ruby Destiny's own tables — what this file has always used. */
export function pkmCharTables(): PkmCharTables {
  return {
    arabicToByte: MAP.toByte,
    byteToArabic: MAP.toCodepoint,
    latinToByte: LATIN_TO_BYTE,
    byteToLatin: BYTE_TO_LATIN,
  };
}

/**
 * Turns one line of logical Arabic into the bytes this engine draws: shaped
 * into presentation forms, reversed, then mapped onto the kana slots.
 *
 * `\n` becomes the engine's line break. Variables the game substitutes are
 * written back as they were read (see decode below): they are not text and
 * must survive a round trip untouched, or a character loses their name.
 */
export function encodeArabicForPkm(text: string): PkmEncodeResult {
  return encodeArabicWithTables(text, pkmCharTables());
}

/** The same, for a game whose Arabic sits in different codes. */
export function encodeArabicWithTables(text: string, tables: PkmCharTables): PkmEncodeResult {
  const unmapped: string[] = [];
  const out: number[] = [];
  // A break directly after `{fa}` or `{fb}` is the one the decoder added so the
  // message reads in its real shape on screen. The code already ends the line;
  // writing 0xFE as well would open the new page with an empty first line.
  const lines = text.replace(TASHKEEL_RE, "").replace(/(\{f[ab]\})\n/g, "$1").split("\n");
  lines.forEach((line, i) => {
    if (i > 0) out.push(PKM_NEWLINE);
    const lifted = liftTokens(line);
    for (const ch of normalise(shapeArabicForRisen(lifted.text))) {
      const cp = ch.codePointAt(0)!;
      if (cp >= TOKEN_BASE && cp < TOKEN_BASE + lifted.tokens.length) {
        out.push(...lifted.tokens[cp - TOKEN_BASE]);
        continue;
      }
      const slot = tables.arabicToByte.get(cp);
      if (slot !== undefined) {
        out.push(slot);
        continue;
      }
      const latin = tables.latinToByte.get(ch);
      if (latin !== undefined) {
        out.push(latin);
        continue;
      }
      unmapped.push(ch);
    }
  });
  return { bytes: Uint8Array.from(out), unmapped };
}

/**
 * Reads game bytes back as text. Arabic slots come back as presentation forms
 * (this is for checking a build, not for the editor, which holds logical
 * Arabic). A variable is rendered `{FD:xx}` so it can be recognised and put
 * back byte for byte.
 */
export function decodePkmBytes(bytes: Uint8Array): string {
  return decodeBytesWithTables(bytes, pkmCharTables());
}

/** The same, for a game whose Arabic sits in different codes. */
export function decodeBytesWithTables(bytes: Uint8Array, tables: PkmCharTables): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === PKM_TERMINATOR) break;
    if (b === PKM_NEWLINE) {
      out += "\n";
      continue;
    }
    // The paragraph and scroll codes are not line breaks: one waits for the
    // player and clears the box, the other waits and scrolls it. Rendering
    // both as `\n` and writing `\n` back turned every one of them into a
    // plain break — 2734 lines in this ROM — so a message that used to page
    // properly would run off the two-line box instead.
    //
    // They do end the line on screen, though, so a break is put after the code
    // for the translator to read the message in its real shape. That break is
    // layout, not content: `encodeArabicForPkm` drops the one that follows
    // either code, and the bytes come back exactly as they were.
    if (b === PKM_PARAGRAPH || b === PKM_SCROLL) {
      out += `{${b.toString(16)}}`;
      if (bytes[i + 1] !== undefined && bytes[i + 1] !== PKM_TERMINATOR) out += "\n";
      continue;
    }
    if (b === PKM_VARIABLE) {
      const arg = bytes[i + 1];
      out += `{FD:${(arg ?? 0).toString(16).padStart(2, "0")}}`;
      i++;
      continue;
    }
    if (b === PKM_FORMAT) {
      const len = pkmFormatLength(bytes[i + 1] ?? 0);
      const parts: string[] = [];
      for (let k = 1; k < len && i + k < bytes.length; k++) {
        parts.push(bytes[i + k].toString(16).padStart(2, "0"));
      }
      out += `{FC:${parts.join(":")}}`;
      i += len - 1;
      continue;
    }
    const cp = tables.byteToArabic.get(b);
    if (cp !== undefined) {
      out += String.fromCodePoint(cp);
      continue;
    }
    const latin = tables.byteToLatin.get(b);
    out += latin ?? `{${b.toString(16).padStart(2, "0")}}`;
  }
  return out;
}
