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

  it("reorders the pen block and writes the patch words, nothing else of the ARM9", () => {
    const before = arm9(base), after = arm9(patched);
    expect(after.length).toBe(before.length);
    const diffs: string[] = [];
    for (let i = 0; i < before.length; i += 4) {
      const addr = 0x02000000 + i;
      if (addr >= 0x02033540 && addr < 0x020335b4) continue; // the reordered pen block
      if (u32(before, i) !== u32(after, i)) diffs.push(addr.toString(16));
    }
    expect(diffs).toEqual(["2000b78", "2033758", "203375c", "2033760", "2033764", "2033770", "20392fc", "2039320"]);
    // pen -= advance comes before the draw call, not after it
    const at = (a: number) => u32(after, a - 0x02000000);
    expect(at(0x0203357c)).toBe(0xe0410000);
    expect(at(0x020335a8) >>> 24).toBe(0xeb);
  });

  const OLD_RTL = "/tmp/ph_bisect_test/DELIVERY_full.nds"; // a ROM with the earlier one-word flip
  it.skipIf(!existsSync(OLD_RTL))("fixes a ROM that has the earlier one-word flip", () => {
    const fixed = arm9(applyPhRtlPatch(new Uint8Array(readFileSync(OLD_RTL))));
    const ours = arm9(patched);
    for (let a = 0x02033540; a < 0x020335b4; a += 4) expect(u32(fixed, a - 0x02000000)).toBe(u32(ours, a - 0x02000000));
  });

  it("leaves an already patched ROM unchanged", () => {
    expect(applyPhRtlPatch(patched)).toBe(patched);
  });
});
