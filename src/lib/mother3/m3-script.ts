/**
 * Mother 3 (English Fan Translation v1.1) main-script reader / rebuilder.
 *
 * Storage layout (recovered from the built `script_convert` at 0x08132BD2 and
 * verified by decoding real lines across 481 banks):
 *
 *   Bank table @ file 0x0136A6F8 (ROM 0x0936A6F8): one entry per bank,
 *     8 bytes = { uint32 start, uint32 end } as byte offsets relative to the
 *     table base minus 4. A bank's data region is [tableBase + start - 4,
 *     tableBase + end - 4).
 *
 *   Bank layout: a uint16 line-pointer table terminated by 0xFFFF, followed by
 *     the obfuscated line data. Line `n`'s data starts at:
 *         addrOfFFFF + 1 + pointerTable[n]
 *     (addrOfFFFF = address of the 0xFFFF that ends the pointer table). Each
 *     line runs until a decoded 0xFF terminator.
 *
 * All bytes in line data are obfuscated — see m3-codec.ts. This module reads
 * banks into editable text and rebuilds a bank's bytes after edits, re-packing
 * the pointer table + data and refusing (rather than corrupting) if the result
 * would overflow the bank's original ROM region.
 */

import { ROM_BASE, decodeByte, encodeByte, codesToText, textToCodes, END_BYTE } from "./m3-codec";

export const BANK_TABLE_OFFSET = 0x0136a6f8;
export const MAIN_SCRIPT_BANK = 13;

export interface M3Line {
  index: number;
  /** raw pointer-table value for this line */
  pointer: number;
  /** file offset where the line's data begins */
  fileOffset: number;
  /** decoded codes, excluding the 0xFF terminator */
  codes: number[];
  /** human-editable representation (see codesToText) */
  text: string;
}

export interface M3Bank {
  index: number;
  /** file offset of the bank's data region start */
  regionStart: number;
  /** file offset one past the bank's data region */
  regionEnd: number;
  /** file offset of the 0xFFFF terminating the pointer table */
  addrOfFFFF: number;
  lines: M3Line[];
}

function u32(rom: Uint8Array, off: number): number {
  return (rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16) | (rom[off + 3] << 24)) >>> 0;
}
function u16(rom: Uint8Array, off: number): number {
  return (rom[off] | (rom[off + 1] << 8)) >>> 0;
}

export interface BankRegion {
  index: number;
  start: number; // file offset of region (pointer table start)
  end: number; // file offset one past region (== next bank's start)
}

/**
 * Read the bank table into region descriptors.
 *
 * Each 8-byte entry is { uint32 start, uint32 end }, but only `start`
 * (= tableBase + start - 4) is the bank's real data-region start; the `end`
 * field bounds only the pointer table, not the line data. A bank's data (its
 * pointer table plus the obfuscated lines its pointers reach) occupies
 * [start_n, nextStart) where nextStart is the smallest other bank start greater
 * than start_n, or the ROM end for the last one. Empty banks have start==end==0
 * (they resolve to tableBase - 4) and carry no data.
 */
export function parseBankTable(rom: Uint8Array, maxBanks = 1024): BankRegion[] {
  const tbl = BANK_TABLE_OFFSET;
  const raw: { index: number; start: number; empty: boolean }[] = [];
  for (let n = 0; n < maxBanks; n++) {
    const entry = tbl + n * 8;
    if (entry + 8 > rom.length) break;
    const start = u32(rom, entry);
    const end = u32(rom, entry + 4);
    if (start === 0xffffffff) break;
    const rs = tbl + start - 4;
    if (start === 0 && end === 0) {
      raw.push({ index: n, start: rs, empty: true });
      continue;
    }
    if (rs < tbl || rs > rom.length) break;
    raw.push({ index: n, start: rs, empty: false });
  }
  // region end = smallest non-empty start strictly greater than this start.
  const starts = raw.filter((r) => !r.empty).map((r) => r.start).sort((a, b) => a - b);
  return raw.map((r) => {
    if (r.empty) return { index: r.index, start: r.start, end: r.start };
    let end = rom.length;
    for (const s of starts) {
      if (s > r.start) {
        end = s;
        break;
      }
    }
    return { index: r.index, start: r.start, end };
  });
}

/** Parse and decode a single bank into editable lines. Returns null for empty
 *  (0/0) banks or malformed regions. */
export function parseBank(rom: Uint8Array, index: number): M3Bank | null {
  const regions = parseBankTable(rom);
  const region = regions.find((r) => r.index === index);
  if (!region) return null;
  return parseBankRegion(rom, region);
}

