/**
 * Moving a line out of its slot, and fixing what points at it.
 *
 * A line is written back where it was found because the bytes after it belong
 * to the next line — one byte too many and the neighbour is gone. That caps an
 * Arabic translation at the length of the English word it replaces, which for
 * a name like "Ivysaur" is seven bytes.
 *
 * The cap is not the ROM's, though. The game reaches most of its dialogue
 * through a 32-bit pointer stored in the script data — a little-endian address
 * in the 0x08000000 range — so a line can live anywhere as long as every
 * pointer to it is updated. And there is room: this ROM carries 5.3 MB of
 * 0xFF filler, the largest run 2 MB.
 *
 * Two things are honest to say about this:
 *
 *   1. Not every line is reachable this way. A name in a fixed-stride list is
 *      found by index, not by pointer, so it keeps its slot and its limit —
 *      measured, about half the lines in this ROM have a pointer.
 *   2. A pointer is recognised by its value, and four bytes of code or data
 *      can hold that value by coincidence. Rewriting such a match corrupts
 *      whatever it really was. Word-aligned matches are the safe majority;
 *      the unaligned ones are real too (script bytecode is a byte stream), so
 *      they are taken as well and counted separately for reporting.
 */

/** GBA cartridges are mapped here, so a pointer into the ROM starts with 0x08. */
export const GBA_ROM_BASE = 0x08000000;

export interface PkmPointerIndex {
  /** Where in the ROM a pointer to this offset is stored. */
  to(offset: number): number[];
  /** How many pointers were found in total, for reporting. */
  readonly size: number;
}

/**
 * Whether a four-byte match at `at` is worth believing.
 *
 * It has to be asked, because a match is only a coincidence of four bytes. One
 * such coincidence sat inside THUMB instructions at 0x1DDB5F — `79 40 20 10 42
 * 03 d0 e9` and then the address — and rewriting it turned the code into
 * something the CPU did not survive: the ROM booted to a black screen. That is
 * measured, not feared; it is how this rule was found.
 *
 * Two things separate a real pointer from that:
 *
 *   - It is word-aligned. Pointer tables and the literal pools the compiler
 *     emits are always aligned, and a run of instructions is not, so alignment
 *     alone clears 5448 of the 8510 matches in this ROM.
 *   - Or the script opcode that loads text sits right in front of it. Counted
 *     over every match: 2222 unaligned ones follow `0F` (loadpointer) and
 *     about a hundred follow `67` (preparemsg). Those are the script engine
 *     reading a line, and they are the whole reason unaligned matches are
 *     worth having at all.
 *
 * Anything else is left alone, and the line keeps the slot it was born in.
 */
export function isTrustedPointerSite(rom: Uint8Array, at: number): boolean {
  if (at % 4 === 0) return true;
  if (at >= 2 && rom[at - 2] === 0x0f && rom[at - 1] <= 0x03) return true; // loadpointer <bank>
  if (at >= 1 && rom[at - 1] === 0x67) return true; // preparemsg
  return false;
}

/**
 * Every ROM-range pointer in the file, grouped by what it points at.
 *
 * Read at every byte position, not every fourth: the script engine's arguments
 * are a byte stream, so a pointer inside a script is rarely word-aligned.
 */
export function indexPkmPointers(rom: Uint8Array): PkmPointerIndex {
  const map = new Map<number, number[]>();
  let size = 0;
  for (let at = 0; at + 4 <= rom.length; at++) {
    if (rom[at + 3] !== 0x08) continue;
    const target = rom[at] | (rom[at + 1] << 8) | (rom[at + 2] << 16);
    if (target >= rom.length) continue;
    if (!isTrustedPointerSite(rom, at)) continue;
    const list = map.get(target);
    if (list) list.push(at);
    else map.set(target, [at]);
    size++;
  }
  return {
    to: (offset: number) => map.get(offset) ?? [],
    size,
  };
}

/** Writes a ROM address into the four bytes at `at`. */
export function writePkmPointer(rom: Uint8Array, at: number, target: number): void {
  const value = GBA_ROM_BASE + target;
  rom[at] = value & 0xff;
  rom[at + 1] = (value >>> 8) & 0xff;
  rom[at + 2] = (value >>> 16) & 0xff;
  rom[at + 3] = (value >>> 24) & 0xff;
}

/** Shortest run of filler that counts as free space rather than a gap in data. */
const MIN_FREE_RUN = 0x100;

export interface PkmFreeRun {
  start: number;
  length: number;
}

/**
 * The stretches of 0xFF this ROM is padded with.
 *
 * 0xFF is the terminator and the filler both, and a long run of it is space
 * the cartridge was padded out with rather than anything the game reads. Short
 * runs are skipped: a handful of 0xFF bytes inside a data table is alignment,
 * not free space, and writing a sentence into it would overwrite the table.
 */
export function findPkmFreeRuns(rom: Uint8Array, minRun = MIN_FREE_RUN): PkmFreeRun[] {
  const out: PkmFreeRun[] = [];
  let i = 0;
  while (i < rom.length) {
    if (rom[i] !== 0xff) {
      i++;
      continue;
    }
    const start = i;
    while (i < rom.length && rom[i] === 0xff) i++;
    if (i - start >= minRun) out.push({ start, length: i - start });
  }
  return out;
}

/**
 * Hands out space from the free runs, largest first.
 *
 * Allocations are aligned to four bytes — nothing requires it for text, but it
 * keeps relocated lines from starting inside a word another tool might read as
 * a pointer, and costs at most three bytes each.
 */
export class PkmFreeSpace {
  private readonly runs: PkmFreeRun[];
  private cursor = 0;

  constructor(rom: Uint8Array, excluded: PkmFreeRun[] = [], minRun = MIN_FREE_RUN) {
    this.runs = findPkmFreeRuns(rom, minRun)
      .filter((run) => !excluded.some((x) => run.start < x.start + x.length && x.start < run.start + run.length))
      .sort((a, b) => b.length - a.length);
  }

  /** Total space still available, for reporting before a build. */
  get remaining(): number {
    return this.runs.slice(this.cursor).reduce((n, r) => n + r.length, 0);
  }

  /** An offset with `size` free bytes after it, or null when nothing is left. */
  take(size: number): number | null {
    while (this.cursor < this.runs.length) {
      const run = this.runs[this.cursor];
      const start = (run.start + 3) & ~3;
      const lost = start - run.start;
      if (run.length - lost >= size) {
        run.start = start + size;
        run.length -= lost + size;
        return start;
      }
      this.cursor++;
    }
    return null;
  }
}
