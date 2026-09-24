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
 *   3. No letter spacing after an Arabic letter (a byte 0x80-0xFF but é, or
 *      one of the older two-byte slots 0x8140-0x829A) or a space, in all
 *      three draw loops and both measure loops. With the engine's 1 pixel
 *      after every character, Arabic letters never joined, and a word gap
 *      was 1 + space + 1. Measuring adds the same spacing the drawing does,
 *      so right alignment lands where the text ends.
 *   4. One byte per Arabic letter. The engine reads text as Shift-JIS: a
 *      byte 0x81-0x9F or 0xE0-0xFC starts a two-byte character. After the
 *      patch only 0x81 and 0x82 do -- the English script's quotes, brackets
 *      and 【】 condition lines, and the marker, are all codes led by one of
 *      them -- and every other byte is a character of its own, which is
 *      where the Arabic goes (see INAZUMA_ARABIC_BYTES). The character
 *      length routine (0x02033B18) and the font library's own reader
 *      (0x0202790C) are patched, and so is each inlined lead-byte test
 *      (LEAD_TESTS), in the ARM9 and in overlays 0, 15, 17, 23 and 40: a
 *      test left alone would take an Arabic letter and the byte after it
 *      for one character, and at the end of a line that byte is the NUL.
 *
 * The new code (tools/inazuma-rtl/cave.s, 436 bytes) goes at the end of the
 * ITCM autoload block, 0x01FFF420, which the SDK otherwise leaves to the
 * ITCM arena; the arena's start is moved past it. The ARM9 binary is BLZ
 * compressed on the cartridge, so it is decompressed, patched, and written
 * back uncompressed past the end of the used ROM, with the header pointing
 * at it; the five overlays are too, each through its own FAT entry, with its
 * overlay-table entry marked uncompressed. Every instruction replaced is
 * checked first: a ROM that is not the European release, or is already
 * patched, is refused unchanged.
 */

import { ndsFiles, writeNdsFile } from "@/lib/nds/nds-rom";

/** Starts every line of Arabic dialogue: a zero-width glyph the engine reads as "align right". */
export const INAZUMA_RTL_MARKER = "\x82\x95";
export const INAZUMA_RTL_MARKER_CODE = 0x8295;

const ARM9_RAM = 0x02000000;
const CAVE_ADDR = 0x01fff420;
const ITCM_ADDR = 0x01ff8000;

const CAVE_HEX =
  "00c0d3e582005ce301c0d30595005c030600001a00c09de500005ce30300001a02c0a0e300c08de5e80052e3e820a0c3" +
  "38402de974f19fe520005ce30c00000a80005ce30900003a010c5ce30200002aba005ce31eff2f01050000ea81cc4ce2" +
  "40c05ce20100004a570f5ce30000003a1eff2fe10000a0e31eff2fe120c09de5000000ea18c09de501402de914009ae5" +
  "e8ffffeb0010a0e10140bde81eff2fe10c402de90620a0e10730a0e1090000eb004084e00c40bde81eff2fe10c402de9" +
  "0720a0e10830a0e1020000eb005085e00c40bde81eff2fe10000a0e3000051e31eff2f0104e02de500c0d2e581005ce3" +
  "82005c130100d2050cc48001140093e5ccffffeb04e09de41eff2fe1f0032de92e5e84e2010a84e2686cd0e50070a0e3" +
  "060057e11e0000aa870185e0f210d0e1f490d0e1018087e2060058e1040000aa880185e0f220d0e1010052e101808802" +
  "f8ffff0a000059e30f00001a870185e0881185e0081041e2010050e10a0000aa002090e5003091e5003080e5002081e5" +
  "042090e5043091e5043080e5042081e5080080e2081041e2f2ffffea0870a0e1deffffeaf003bde82c109de51eff2fe1" +
  "04410302";

