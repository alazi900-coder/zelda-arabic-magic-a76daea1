/**
 * Right-to-left text flow for Phantom Hourglass (USA), applied by the build
 * itself: the ARM9 words of research/phantom-hourglass/ph_rtl_deliver.py
 * (see there for how each was found) plus the line-alignment jump table of
 * ph_rtl_patch.py -- together, what the tested RTL ROM carries -- and a text
 * box and every line, centred ones included, start at the box's right edge.
 *
 * The per-character step (func_020334b4, 0x02033540-0x020335B3) drew a glyph
 * at the pen and then moved the pen by that glyph's advance. Only flipping
 * the add to a subtract (what the tested ROM did) moves left by the glyph
 * just drawn instead of the one about to be drawn, so each gap was the
 * difference of two widths -- letters touched or spread apart -- and a
 * line's first glyph was drawn past the box's right edge. PEN_BLOCK is the
 * same instructions reordered: look up the advance, pen -= advance, then
 * draw at the pen. Same registers and calls, nothing outside the block; the
 * last two keep the `cmp r4,#0 / addeq sp,sp,#8` the `popeq` after it needs.
 *
 * The ARM9 is BLZ compressed on the cartridge, so -- as the Inazuma RTL patch
 * does -- it is decompressed, patched, and written back uncompressed past the
 * end of the used ROM, with the header pointing at it and the module
 * parameters saying it is no longer compressed. Every instruction is checked
 * first: each must be the original or the patched word. A ROM that already
 * has the whole patch (built by this tool, or patched by hand) is returned
 * unchanged; one with only part of it gets the rest.
 */
import { ndsFiles } from "@/lib/nds/nds-rom";
import { blzDecompress } from "@/lib/inazuma/inazuma-rtl-patch";

const ARM9_RAM = 0x02000000;

const PEN_BLOCK_ADDR = 0x02033540;
const PEN_BLOCK_ORIGINAL =
  "fe10d7e128309de5100089e202018de8f820d7e1fa60d7e12c1099e5052082e0033086e05dd8ffeb2c6099e50810a0e1" +
  "0600a0e1305099e549c2ffeb5c209fe50010a0e1020051e100009605b210d0010600a0e154c2ffebd200d0e1000054e3" +
  "f810d7e1050080e008d08d02000081e0b800c7e1";
const PEN_BLOCK =
  "2c6099e50810a0e10600a0e154c2ffeb88209fe50010a0e1020051e100009605b210d0010600a0e15fc2ffebd200d0e1" +
  "301099e5010080e0f810d7e1000041e0b800c7e1fe10d7e128309de5100089e202018de8f820d7e1fa60d7e12c1099e5" +
  "052082e0033086e04cd8ffeb000054e308d08d02";
/** The tested ROM's one-word flip inside the block: add r0,r1,r0 -> sub. */
const OLD_FLIP = { addr: 0x020335ac, original: 0xe0810000, flipped: 0xe0410000 };

const PATCHES = [
  { addr: 0x020392fc, expect: 0xe1d103f4, put: 0xe1d504ba }, // box start, path 1 -> box width
  { addr: 0x02039320, expect: 0xe1d103f4, put: 0xe1d504ba }, // box start, path 3 -> box width
  { addr: 0x02033758, expect: 0xea000004, put: 0xea000001 }, // line alignment case 1 -> 0x02033764
  { addr: 0x0203375c, expect: 0xea000006, put: 0xea000000 }, // case 2 (centred) -> 0x02033764
  { addr: 0x02033760, expect: 0xea000002, put: 0xeaffffff }, // case 3 -> 0x02033764
  { addr: 0x02033764, expect: 0xe1d400fc, put: 0xe1d004ba }, // line reset, mode 0 -> box width
  { addr: 0x02033770, expect: 0xe1d400fc, put: 0xe1d004ba }, // line reset, modes 1/3 -> box width
];

