/**
 * Right-to-left text for Inazuma Eleven (Europe), patched into the game's own
 * code.
 *
 * What the engine does (traced in an emulator, ARM9 addresses):
 *   0x02033BD0  DrawString: aligns each line with AlignX, then draws one
 *               glyph at a time left to right, x += width + letter spacing
 *               (the text object's +0x14 -- 1 in dialogue), and records one
 *               rectangle {x, y, w, h} per character.
 *   0x02034100  AlignX: left (0), centre (1) or right (2); the width it
 *               aligns against comes from MeasureString (0x02034020).
 *   0x020580C4  the dialogue calls DrawString once per box, left-aligned, 256
 *               pixels wide, into a 256-wide buffer; it then turns each
 *               recorded rectangle into its own on-screen piece and reveals
 *               them in list order -- that list order *is* the typewriter.
 *
 * Arabic already reaches the screen right way round: the build shapes it and
 * reverses each printed line, and the engine draws that left to right. What
 * is left is where a line sits and which way it is revealed:
 *
 *   1. A line that starts with RTL_MARKER (a zero-width glyph) and asked for
 *      left alignment is aligned right (AlignX hook).
 *      It aligns against at most 232 pixels: the dialogue's 256 is also its
 *      buffer's pitch, so it stays, but the box shows only x 12..242 of it.
 *      The widest English line is 228; 232 puts a right-aligned line's end
 *      as far from the right border as a left-aligned one's start is from
 *      the left.
 *   2. After the dialogue draws a box, each marked line's rectangles are
 *      reversed, so the typewriter starts at the right edge (hook after
 *      0x020580C4).
 *   3. No letter spacing after an Arabic letter (slots 0x8140-0x829A) or a
 *      space, in all three draw loops and both measure loops. With the
 *      engine's 1 pixel after every character, Arabic letters never joined,
 *      and a word gap was 1 + space + 1. Measuring adds the same spacing the
 *      drawing does, so right alignment lands where the text ends.
 *
 * The new code (tools/inazuma-rtl/cave.s, 408 bytes) goes at the end of the
 * ITCM autoload block, 0x01FFF420, which the SDK otherwise leaves to the
 * ITCM arena; the arena's start is moved past it. The ARM9 binary is BLZ
 * compressed on the cartridge, so it is decompressed, patched, and written
 * back uncompressed past the end of the used ROM, with the header pointing
 * at it. Every instruction replaced is checked first: a ROM that is not the
 * European release, or is already patched, is refused unchanged.
 */

import { ndsFiles } from "@/lib/nds/nds-rom";

/** Starts every line of Arabic dialogue: a zero-width glyph the engine reads as "align right". */
export const INAZUMA_RTL_MARKER = "\x82\x95";
export const INAZUMA_RTL_MARKER_CODE = 0x8295;

const ARM9_RAM = 0x02000000;
const CAVE_ADDR = 0x01fff420;
const ITCM_ADDR = 0x01ff8000;

const CAVE_HEX =
  "00c0d3e582005ce301c0d30595005c030600001a00c09de500005ce30300001a02c0a0e300c08de5e80052e3e820a0c3" +
  "38402de958f19fe520005ce30500000a81cc4ce240c05ce20100004a570f5ce30000003a1eff2fe10000a0e31eff2fe1" +
  "20c09de5000000ea18c09de501402de914009ae5efffffeb0010a0e10140bde81eff2fe10c402de90620a0e10730a0e1" +
  "090000eb004084e00c40bde81eff2fe10c402de90720a0e10830a0e1020000eb005085e00c40bde81eff2fe10000a0e3" +
  "000051e31eff2f0104e02de500c0d2e581005ce382005c130100d2050cc48001140093e5d3ffffeb04e09de41eff2fe1" +
  "f0032de92e5e84e2010a84e2686cd0e50070a0e3060057e11e0000aa870185e0f210d0e1f490d0e1018087e2060058e1" +
  "040000aa880185e0f220d0e1010052e101808802f8ffff0a000059e30f00001a870185e0881185e0081041e2010050e1" +
  "0a0000aa002090e5003091e5003080e5002081e5042090e5043091e5043080e5042081e5080080e2081041e2f2ffffea" +
  "0870a0e1deffffeaf003bde82c109de51eff2fe104410302";