/** Entry points in the cave, from `arm-none-eabi-nm` on the assembled cave.s. */
const CAVE = {
  align: 0x01fff420,
  drawSp20: 0x01fff49c,
  drawSp18: 0x01fff4a4,
  measureA: 0x01fff4c0,
  measureB: 0x01fff4dc,
  reverse: 0x01fff52c,
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

/**
 * Every inlined Shift-JIS lead-byte test, by overlay (null for the ARM9) and
 * the address of its `cmp rN,#0x81`, with N. All 22 are the same code:
 *
 *   cmp rN,#0x81 / bcc (the 0xE0 test) / cmp rN,#0x9F / bls lead /
 *   cmp rN,#0xE0 / bcc single / cmp rN,#0xFC / bhi single
 *
 * #0x9F becomes #0x82 and #0xFC becomes #0: a lead byte is 0x81 or 0x82, and
 * one from 0xE0 up is always single.
 */
const LEAD_TESTS: { overlay: number | null; sites: [number, number][] }[] = [
  { overlay: null, sites: [[0x02056b98, 0], [0x02057fc4, 0]] },
  {
    overlay: 0,
    sites: [
      [0x02114fa8, 0], [0x02115248, 0], [0x02115364, 0], [0x0211554c, 0], [0x02115658, 0], [0x02115780, 0],
      [0x021158cc, 0], [0x02115a00, 0], [0x02115b38, 0], [0x02115c74, 0], [0x02115d9c, 0], [0x02116468, 0],
    ],
  },
  { overlay: 15, sites: [[0x0214f584, 3], [0x0214f624, 0]] },
  { overlay: 17, sites: [[0x02166fa4, 2], [0x0216703c, 0]] },
  { overlay: 23, sites: [[0x02166538, 0], [0x02166798, 1]] },
  { overlay: 40, sites: [[0x02166394, 0], [0x02166660, 1]] },
];

type Hook = { addr: number; expect: number; put: number };

/** `cmp rN,#imm` for an 8-bit imm. */
function cmpImm(reg: number, imm: number): number {
  return (0xe3500000 | (reg << 16) | imm) >>> 0;
}

function leadTestHooks(sites: [number, number][]): Hook[] {
  return sites.flatMap(([at, reg]) => [
    { addr: at, expect: cmpImm(reg, 0x81), put: cmpImm(reg, 0x81) },
    { addr: at + 8, expect: cmpImm(reg, 0x9f), put: cmpImm(reg, 0x82) },
    { addr: at + 0x10, expect: cmpImm(reg, 0xe0), put: cmpImm(reg, 0xe0) },
    { addr: at + 0x18, expect: cmpImm(reg, 0xfc), put: cmpImm(reg, 0) },
  ]);
}

/** The hooks: address, the instruction expected there, and what replaces it. */
function hooks(): Hook[] {
  const out: Hook[] = [
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
    // Character length (0x02033B18): was 1 for 0x20-0x7E and 0xA1-0xDF, else
    // 2; now 2 below 0x20 and for 0x81-0x82, else 1.
    { addr: 0x02033b30, expect: 0xe350007e, put: 0xe3500081 }, // cmp r0,#0x81
    { addr: 0x02033b34, expect: 0x9a000003, put: 0x3a000003 }, // bcc one byte
    { addr: 0x02033b38, expect: 0xe35000a1, put: 0xe3500082 }, // cmp r0,#0x82
    { addr: 0x02033b3c, expect: 0x3a000003, put: 0x9a000003 }, // bls two bytes
    { addr: 0x02033b40, expect: 0xe35000df, put: NOP },
    { addr: 0x02033b44, expect: 0x8a000001, put: NOP },
    // The font library's reader (0x0202790C): two bytes for 0x81-0x9F and
    // 0xE0 up; now for 0x81-0x82 only.
    { addr: 0x0202791c, expect: 0xe35300a0, put: 0xe3530083 }, // cmp r3,#0x83
    { addr: 0x02027924, expect: 0xe35300e0, put: 0xe3530c01 }, // cmp r3,#0x100
    ...leadTestHooks(LEAD_TESTS[0].sites),
  ];
  return out;
}

/**
 * The lead-byte tests in overlays, patched. Each overlay is BLZ compressed
 * like the ARM9 (the whole file is the stream); it is written back
 * uncompressed and its overlay-table entry says so. Throws, before anything
 * is written, if an overlay is not the size or the code that was traced.
 */
function patchOverlays(rom: Uint8Array): Uint8Array {
  const table = u32(rom, 0x50);
  const patched: { entry: number; file: number; code: Uint8Array }[] = [];
  for (const { overlay, sites } of LEAD_TESTS) {
    if (overlay === null) continue;
    const entry = table + overlay * 32;
    const ram = u32(rom, entry + 4);
    const size = u32(rom, entry + 8);
    const file = u32(rom, entry + 0x18);
    const fat = u32(rom, 0x48) + file * 8;
    const stored = rom.slice(u32(rom, fat), u32(rom, fat + 4));
    const code = u32(rom, entry + 0x1c) >>> 24 & 1 ? blzDecompress(stored) : stored;
    if (u32(rom, entry) !== overlay || code.length !== size) {
      throw new Error(`الجزء ${overlay} من كود اللعبة ليس كما قيس — الروم معدَّل أو نسخة أخرى`);
    }
    for (const h of leadTestHooks(sites)) {
      if (u32(code, h.addr - ram) !== h.expect) {
        throw new Error(`التعليمة عند 0x${h.addr.toString(16)} في الجزء ${overlay} ليست كما قيست — الروم معدَّل أو نسخة أخرى`);
      }
      setU32(code, h.addr - ram, h.put);
    }
    patched.push({ entry, file, code });
  }
  let out = rom;
  for (const { entry, file, code } of patched) {
    out = writeNdsFile(out, ndsFiles(out)[file], code);
    setU32(out, entry + 0x1c, 0); // not compressed
  }
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
  const withOverlays = patchOverlays(rom);

  // Past the end of everything the ROM uses, 512-aligned, as a grown file is.
  const used = Math.max(u32(withOverlays, 0x80), ...ndsFiles(withOverlays).map((f) => f.end), a9Off + a9Size);
  const start = Math.ceil(used / 512) * 512;
  const end = start + a9.length;
  const out = new Uint8Array(Math.max(withOverlays.length, Math.ceil(end / 512) * 512)).fill(0xff);
  out.set(withOverlays);
  out.set(a9, start);
  setU32(out, 0x20, start);
  setU32(out, 0x2c, a9.length);
  if (end > u32(out, 0x80)) setU32(out, 0x80, end);
  const crc = headerCrc(out);
  out[0x15e] = crc & 0xff;
  out[0x15f] = crc >> 8;
  return out;
}
