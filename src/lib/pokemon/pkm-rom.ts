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
 * A line is written back **in place** by default, because the bytes after it
 * belong to the next line. When that is too small for the translation and the
 * game reaches the line through a pointer, the line is moved into the ROM's
 * free space and every pointer to it is corrected — see pkm-pointers.ts, and
 * the rules there about which four-byte matches are worth believing. What can
 * be neither written nor moved is refused with its numbers rather than
 * silently truncated.
 */

import { decodeBytesWithTables, encodeArabicWithTables, pkmFormatLength, PKM_FORMAT, PKM_RESERVED_SLOTS, PKM_TERMINATOR, PKM_VARIABLE } from "./pkm-charmap";
import { pkmCodecFor, type PkmCodec } from "./pkm-codec";
import type { EmeraldRtlScope } from "@/lib/gba/emerald-rtl";
import { diffPkmTags } from "./pkm-tag-mask";
import type { PkmListKind } from "./pkm-categories";
import { indexPkmPointers, writePkmPointer, PkmFreeSpace, type PkmPointerIndex } from "./pkm-pointers";

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
  /** How many of its entries something in the ROM points at. */
  pointed?: number;
}

const LETTER_START = 0xbb; // 'A'
const LETTER_END = 0xee; // 'z'

/** Bytes that may appear inside a line without ending it. */
function isTextByte(b: number): boolean {
  if (b === 0x00) return true; // space
  if (b >= 0xa1 && b <= 0xee) return true; // digits, punctuation, letters
  if (b === 0xfa || b === 0xfb || b === 0xfe) return true; // scroll, paragraph, newline
  if (b === PKM_VARIABLE || b === PKM_FORMAT) return true;
  // The characters the game still prints from the low range: `é`, and the four
  // arrows. Cutting the run at them recorded a line starting in its own middle
  // — "MON TRAINERS do when…", "HEAT PATH" — at an address nothing points to,
  // so it could never be found again, moved, or grown.
  if (PKM_RESERVED_SLOTS.includes(b)) return true;
  return false;
}

export interface ScanOptions {
  /** Smallest number of letters a run must carry to count as text. */
  minLetters?: number;
  /**
   * Pointers into the ROM, so a run something points at can be believed on
   * weaker evidence than a run found by looking at the bytes alone.
   *
   * Without it the shortest lines in the game are missing. «Bag», «Save»,
   * «Exit», «On», «Off», «Set» — the START menu and the options screen — are
   * three letters or two, and the letter count that keeps stray bytes out
   * keeps those out with them: measured, «Bag» at 0x42C482 was nowhere in the
   * 15424 lines this scan produced. Every one of those entries has a pointer
   * naming its first byte, which is the game itself saying the bytes are a
   * line, and no counting of letters can say it as well.
   */
  pointers?: PkmPointerIndex;
  /** Which game this ROM is. Read from its header when not given. */
  codec?: PkmCodec;
}

/**
 * Every line the ROM holds, in address order.
 *
 * A run is taken maximally and only kept if it ends at a terminator, so the
 * recorded capacity is exactly the space the game gave that line.
 */
export function scanPkmStrings(rom: Uint8Array, options: ScanOptions = {}): PkmString[] {
  const minLetters = options.minLetters ?? 4;
  const codec = options.codec ?? pkmCodecFor(rom);
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
      else if (b === PKM_FORMAT) i += pkmFormatLength(rom[i + 1] ?? 0) - 1;
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
    // and carry enough letters not to be an accident of nearby data — unless
    // something in the ROM points at its first byte, which says the same thing
    // and says it better. The density rule is dropped for a pointed run too:
    // «{FC:05:0f}On» is five bytes of which two are letters, and three of the
    // five are a colour code the player never sees.
    const runLength = i - start;
    const pointed = options.pointers ? options.pointers.to(start).length > 0 : false;
    if (
      i < rom.length &&
      rom[i] === PKM_TERMINATOR &&
      // Two bytes at least, even when pointed: a lone letter is nothing a
      // translator can act on, and 48 of them turned up — «W», «l», «j» — where
      // a four-byte value in the data happens to name a single character
      // sitting in front of a terminator.
      (pointed ? letters >= 1 && runLength >= 2 : letters >= minLetters && letters * 2 >= runLength)
    ) {
      const end = i + 1;
      out.push({
        offset: start,
        capacity: end - start,
        text: decodeBytesWithTables(rom.subarray(start, i), codec.tables),
      });
    }
    i++;
  }
  markTables(out);
  growTableCapacities(out);
  return out;
}

/**
 * Gives a list entry the whole slot it sits in.
 *
 * A line's capacity is otherwise measured from the line itself — "Bulbasaur"
 * plus its terminator, ten bytes — because that is all a free-standing line
 * can be sure of. But an entry in a fixed-stride array owns its slot: the next
 * entry begins exactly `stride` bytes later, and everything in between is that
 * entry's own padding. In this ROM the species slots are eleven bytes, so the
 * measured-from-the-word limit was costing every name a byte it already had.
 *
 * The last entry of a run is left alone: nothing says where it ends, since
 * there is no following entry to measure against.
 */