export const PH_UNKNOWN_ARM9_MESSAGE = "كود اللعبة ليس كما قيس — ارفع روم Phantom Hourglass الأمريكي الأصلي";

function u32(d: Uint8Array, at: number): number {
  return (d[at] | (d[at + 1] << 8) | (d[at + 2] << 16) | (d[at + 3] << 24)) >>> 0;
}

function setU32(d: Uint8Array, at: number, v: number): void {
  d[at] = v & 0xff; d[at + 1] = (v >>> 8) & 0xff; d[at + 2] = (v >>> 16) & 0xff; d[at + 3] = (v >>> 24) & 0xff;
}

function hexBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function headerCrc(rom: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < 0x15e; i++) {
    crc ^= rom[i];
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}

/** A copy of the ROM with the right-to-left patch in its ARM9, or the ROM itself if it has it already. */
export function applyPhRtlPatch(rom: Uint8Array): Uint8Array {
  const a9Off = u32(rom, 0x20);
  const a9Size = u32(rom, 0x2c);
  if (u32(rom, 0x28) !== ARM9_RAM) throw new Error(PH_UNKNOWN_ARM9_MESSAGE);
  const packed = rom.slice(a9Off, a9Off + a9Size);

  // Module parameters: found by the SDK's magic word right after them.
  let mp = -1;
  for (let i = 0; i < 0x4000 && mp < 0; i += 4) {
    if (packed[i] === 0x21 && packed[i + 1] === 0x06 && packed[i + 2] === 0xc0 && packed[i + 3] === 0xde) mp = i - 0x1c;
  }
  if (mp < 0) throw new Error(PH_UNKNOWN_ARM9_MESSAGE);
  const compressedEnd = u32(packed, mp + 0x14);
  const a9 = compressedEnd ? blzDecompress(packed.subarray(0, compressedEnd - ARM9_RAM)) : packed;

  const word = (addr: number) => u32(a9, addr - ARM9_RAM);
  const blockAt = PEN_BLOCK_ADDR - ARM9_RAM;
  const original = hexBytes(PEN_BLOCK_ORIGINAL);
  const block = hexBytes(PEN_BLOCK);
  const current = a9.slice(blockAt, blockAt + block.length);
  const penDone = same(current, block);
  if (!penDone) {
    // the untouched block, or the tested ROM's with its one word flipped
    if (word(OLD_FLIP.addr) === OLD_FLIP.flipped) setU32(current, OLD_FLIP.addr - PEN_BLOCK_ADDR, OLD_FLIP.original);
    if (!same(current, original)) throw new Error(PH_UNKNOWN_ARM9_MESSAGE);
  }
  if (penDone && PATCHES.every((p) => word(p.addr) === p.put)) return rom;
  if (!PATCHES.every((p) => word(p.addr) === p.expect || word(p.addr) === p.put)) throw new Error(PH_UNKNOWN_ARM9_MESSAGE);

  a9.set(block, blockAt);
  for (const p of PATCHES) setU32(a9, p.addr - ARM9_RAM, p.put);
  setU32(a9, mp + 0x14, 0); // no longer compressed

  // Past the end of everything the ROM uses, 512-aligned, as a grown file is.
  const used = Math.max(u32(rom, 0x80), ...ndsFiles(rom).map((f) => f.end), a9Off + a9Size);
  const start = Math.ceil(used / 512) * 512;
  const end = start + a9.length;
  const out = new Uint8Array(Math.max(rom.length, Math.ceil(end / 512) * 512)).fill(0xff);
  out.set(rom);
  out.set(a9, start);
  setU32(out, 0x20, start);
  setU32(out, 0x2c, a9.length);
  if (end > u32(out, 0x80)) setU32(out, 0x80, end);
  const crc = headerCrc(out);
  out[0x15e] = crc & 0xff;
  out[0x15f] = crc >> 8;
  return out;
}