/** Entry points in the cave, from `arm-none-eabi-nm` on the assembled cave.s. */
const CAVE = {
  align: 0x01fff420,
  drawSp20: 0x01fff480,
  drawSp18: 0x01fff488,
  measureA: 0x01fff4a4,
  measureB: 0x01fff4c0,
  reverse: 0x01fff510,
};

const NOP = 0xe1a00000;

function hexBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function u32(d: Uint8Array, at: number): number {
  return (d[at] | (d[at + 1] << 8) | (d[at + 2] << 16) | (d[at + 3] << 24)) >>> 0;
}

function setU32(d: Uint8Array, at: number, v: number): void {
  d[at] = v & 0xff; d[at + 1] = (v >>> 8) & 0xff; d[at + 2] = (v >>> 16) & 0xff; d[at + 3] = (v >>> 24) & 0xff;
}

/** ARM `b`/`bl` from `from` to `to`. */
function branch(from: number, to: number, link: boolean): number {
  const offset = ((to - (from + 8)) >> 2) & 0xffffff;
  return ((link ? 0xeb000000 : 0xea000000) | offset) >>> 0;
}

/**
 * Nintendo's backward LZ ("BLZ"), which the ARM9 binary ships in -- the same
 * walk as the game's own decompressor at 0x0200095C. `data` ends at the
 * compressed end; its last eight bytes say how much of the tail is
 * compressed and how much bigger it gets. Everything before the compressed
 * tail is stored as-is.
 */
export function blzDecompress(data: Uint8Array): Uint8Array {
  const n = data.length;
  const packed = u32(data, n - 8);
  const extra = u32(data, n - 4);
  const encLen = packed & 0xffffff;
  const headerLen = packed >>> 24;
  const out = new Uint8Array(n + extra);
  out.set(data.subarray(0, n));
  let src = n - headerLen;
  let dst = n + extra;
  const stop = n - encLen;
  while (src > stop) {
    let flags = data[--src];
    for (let bit = 0; bit < 8 && src > stop; bit++, flags <<= 1) {
      if (flags & 0x80) {
        const a = data[--src];
        const b = data[--src];
        const disp = (((a & 0x0f) << 8) | b) + 3;
        const len = (a >> 4) + 3;
        for (let k = 0; k < len; k++, dst--) out[dst - 1] = out[dst - 1 + disp];
      } else {
        out[--dst] = data[--src];
      }
    }
  }
  return out;
}

/** CRC-16 (poly 0xA001) over the header, as the DS firmware checks it. */
function headerCrc(rom: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < 0x15e; i++) {
    crc ^= rom[i];
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}

/** The hooks: address, the instruction expected there, and what replaces it. */
function hooks(): { addr: number; expect: number; put: number }[] {
  const out: { addr: number; expect: number; put: number }[] = [
    { addr: 0x02034100, expect: 0xe92d4038, put: branch(0x02034100, CAVE.align, false) },
    { addr: 0x02033efc, expect: 0xe59a1014, put: branch(0x02033efc, CAVE.drawSp20, true) },
    { addr: 0x020346e8, expect: 0xe59a1014, put: branch(0x020346e8, CAVE.drawSp18, true) },
    { addr: 0x02034968, expect: 0xe59a1014, put: branch(0x02034968, CAVE.drawSp18, true) },
    { addr: 0x020340b8, expect: 0xe3510000, put: branch(0x020340b8, CAVE.measureA, true) },
    { addr: 0x020340bc, expect: 0x13540000, put: NOP },
    { addr: 0x020340c0, expect: 0x15970014, put: NOP },
    { addr: 0x020340c4, expect: 0x10844000, put: NOP },
    { addr: 0x02033fd8, expect: 0xe3510000, put: branch(0x02033fd8, CAVE.measureB, true) },
    { addr: 0x02033fdc, expect: 0x13550000, put: NOP },
    { addr: 0x02033fe0, expect: 0x15980014, put: NOP },
    { addr: 0x02033fe4, expect: 0x10855000, put: NOP },
    { addr: 0x020580c8, expect: 0xe59d102c, put: branch(0x020580c8, CAVE.reverse, true) },
  ];
  return out;
}