function growTableCapacities(strings: PkmString[]): void {
  for (let i = 0; i < strings.length - 1; i++) {
    const s = strings[i];
    const next = strings[i + 1];
    if (!s.table || next.table !== s.table) continue;
    const slot = next.offset - s.offset;
    if (slot > s.capacity) s.capacity = slot;
  }
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
  /** Lines that outgrew their slot and were moved into free space. */
  relocated: { offset: number; to: number; pointers: number; unaligned: number }[];
  /** Free bytes left after the build, for judging how much room remains. */
  freeSpaceLeft: number;
}

export interface PkmWriteOptions {
  /**
   * Move a line that no longer fits into free space and repoint the game at
   * it, instead of refusing it.
   *
   * Off by default: it rewrites bytes outside the line, and a four-byte value
   * that only looks like a pointer would be rewritten with it.
   */
  relocate?: boolean;
  /** Which game this ROM is. Read from its header when not given. */
  codec?: PkmCodec;
  /**
   * The engine will lay text out right to left itself, so the lines it will
   * mirror are written in their ordinary order instead of being reversed here.
   * The two go together: reversing as well would cancel the patch out, and
   * reversing a line the patch *does* mirror leaves it backwards on screen.
   *
   * `"dialogue"` mirrors the message box alone, so only lines bound for it
   * stop being reversed; everything else still is. `"all"` mirrors every
   * window, so nothing is reversed here at all.
   */
  rtl?: EmeraldRtlScope;
}

/**
 * The shortest slot a line may sit in and still be moved.
 *
 * Free ROM space lifts the limit the neighbouring bytes impose; it does not
 * lift the one the engine imposes. A map name is copied into a small buffer in
 * RAM, and "Sun Ford Town" — fourteen bytes of slot — was measured taking a
 * 16-byte translation without complaint and crashing the game on a 21-byte
 * one, wherever it was stored. Dialogue has no such ceiling: all 2674 dialogue
 * lines in this ROM took a 180-byte translation at once and the game ran.
 *
 * What separates them is not readable from the bytes, so the proxy is size and
 * shape: a line with a break in it, or a slot big enough that no label would
 * need it, is speech. A short one keeps the room it was born with.
 */
const RELOCATABLE_MIN_CAPACITY = 40;

/**
 * How far a short line may grow past its slot.
 *
 * Measured one line at a time in the emulator. «Sun Ford Town» — a town name
 * the region map copies into RAM — runs at 20 bytes and crashes the game at
 * 21, wherever the bytes are stored. Three other short lines («WALLY'S HOUSE»,
 * «CUTTER'S HOUSE», «BIKE PARKING») took 21 without complaint, and «PROF.
 * BIRCH'S POKéMON LAB» took 25 in a 26-byte slot.
 *
 * Nothing in the bytes says which line the region map will copy, so 20 is the
 * number every short line is allowed to reach: a real gain for the many whose
 * slot is smaller, and it stops exactly where the one measured crash begins. A
 * line whose own slot is already larger keeps that larger room, which is what
 * it has always had.
 */
export const PKM_SHORT_LINE_LIMIT = 20;

/**
 * Fraction of a list's entries that must be pointed at for the list to count
 * as a table of pointers rather than an array read by index.
 *
 * Measured: the place-name lists in this ROM are pointed 11/11, 12/12, 10/10
 * and 8/8, while the berry list is 1/8 and the species list none at all. The
 * first kind can be moved entry by entry, because the pointer is how the game
 * finds it; the second cannot, because the game counts from the start of the
 * array and would count straight past a relocated name.
 */
const POINTED_TABLE_RATIO = 0.8;

/**
 * Counts, for each list, how many of its entries the ROM points at.
 *
 * Done once against the pointer index and stored on the table, because both
 * the editor's limit and the build's decision to move a line ask the same
 * question about the same list.
 */
export function markPointedTables(strings: PkmString[], pointers: PkmPointerIndex): void {
  const counted = new Set<PkmTable>();
  for (const s of strings) {
    if (!s.table) continue;
    if (!counted.has(s.table)) {
      s.table.pointed = 0;
      counted.add(s.table);
    }
  }
  for (const s of strings) {
    if (s.table && pointers.to(s.offset).length > 0) s.table.pointed = (s.table.pointed ?? 0) + 1;
  }
}

/** True when the list this line sits in is reached through pointers. */
function inPointedTable(s: PkmString, pointers: PkmPointerIndex): boolean {
  const t = s.table;
  if (!t) return false;
  if (t.pointed === undefined) return false;
  return t.pointed >= t.count * POINTED_TABLE_RATIO;
}

