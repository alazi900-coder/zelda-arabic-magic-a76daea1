import { describe, expect, it } from "vitest";
import { tightenSpace } from "../inazuma-arabic-font";

/** A minimal NFTR: header, an HDWC for glyphs 0-1, and a type-0 PAMC mapping 0x20-0x21 to them. */
function nftr(spaceBearing: number): Uint8Array {
  const out = new Uint8Array(0x10 + 22 + 28);
  const v = new DataView(out.buffer);
  let p = 0x10;
  out.set([0x48, 0x44, 0x57, 0x43], p); v.setUint32(p + 4, 22, true);
  v.setUint16(p + 8, 0, true); v.setUint16(p + 10, 1, true);
  out.set([spaceBearing, 0, 3, 0, 5, 5], p + 16);
  p += 22;
  out.set([0x50, 0x41, 0x4d, 0x43], p); v.setUint32(p + 4, 28, true);
  v.setUint16(p + 8, 0x20, true); v.setUint16(p + 10, 0x21, true); v.setUint32(p + 12, 0, true);
  v.setUint16(p + 20, 0, true);
  return out;
}

describe("tightenSpace", () => {
  it("takes the bearing off the space and nothing else", () => {
    const before = nftr(3);
    const after = tightenSpace(before);
    const changed = [...before].map((b, i) => (b !== after[i] ? i : -1)).filter((i) => i >= 0);
    expect(changed).toEqual([0x10 + 16]);
    expect(after[0x10 + 16]).toBe(0);
    expect(after[0x10 + 18]).toBe(3); // the advance stays
  });
});
