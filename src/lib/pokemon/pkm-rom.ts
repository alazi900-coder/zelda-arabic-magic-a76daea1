/**
 * Finding and replacing the text inside a Pokémon Ruby Destiny ROM.
 *
 * There is no string table to walk. Gen 3 stores each line wherever it happens
 * to sit and reaches it through a pointer computed in code, so the only honest
 * way to enumerate the text is to read the bytes and recognise it: a run of
 * characters this game's own character set can draw, ending in the terminator
 * 0xFF. A run has to carry real letters to count, which keeps out the vast
 * stretches of 0x00 padding — 0x00 is the space, so padding reads as an
 * endless line of spaces otherwise.
 *
 * Everything is written back **in place**. Moving a line would mean finding and
 * fixing every pointer to it, and those pointers are formed in code, not stored
 * in a table we could rewrite; a translation that is one byte too long is
 * refused with its number rather than silently truncated or relocated.
 */

import { decodePkmBytes, encodeArabicForPkm, PKM_TERMINATOR, PKM_VARIABLE } from "./pkm-charmap";

/** A line found in the ROM. `capacity` counts the terminator. */
export interface PkmString {
  offset: number;
  capacity: number;
  text: string;
}

const LETTER_START = 0xbb; // 'A'
const LETTER_END = 0xee; // 'z'

/** Bytes that may appear inside a line without ending it. */
function isTextByte(b: number): boolean {
  if (b === 0x00) return true; // space
  if (b >= 0xa1 && b <= 0xee) return true; // digits, punctuation, letters
  if (b === 0xfa || b === 0xfb || b === 0xfe) return true; // scroll, paragraph, newline
  if (b === PKM_VARIABLE) return true;
  return false;
}

export interface ScanOptions {
  /** Smallest number of letters a run must carry to count as text. */
  minLetters?: number;
}

/**
 * Every line the ROM holds, in address order.
 *
 * A run is taken maximally and only kept if it ends at a terminator, so the
 * recorded capacity is exactly the space the game gave that line.
 */
export function scanPkmStrings(rom: Uint8Array, options: ScanOptions = {}): PkmString[] {
  const minLetters = options.minLetters ?? 4;
  const out: PkmString[] = [];
  let i = 0;
  while (i < rom.length) {
    if (!isTextByte(rom[i])) {
      i++;
      continue;
    }
    let start = i;
    let letters = 0;
    while (i < rom.length && isTextByte(rom[i])) {
      const b = rom[i];
      if (b >= LETTER_START && b <= LETTER_END) letters++;
      if (b === PKM_VARIABLE) i++; // its argument byte is not text
      i++;
    }
    // 0x00 is the space, so the run swallows whatever padding precedes the
    // line. The game's pointer is at the first real character, and writing
    // from the padding instead would put the translation in front of where the
    // game starts reading — half of it would never be drawn. Start at the
    // first non-padding byte; a line that genuinely opens with a space simply
    // keeps that space.
    while (start < i && rom[start] === 0x00) start++;

    // The run must be closed by the terminator to be a line the game prints,
    // and carry enough letters not to be an accident of nearby data.
    const runLength = i - start;
    if (
      i < rom.length &&
      rom[i] === PKM_TERMINATOR &&
      letters >= minLetters &&
      letters * 2 >= runLength
    ) {
      const end = i + 1;
      out.push({
        offset: start,
        capacity: end - start,
        text: decodePkmBytes(rom.subarray(start, i)),
      });
    }
    i++;
  }
  return out;
}

export interface PkmWriteResult {
  rom: Uint8Array;
  written: number;
  /** Lines whose translation did not fit, with the numbers to fix them by. */
  tooLong: { offset: number; needed: number; capacity: number; text: string }[];
  /** Characters with no slot in the font, for reporting. */
  unmapped: string[];
}

/**
 * Writes translations back into the ROM at the offsets they were read from.
 *
 * `translations` is keyed by the string's offset. A line shorter than its
 * original is padded with the terminator, which the engine stops at, so the
 * leftover bytes of the old English line are never printed.
 */
export function applyPkmTranslations(
  rom: Uint8Array,
  strings: PkmString[],
  translations: Record<string, string>
): PkmWriteResult {
  const out = new Uint8Array(rom);
  const tooLong: PkmWriteResult["tooLong"] = [];
  const unmapped = new Set<string>();
  let written = 0;

  for (const s of strings) {
    const value = translations[String(s.offset)];
    if (value === undefined || value === "") continue;
    const encoded = encodeArabicForPkm(value);
    encoded.unmapped.forEach((c) => unmapped.add(c));
    const needed = encoded.bytes.length + 1; // + terminator
    if (needed > s.capacity) {
      tooLong.push({ offset: s.offset, needed, capacity: s.capacity, text: value });
      continue;
    }
    out.set(encoded.bytes, s.offset);
    out.fill(PKM_TERMINATOR, s.offset + encoded.bytes.length, s.offset + s.capacity);
    written++;
  }

  return { rom: out, written, tooLong, unmapped: [...unmapped] };
}