export function parseBankRegion(rom: Uint8Array, region: BankRegion): M3Bank | null {
  const size = region.end - region.start;
  if (size <= 2 || region.start + size > rom.length) return null;

  // pointer table: uint16 values until 0xFFFF
  const pointers: number[] = [];
  let i = 0;
  while (i < size - 1) {
    const v = u16(rom, region.start + i);
    if (v === 0xffff) break;
    pointers.push(v);
    i += 2;
  }
  if (i >= size - 1) return null; // no terminator found — not a real bank
  const addrOfFFFF = region.start + i;
  // The game reads line n at (addrOfFFFF + pointer[n]) — see script_convert
  // (main_script_hacks.asm): `add r5, r2, r1` with r2 = addr of the 0xFFFF.
  const dataBase = addrOfFFFF;

  const lines: M3Line[] = [];
  for (let n = 0; n < pointers.length; n++) {
    const fileOffset = dataBase + pointers[n];
    const codes: number[] = [];
    let a = fileOffset;
    const limit = Math.min(rom.length, region.end);
    while (a < limit) {
      const c = decodeByte(rom, rom[a], ROM_BASE + a);
      if (c === END_BYTE) break;
      codes.push(c);
      a++;
      if (codes.length > 4000) break;
    }
    lines.push({ index: n, pointer: pointers[n], fileOffset, codes, text: codesToText(codes) });
  }
  return { index: region.index, regionStart: region.start, regionEnd: region.end, addrOfFFFF, lines };
}

export interface RebuildResult {
  /** the full new bank region bytes (length === regionEnd - regionStart) */
  bytes: Uint8Array;
  /** file offset where these bytes are written */
  regionStart: number;
}

export interface RebuildError {
  error: string;
  /** how many bytes the packed bank exceeds its ROM region by (if overflow) */
  overflowBy?: number;
}

/**
 * Rebuild a bank's ROM bytes after editing some lines. `editedText` maps a line
 * index to its new editable string; unspecified lines keep their original text.
 * Re-encodes every line, repacks the pointer table + data to the front of the
 * bank region, and pads the remainder with 0xFF. Fails (without mutating the
 * ROM) if the packed result would overflow the bank's original region.
 */
export function rebuildBank(
  rom: Uint8Array,
  bank: M3Bank,
  editedText: Map<number, string>
): RebuildResult | RebuildError {
  const regionSize = bank.regionEnd - bank.regionStart;
  const count = bank.lines.length;

  // Re-encode each line into obfuscation-free decoded codes + terminator.
  const decodedLines: number[][] = [];
  for (const line of bank.lines) {
    const txt = editedText.has(line.index) ? editedText.get(line.index)! : line.text;
    let codes: number[];
    try {
      codes = editedText.has(line.index) ? textToCodes(txt) : line.codes.slice();
    } catch (e) {
      return { error: `سطر ${line.index}: ${(e as Error).message}` };
    }
    decodedLines.push([...codes, END_BYTE]);
  }

  // Layout: [pointer table (count * 2) + 0xFFFF (2)] then line data back-to-back.
  const ptrTableBytes = count * 2 + 2;
  const dataBytesTotal = decodedLines.reduce((s, l) => s + l.length, 0);
  const packedSize = ptrTableBytes + dataBytesTotal;
  if (packedSize > regionSize) {
    return {
      error: `البنك ${bank.index} أكبر من مساحته الأصلية بعد التعديل`,
      overflowBy: packedSize - regionSize,
    };
  }

  // How far the original bank actually reached (pointer table + furthest line).
  // We only ever overwrite up to this extent + the new packed size, never the
  // whole (possibly ROM-spanning) region — writing 0xFF past a bank's real data
  // would clobber whatever follows it (e.g. the last bank runs to ROM end).
  let originalExtent = ptrTableBytes;
  for (const line of bank.lines) {
    originalExtent = Math.max(originalExtent, line.fileOffset - bank.regionStart + line.codes.length + 1);
  }
  const outLen = Math.max(packedSize, Math.min(originalExtent, regionSize));

  const out = new Uint8Array(outLen).fill(0xff);
  // pointer table + its 0xFFFF terminator
  const addrOfFFFFrel = count * 2; // offset of 0xFFFF within region
  out[addrOfFFFFrel] = 0xff;
  out[addrOfFFFFrel + 1] = 0xff;
  const dataBaseRel = addrOfFFFFrel; // game reads at addrOfFFFF + pointer

  let cursor = ptrTableBytes; // first free byte after table+terminator
  for (let n = 0; n < count; n++) {
    const pointer = cursor - dataBaseRel;
    out[n * 2] = pointer & 0xff;
    out[n * 2 + 1] = (pointer >>> 8) & 0xff;
    // write obfuscated bytes at their real ROM addresses
    for (let k = 0; k < decodedLines[n].length; k++) {
      const fileOff = bank.regionStart + cursor;
      out[cursor] = encodeByte(rom, decodedLines[n][k], ROM_BASE + fileOff);
      cursor++;
    }
  }
  return { bytes: out, regionStart: bank.regionStart };
}

/** Apply a rebuilt bank into a copy of the ROM and return the new ROM bytes. */
export function applyRebuild(rom: Uint8Array, result: RebuildResult): Uint8Array {
  const copy = new Uint8Array(rom);
  copy.set(result.bytes, result.regionStart);
  return copy;
}
