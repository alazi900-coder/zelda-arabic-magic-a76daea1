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
 * Direction is handled here, as in the other games: the engine draws bytes left
 * to right with no bidi, so text is shaped into presentation forms and reversed
 * at build time. The editor always holds normal logical Arabic.
 */

import { shapeArabicForRisen, RISEN_ARABIC_QMARK_ALIAS } from "@/lib/risen/arabic-shaper";

export const PKM_SPACE = 0x00;
export const PKM_NEWLINE = 0xfe;
export const PKM_SCROLL = 0xfa;
export const PKM_PARAGRAPH = 0xfb;
export const PKM_TERMINATOR = 0xff;
/** 0xFD is followed by one byte naming the value to substitute. */
export const PKM_VARIABLE = 0xfd;

/** First and last kana code Arabic is allowed to occupy. */
export const PKM_FIRST_SLOT = 0x01;
export const PKM_LAST_SLOT = 0x82;

/**
 * The one code in that range the English build does prints: `é`.
 *
 * Measured, not assumed: the byte between "POK" and "MON" is 0x1B in 2017
 * places in this ROM, and a sweep of every verified English string found no
 * other code below 0x82 used inside a word. Taking it for Arabic put an Arabic
 * letter in the middle of every POKéMON the game had not yet had translated.
 */
export const PKM_RESERVED_SLOT = 0x1b;

/** Codes Arabic may occupy, in order — 0x01..0x82 with `é` left alone. */
export function pkmArabicSlots(): number[] {
  const out: number[] = [];
  for (let b = PKM_FIRST_SLOT; b <= PKM_LAST_SLOT; b++) {
    if (b !== PKM_RESERVED_SLOT) out.push(b);
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
  add("é", PKM_RESERVED_SLOT);
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

function buildMap(): { toByte: Map<number, number>; toCodepoint: Map<number, number> } {
  const needed = neededCodepoints();
  if (needed.length !== PKM_SLOT_COUNT) {
    throw new Error(`Arabic needs ${needed.length} slots but ${PKM_SLOT_COUNT} are free`);
  }
  const slots = pkmArabicSlots();
  const toByte = new Map<number, number>();
  const toCodepoint = new Map<number, number>();
  needed.forEach((cp, i) => {
    toByte.set(cp, slots[i]);
    toCodepoint.set(slots[i], cp);
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
 * What the font must contain, slot by slot: `slots()[i]` is the codepoint drawn
 * by byte `PKM_FIRST_SLOT + i`. The font writer walks this and nothing else, so
 * the font and the encoder cannot disagree about which slot holds which letter.
 */
export function pkmFontSlots(): number[] {
  return pkmArabicSlots().map((b) => MAP.toCodepoint.get(b)!);
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

/** `{FD:01}` — a value the game substitutes — and `{7f}` — a byte we cannot name. */
const TOKEN_RE = /\{(FD:([0-9a-fA-F]{2})|([0-9a-fA-F]{2}))\}/g;
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
  const text = line.replace(TOKEN_RE, (whole, _all, variable?: string, raw?: string) => {
    if (tokens.length >= TOKEN_LIMIT) return whole;
    tokens.push(variable ? [PKM_VARIABLE, parseInt(variable, 16)] : [parseInt(raw!, 16)]);
    return String.fromCharCode(TOKEN_BASE + tokens.length - 1);
  });
  return { text, tokens };
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
  const unmapped: string[] = [];
  const out: number[] = [];
  const lines = text.replace(TASHKEEL_RE, "").split("\n");
  lines.forEach((line, i) => {
    if (i > 0) out.push(PKM_NEWLINE);
    const lifted = liftTokens(line);
    for (const ch of normalise(shapeArabicForRisen(lifted.text))) {
      const cp = ch.codePointAt(0)!;
      if (cp >= TOKEN_BASE && cp < TOKEN_BASE + lifted.tokens.length) {
        out.push(...lifted.tokens[cp - TOKEN_BASE]);
        continue;
      }
      const slot = MAP.toByte.get(cp);
      if (slot !== undefined) {
        out.push(slot);
        continue;
      }
      const latin = LATIN_TO_BYTE.get(ch);
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
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === PKM_TERMINATOR) break;
    if (b === PKM_NEWLINE || b === PKM_PARAGRAPH || b === PKM_SCROLL) {
      out += "\n";
      continue;
    }
    if (b === PKM_VARIABLE) {
      const arg = bytes[i + 1];
      out += `{FD:${(arg ?? 0).toString(16).padStart(2, "0")}}`;
      i++;
      continue;
    }
    const cp = MAP.toCodepoint.get(b);
    if (cp !== undefined) {
      out += String.fromCodePoint(cp);
      continue;
    }
    const latin = BYTE_TO_LATIN.get(b);
    out += latin ?? `{${b.toString(16).padStart(2, "0")}}`;
  }
  return out;
}