/** The bytes this line may hold — its slot, or the measured floor above it. */
export function pkmLineLimit(s: PkmString, pointers?: PkmPointerIndex): number {
  const movable = !s.table || (pointers ? inPointedTable(s, pointers) : false);
  if (!movable) return s.capacity - 1;
  return Math.max(s.capacity - 1, PKM_SHORT_LINE_LIMIT);
}

/** True when this line may be moved out of its slot — see the constant above. */
export function canRelocatePkmString(s: PkmString, pointers: PkmPointerIndex): boolean {
  return looksRelocatable(s, pointers) && pointers.to(s.offset).length > 0;
}

function looksRelocatable(s: PkmString, pointers: PkmPointerIndex): boolean {
  // A list read by index cannot be moved: the game counts from the start of
  // the array. A list of pointers can, entry by entry.
  if (s.table && !inPointedTable(s, pointers)) return false;
  return s.capacity >= RELOCATABLE_MIN_CAPACITY || /[\n]/.test(s.text);
}

/**
 * Whether this line is one the game prints in the message box.
 *
 * It matters only when the engine has been patched to lay the dialogue out
 * right to left, because the patch mirrors that one window and nothing else.
 * A line that goes there must be written in its ordinary order and let the
 * engine reverse it; every other line still has to be reversed here, or it
 * comes out backwards in a menu the patch never touches.
 *
 * Nothing in the bytes says which is which, so the test is the shape of the
 * line: speech carries a break, or a page code, or a slot too big for any
 * label. It is the same signal the relocator already trusts to tell a sentence
 * from a name.
 */
function looksLikeDialogue(s: PkmString): boolean {
  return s.capacity >= RELOCATABLE_MIN_CAPACITY || /\n|\{f[ab]\}/.test(s.text);
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
  translations: Record<string, string>,
  options: PkmWriteOptions = {}
): PkmWriteResult {
  const codec = options.codec ?? pkmCodecFor(rom);
  const out = new Uint8Array(rom);
  const tooLong: PkmWriteResult["tooLong"] = [];
  const brokenTags: PkmWriteResult["brokenTags"] = [];
  const relocated: PkmWriteResult["relocated"] = [];
  const unmapped = new Set<string>();
  let written = 0;

  // Both are built from the ROM as it came in, before a single byte is
  // written, so an allocation can never land on a line this same build is
  // still going to move.
  let pointers: PkmPointerIndex | null = null;
  let free: PkmFreeSpace | null = null;
  if (options.relocate) {
    pointers = indexPkmPointers(rom);
    markPointedTables(strings, pointers);
    free = new PkmFreeSpace(rom, codec.fontRegion(rom));
  }

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
    const encoded = encodeArabicWithTables(value, codec.tables, {
      // The build made from source mirrors every glyph as it draws, so its
      // lines are stored in reading order. Reversing here would reverse them
      // twice and put every word back to front.
      reverse: codec.noReverse
        ? false
        : !(options.rtl === "all" || (options.rtl === "dialogue" && looksLikeDialogue(s))),
    });
    encoded.unmapped.forEach((c) => unmapped.add(c));
    const needed = encoded.bytes.length + 1; // + terminator
    if (needed > s.capacity) {
      // The slot is too small. If the game finds this line through a pointer,
      // the line can go somewhere roomier and the pointer can follow it.
      // A dialogue line may grow to whatever the caller allowed; a short one
      // only to the floor measured in the emulator, because past that the
      // buffer the game copies it into is the thing that gives way.
      const roomy = pointers ? looksRelocatable(s, pointers) : false;
      const allowed = roomy ? Number.POSITIVE_INFINITY : pkmLineLimit(s, pointers ?? undefined) + 1;
      const movable = (!s.table || (pointers ? inPointedTable(s, pointers) : false)) && needed <= allowed;
      const at = movable ? pointers?.to(s.offset) ?? [] : [];
      const to = at.length > 0 ? free?.take(needed) ?? null : null;
      if (to === null) {
        tooLong.push({ offset: s.offset, needed, capacity: s.capacity, text: value });
        continue;
      }
      out.set(encoded.bytes, to);
      out[to + encoded.bytes.length] = PKM_TERMINATOR;
      for (const p of at) writePkmPointer(out, p, to);
      // The old bytes are left as they were: something else may still read
      // them, and blanking them would be a guess about what does.
      relocated.push({ offset: s.offset, to, pointers: at.length, unaligned: at.filter((p) => p % 4 !== 0).length });
      written++;
      continue;
    }
    out.set(encoded.bytes, s.offset);
    out.fill(PKM_TERMINATOR, s.offset + encoded.bytes.length, s.offset + s.capacity);
    written++;
  }

  return {
    rom: out,
    written,
    tooLong,
    brokenTags,
    unmapped: [...unmapped],
    relocated,
    freeSpaceLeft: free?.remaining ?? 0,
  };
}
