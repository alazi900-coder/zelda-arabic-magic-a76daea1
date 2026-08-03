import { describe, it, expect } from "vitest";
import { addArabicToRisen3Fnt, type DrawnGlyph } from "@/lib/risen3-arabic-font-gen";
import { parseRisen3Fnt, buildRisen3Fnt, risen3FntAtlas, type Risen3FntDocument } from "@/lib/risen3-fnt";
import { sdfEdgeCrossings } from "@/lib/risen3-sdf";

const HEADER_END = 0xac;
const RECORD_SIZE = 28;

function fontWithAtlas(width: number, height: number, pairs: number): Risen3FntDocument {
  const dds = new Uint8Array(128 + width * height);
  dds.set([0x44, 0x44, 0x53, 0x20], 0);
  const ddsView = new DataView(dds.buffer);
  ddsView.setUint32(4, 124, true);
  ddsView.setUint32(12, height, true);
  ddsView.setUint32(16, width, true);
  // Mark the last row so a test can prove the old pixels survive.
  dds.fill(200, 128 + (height - 1) * width, 128 + height * width);

  const size = HEADER_END + 4 + 4 * pairs + 4 + RECORD_SIZE * pairs + 4 + 4 + dds.length + 36;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < 8; i++) bytes[0x34 + i] = "GEDXFNT0".charCodeAt(i);
  let p = HEADER_END;
  view.setUint32(p, pairs, true);
  p += 4;
  for (let i = 0; i < pairs; i++) {
    view.setUint16(p, 0x41 + i, true);
    view.setUint16(p + 2, i, true);
    p += 4;
  }
  view.setUint32(p, pairs, true);
  p += 4;
  p += RECORD_SIZE * pairs;
  p += 4; // opaque tail
  view.setUint32(p, dds.length, true);
  p += 4;
  bytes.set(dds, p);
  p += dds.length;
  view.setUint32(p, 44, true);
  view.setUint32(p + 4, p - 44, true);
  for (let k = 0; k < 3; k++) view.setBigInt64(p + 9 + 9 * k, BigInt(p), true);
  return parseRisen3Fnt(bytes);
}

/** A solid block, the simplest thing a rasteriser can hand over. */
function block(codepoint: number, w: number, h: number, advance = w): DrawnGlyph {
  return { codepoint, width: w, height: h, coverage: new Uint8Array(w * h).fill(255), advance };
}

describe("Risen 3 — adding Arabic to a font", () => {
  const base = fontWithAtlas(256, 256, 8);

  it("grows the atlas instead of writing over the letters already there", () => {
    // Every shipped font is packed to its last row, so there is nowhere inside
    // to put anything: Linux Biolinum O_30 uses row 1022 of 1024.
    const out = addArabicToRisen3Fnt(base, [block(0x0627, 20, 40), block(0x0628, 24, 40)]);
    expect(out.heightBefore).toBe(256);
    expect(out.heightAfter).toBe(512);
    const atlas = risen3FntAtlas(out.document);
    // The row that was there before still reads as it did.
    const lastOld = atlas.pixels.subarray(255 * 256, 256 * 256);
    expect([...lastOld].every((v) => v === 200)).toBe(true);
  });

  it("gives each new glyph a charmap entry and a record that points at it", () => {
    const out = addArabicToRisen3Fnt(base, [block(0x0627, 20, 40, 13)]);
    expect(out.added).toBe(1);
    expect(out.replaced).toEqual([]);
    const pair = out.document.charmap.find((p) => p.charCode === 0x0627)!;
    expect(pair).toBeDefined();
    const record = out.document.glyphs[pair.glyphIndex];
    const [x0, y0, x1, y1, advance] = record.fields;
    expect(x1 - x0).toBe(20);
    expect(y1 - y0).toBe(40);
    expect(advance).toBe(13);
    // And the cell really sits in the new part of the atlas.
    expect(y0).toBeGreaterThanOrEqual(out.heightBefore);
  });

  it("writes the glyph as a field whose edge is where the drawing's edge is", () => {
    const out = addArabicToRisen3Fnt(base, [block(0x0627, 20, 40)]);
    const atlas = risen3FntAtlas(out.document);
    const [x0, y0, x1, y1] = out.document.glyphs.at(-1)!.fields;
    const mid = y0 + Math.floor((y1 - y0) / 2);
    const row = atlas.pixels.subarray(mid * atlas.width, mid * atlas.width + atlas.width);
    // A solid block: everything inside the cell is inside the letter, so the
    // field crosses 128 at the cell's own edges.
    const crossings = sdfEdgeCrossings(row);
    expect(crossings.length).toBeGreaterThanOrEqual(1);
    expect(crossings[0]).toBeGreaterThanOrEqual(x0 - 1);
    expect(crossings.at(-1)!).toBeLessThanOrEqual(x1 + 1);
  });

  it("rewrites a codepoint the font already has instead of adding a second one", () => {
    // 0x41 is in the fixture's charmap. Adding it again must not leave two
    // entries for one character — the engine would read whichever it met first.
    const out = addArabicToRisen3Fnt(base, [block(0x41, 12, 20)]);
    expect(out.added).toBe(0);
    expect(out.replaced).toEqual([0x41]);
    expect(out.document.charmap.filter((p) => p.charCode === 0x41)).toHaveLength(1);
    expect(out.document.glyphs).toHaveLength(base.glyphs.length);
  });

  it("comes back out of the serializer readable, with the lengths rebuilt", () => {
    const out = addArabicToRisen3Fnt(base, [block(0x0627, 20, 40), block(0x0628, 24, 40)]);
    const bytes = buildRisen3Fnt(out.document);
    const again = parseRisen3Fnt(bytes);
    expect(again.charmap).toHaveLength(out.document.charmap.length);
    expect(again.glyphs).toHaveLength(out.document.glyphs.length);
    expect(risen3FntAtlas(again).height).toBe(512);
    // The stored texture length is the one that matters most: left stale, the
    // engine reads a truncated texture and drops the font entirely.
    const view = new DataView(bytes.buffer);
    const ddsAt = bytes.length - 36 - again.dds.length;
    expect(view.getUint32(ddsAt - 4, true)).toBe(again.dds.length);
  });

  it("refuses a glyph wider than the atlas rather than wrapping it", () => {
    expect(() => addArabicToRisen3Fnt(base, [block(0x0627, 300, 40)])).toThrow();
  });
});
