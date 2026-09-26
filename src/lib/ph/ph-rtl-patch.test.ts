import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { applyPhRtlPatch } from "./ph-rtl-patch";
import { blzDecompress } from "@/lib/inazuma/inazuma-rtl-patch";

// The USA ROM is not in the repo; these run where a local copy exists.
const BASE = "/home/user/decomps/ph/extract/baserom_ph_usa.nds";
const u32 = (d: Uint8Array, at: number) => (d[at] | (d[at + 1] << 8) | (d[at + 2] << 16) | (d[at + 3] << 24)) >>> 0;

function arm9(rom: Uint8Array): Uint8Array {
  const off = u32(rom, 0x20), size = u32(rom, 0x2c);
  const packed = rom.slice(off, off + size);
  const mp = packed.findIndex((_, i) => i % 4 === 0 && u32(packed, i) === 0xdec00621) - 0x1c;
  const end = u32(packed, mp + 0x14);
  return end ? blzDecompress(packed.subarray(0, end - 0x02000000)) : packed;
}

describe.skipIf(!existsSync(BASE))("applyPhRtlPatch (local USA ROM)", () => {
  const base = new Uint8Array(readFileSync(BASE));
  const patched = applyPhRtlPatch(base);

  it("writes the patch words and nothing else of the ARM9 changes", () => {
    const before = arm9(base), after = arm9(patched);
    expect(after.length).toBe(before.length);
    const diffs: number[] = [];
    for (let i = 0; i < before.length; i += 4) if (u32(before, i) !== u32(after, i)) diffs.push(0x02000000 + i);
    expect(diffs.map((a) => a.toString(16))).toEqual(["2000b78", "20335ac", "2033758", "203375c", "2033760", "2033764", "2033770", "20392fc", "2039320"]);
    expect(u32(after, 0x020335ac - 0x02000000)).toBe(0xe0410000);
  });

  it("leaves an already patched ROM unchanged", () => {
    expect(applyPhRtlPatch(patched)).toBe(patched);
  });
});
