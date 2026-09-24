import { describe, expect, it } from "vitest";
import { markInazumaRtlLines } from "../inazuma-editor-bridge";
import { blankInazumaGlyph } from "../inazuma-arabic-font";
import { INAZUMA_RTL_MARKER } from "../inazuma-rtl-patch";

const M = INAZUMA_RTL_MARKER;

describe("markInazumaRtlLines", () => {
  it("starts every printed line and every box with the marker", () => {
    expect(markInazumaRtlLines("ab\\ncd\\fef")).toBe(`${M}ab\\n${M}cd\\f${M}ef`);
  });

  it("does not take a glyph whose second byte is a backslash for a break", () => {
    // 0x81 0x5C is one two-byte glyph, followed by the letter n.
    const glyph = String.fromCharCode(0x81, 0x5c);
    expect(markInazumaRtlLines(`${glyph}n`)).toBe(`${M}${glyph}n`);
  });
});

/** A minimal NFTR: PLGC with two 2-byte glyphs, HDWC, a type-0 PAMC for 0x8294-0x8295. */
function nftr(): Uint8Array {
  const out = new Uint8Array(0x10 + 20 + 22 + 24);
  const v = new DataView(out.buffer);
  let p = 0x10;
  out.set([0x50, 0x4c, 0x47, 0x43], p); v.setUint32(p + 4, 20, true); v.setUint16(p + 10, 2, true);
  out.set([0xaa, 0xbb, 0xcc, 0xdd], p + 16);
  p += 20;
  out.set([0x48, 0x44, 0x57, 0x43], p); v.setUint32(p + 4, 22, true); v.setUint16(p + 8, 0, true); v.setUint16(p + 10, 1, true);
  out.set([0, 5, 5, 0, 6, 6], p + 16);
  p += 22;
  out.set([0x50, 0x41, 0x4d, 0x43], p); v.setUint32(p + 4, 24, true);
  v.setUint16(p + 8, 0x8294, true); v.setUint16(p + 10, 0x8295, true); v.setUint32(p + 12, 0, true); v.setUint16(p + 20, 0, true); // glyph 0 upward
  return out;
}

describe("blankInazumaGlyph", () => {
  it("empties the marker's glyph and gives it no width, touching nothing else", () => {
    const before = nftr();
    const after = blankInazumaGlyph(before, 0x8295);
    const changed = [...before].map((b, i) => (b !== after[i] ? i : -1)).filter((i) => i >= 0);
    // glyph 1's two bitmap bytes and its two non-zero width bytes (its bearing is already 0)
    expect(changed).toEqual([0x10 + 18, 0x10 + 19, 0x10 + 20 + 20, 0x10 + 20 + 21]);
    expect(Array.from(after.subarray(0x10 + 16, 0x10 + 18))).toEqual([0xaa, 0xbb]);
  });
});
