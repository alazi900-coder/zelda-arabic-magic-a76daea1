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
import { diffPkmTags } from "./pkm-tag-mask";
import type { PkmListKind } from "./pkm-categories";

/** A line found in the ROM. `capacity` counts the terminator. */
export interface PkmString {
  offset: number;
  capacity: number;
  text: string;
  /** Set when the line belongs to a run of same-sized, evenly spaced entries. */
  table?: PkmTable;
}

/** A fixed-stride run of names — the shape Gen 3 stores its lists in. */
export interface PkmTable {
  /** Bytes from one entry to the next. */
  stride: number;
  /** How many entries the run holds. */
  count: number;
  /** Where the run starts. */
  start: number;
  /** What the run turned out to hold; `list` when nothing named it. */
  kind: PkmListKind;
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
  markTables(out);
  return out;
}

/** Shortest run that counts as a list rather than a coincidence. */
const MIN_TABLE_ENTRIES = 8;
/**
 * Longest slot that still holds a name.
 *
 * Not a guess: Gen 3 stores a name inside a record, and the record sets the
 * stride. Measured in this ROM — species 11, moves and abilities 13, trainer
 * classes 13, berries 28, decorations 32, dex categories 36, trainers 40,
 * items 44. 64 clears the largest of them and stops well short of the ranges
 * where whole sentences sit.
 */
const MAX_TABLE_STRIDE = 64;

/**
 * Marks the lines that sit in a fixed-stride list.
 *
 * Gen 3 keeps its names — species, items, moves — in arrays of equal-sized
 * slots, padded with the terminator, so consecutive lines are an exact
 * distance apart. Nothing else in the ROM does that: dialogue is packed end to
 * end at whatever length each line happens to be.
 *
 * This is the whole reason the editor can group these lines honestly. Sorting
 * them by what the text looks like would be guesswork — "POTION" and "SNOW
 * SOFT" read alike — but membership in an evenly spaced array is a fact about
 * the file, and a translator filtering to it knows exactly what the rows share.
 */
function markTables(strings: PkmString[]): void {
  const tables: { table: PkmTable; members: PkmString[] }[] = [];
  let i = 0;
  while (i < strings.length) {
    const stride = strings[i + 1] ? strings[i + 1].offset - strings[i].offset : 0;
    if (stride <= 0 || stride > MAX_TABLE_STRIDE) {
      i++;
      continue;
    }
    let end = i + 1;
    while (
      end + 1 < strings.length &&
      strings[end + 1].offset - strings[end].offset === stride
    ) {
      end++;
    }
    const count = end - i + 1;
    if (count >= MIN_TABLE_ENTRIES) {
      const table: PkmTable = { stride, count, start: strings[i].offset, kind: "list" };
      const members = strings.slice(i, end + 1);
      for (const s of members) s.table = table;
      tables.push({ table, members });
      i = end + 1;
    } else {
      i++;
    }
  }
  nameTables(tables);
}

/**
 * The head of every list this engine ships, in the order the game stores it.
 *
 * Which list a run of equal slots is cannot be read off the spacing — species
 * and abilities both sit in 11- and 13-byte slots, and trainer classes share
 * the move stride exactly. What does say is the content, but only where the
 * content is not this hack's invention: a Gen 3 ROM keeps the national dex,
 * the move list and the ability list in their original order, so their first
 * entries survive even heavy editing.
 *
 * So a list is named by recognising entries it must contain, never by what a
 * single line looks like. Two hits are required, so one stray "Potion" inside
 * a move list cannot rename it.
 */
const LIST_ANCHORS: { kind: PkmListKind; anchors: string[] }[] = [
  { kind: "species", anchors: ["bulbasaur", "charmander", "squirtle", "pikachu", "eevee", "chikorita", "treecko"] },
  { kind: "moves", anchors: ["pound", "karate chop", "vine whip", "tackle", "growl", "stench", "drizzle", "speed boost"] },
  { kind: "items", anchors: ["master ball", "poke ball", "potion", "super potion", "full heal", "rare candy", "escape rope", "nest ball", "cheri", "chesto"] },
  { kind: "people", anchors: ["youngster", "lass", "bug catcher", "hiker", "fisherman", "cooltrainer", "gym leader", "beauty"] },
];

const MIN_ANCHOR_HITS = 2;

/**
 * How far a continuation may sit from the head it takes its name from.
 *
 * A single logical list is often broken into several runs, because a few of
 * its slots hold something the scanner does not accept as text and the even
 * spacing stops there. Those pieces carry no anchor of their own — the tail of
 * the move list is this hack's new moves — but they are the same array,
 * metres away in the ROM. Anything further off with the same stride is a
 * different list and keeps the neutral kind.
 */
const SAME_LIST_REACH = 0x10000;

function normalizeName(text: string): string {
  return text.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}

function nameTables(tables: { table: PkmTable; members: PkmString[] }[]): void {
  const namedByStride = new Map<number, PkmTable>();
  for (const { table, members } of tables) {
    const seen = new Set(members.map((m) => normalizeName(m.text)));
    let kind: PkmListKind | null = null;
    for (const group of LIST_ANCHORS) {
      const hits = group.anchors.reduce((n, a) => (seen.has(a) ? n + 1 : n), 0);
      if (hits >= MIN_ANCHOR_HITS) {
        kind = group.kind;
        break;
      }
    }
    if (kind) {
      table.kind = kind;
      namedByStride.set(table.stride, table);
      continue;
    }
    const head = namedByStride.get(table.stride);
    if (head && table.start - head.start <= SAME_LIST_REACH) table.kind = head.kind;
  }
}

export interface PkmWriteResult {
  rom: Uint8Array;
  written: number;
  /** Lines whose translation did not fit, with the numbers to fix them by. */
  tooLong: { offset: number; needed: number; capacity: number; text: string }[];
  /** Lines refused because a technical code was lost or altered. */
  brokenTags: { offset: number; missing: string[]; extra: string[]; text: string }[];
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
  const brokenTags: PkmWriteResult["brokenTags"] = [];
  const unmapped = new Set<string>();
  let written = 0;

  for (const s of strings) {
    const value = translations[String(s.offset)];
    if (value === undefined || value === "") continue;
    // Last guard before the bytes are written: a line that lost `{FD:01}` on
    // its way through a translation model would print without the character's
    // name, in a place no test can see. It is refused and named instead.
    const tagDiff = diffPkmTags(s.text, value);
    if (tagDiff.missing.length > 0 || tagDiff.extra.length > 0 || !tagDiff.sameOrder) {
      brokenTags.push({ offset: s.offset, missing: tagDiff.missing, extra: tagDiff.extra, text: value });
      continue;
    }
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

  return { rom: out, written, tooLong, brokenTags, unmapped: [...unmapped] };
}
