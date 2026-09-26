/**
 * Right-to-left text flow for Phantom Hourglass (USA), applied by the build
 * itself: the ARM9 words of research/phantom-hourglass/ph_rtl_deliver.py
 * (see there for how each was found) plus the line-alignment jump table of
 * ph_rtl_patch.py -- together, what the tested RTL ROM carries. The pen
 * subtracts each glyph's advance instead of adding it, and a text box and
 * every line, centred ones included, start at the box's right edge.
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

const PATCHES = [
  { addr: 0x020335ac, expect: 0xe0810000, put: 0xe0410000 }, // pen += width -> pen -= width
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
  if (PATCHES.every((p) => word(p.addr) === p.put)) return rom;
  if (!PATCHES.every((p) => word(p.addr) === p.expect || word(p.addr) === p.put)) throw new Error(PH_UNKNOWN_ARM9_MESSAGE);

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