/**
 * A copy of the ROM with the right-to-left engine patch applied. Throws,
 * leaving nothing half-written, if the code is not exactly what was traced.
 */
export function patchInazumaRtl(rom: Uint8Array): Uint8Array {
  const a9Off = u32(rom, 0x20);
  const a9Ram = u32(rom, 0x28);
  const a9Size = u32(rom, 0x2c);
  if (a9Ram !== ARM9_RAM) throw new Error("ARM9 لا يُحمَّل عند 0x02000000 — ليست نسخة إينازوما الأوروبية");
  const packed = rom.slice(a9Off, a9Off + a9Size);

  // Module parameters: found by the SDK's magic word right after them.
  const magic = [0x21, 0x06, 0xc0, 0xde];
  let mp = -1;
  for (let i = 0; i < 0x4000 && mp < 0; i += 4) {
    if (packed[i] === magic[0] && packed[i + 1] === magic[1] && packed[i + 2] === magic[2] && packed[i + 3] === magic[3]) mp = i - 0x1c;
  }
  if (mp < 0) throw new Error("لم أجد معاملات وحدة ARM9");
  // The compressed stream ends where the module parameters say, not at the
  // end of the file: the bytes after it are overwritten by the output.
  const compressedEnd = u32(packed, mp + 0x14);
  let a9 = compressedEnd ? blzDecompress(packed.subarray(0, compressedEnd - ARM9_RAM)) : packed;

  const listStart = u32(a9, mp) - ARM9_RAM;
  const listEnd = u32(a9, mp + 4) - ARM9_RAM;
  const autoloadStart = u32(a9, mp + 8) - ARM9_RAM;
  if (listEnd - listStart !== 24 || u32(a9, listStart) !== ITCM_ADDR) throw new Error("جدول التحميل التلقائي ليس كما قيس");
  // Built once already (the editor keeps the ROM it was opened with, but a
  // patched ROM can be opened too): leave it as it is.
  if (!compressedEnd && hooks().every((h) => u32(a9, h.addr - ARM9_RAM) === h.put)) return rom;
  const itcmSize = u32(a9, listStart + 4);
  if (ITCM_ADDR + itcmSize !== CAVE_ADDR) {
    throw new Error("الروم معدَّل مسبقاً أو ليس النسخة الأوروبية — ITCM لا ينتهي حيث يُتوقَّع");
  }
  for (const h of hooks()) {
    if (u32(a9, h.addr - ARM9_RAM) !== h.expect) {
      throw new Error(`التعليمة عند 0x${h.addr.toString(16)} ليست كما قيست — الروم معدَّل أو نسخة أخرى`);
    }
  }
  const arenaLiteral = 0x0200712c - ARM9_RAM;
  if (u32(a9, arenaLiteral) !== CAVE_ADDR) throw new Error("بداية ساحة ITCM ليست كما قيست");

  // Insert the cave after the ITCM block's data; the DTCM block and the list
  // after it move down by its size.
  const cave = hexBytes(CAVE_HEX);
  const pad = (4 - (cave.length % 4)) % 4;
  const grow = cave.length + pad;
  const insertAt = autoloadStart + itcmSize;
  const next = new Uint8Array(a9.length + grow);
  next.set(a9.subarray(0, insertAt));
  next.set(cave, insertAt);
  next.set(a9.subarray(insertAt), insertAt + grow);
  a9 = next;
  setU32(a9, mp, listStart + grow + ARM9_RAM);
  setU32(a9, mp + 4, listEnd + grow + ARM9_RAM);
  setU32(a9, mp + 0x14, 0); // no longer compressed
  setU32(a9, listStart + grow + 4, itcmSize + grow);
  setU32(a9, arenaLiteral, (CAVE_ADDR + grow + 31) & ~31);
  for (const h of hooks()) setU32(a9, h.addr - ARM9_RAM, h.put);

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
