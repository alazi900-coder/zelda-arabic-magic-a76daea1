import { describe, it, expect } from "vitest";
import { addArabicToRisen3Fnt, type DrawnGlyph } from "@/lib/risen3-arabic-font-gen";
import { parseRisen3Fnt, buildRisen3Fnt, risen3FntAtlas, type Risen3FntDocument } from "@/lib/risen3-fnt";
import { sdfEdgeCrossings } from "@/lib/risen3-sdf";

const HEADER_END = 0xac;
const RECORD_SIZE = 28;

function fontWithAtlas(width: number, height: number, pairs: number, codes?: number[]): Risen3FntDocument {
  codes = codes ?? Array.from({ length: pairs }, (_, i) => 0x41 + i);
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
    view.setUint16(p, codes[i], true);
    view.setUint16(p + 2, i, true);
    p += 4;
  }
  view.setUint32(p, pairs, true);
  p += 4;
  // Real cells, laid out in a row near the top so a test can take them over.
  for (let i = 0; i < pairs; i++) {
    const x = i * 30;
    view.setInt32(p, x, true);
    view.setInt32(p + 4, 4, true);
    view.setInt32(p + 8, x + 26, true);
    view.setInt32(p + 12, 4 + 40, true);
    view.setInt32(p + 16, 20, true);
    p += RECORD_SIZE;
  }
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
  return { codepoint, width: w, height: h, coverage: new Uint8Array(w * h).fill(255), advance, leftBearing: -6, topBearing: 2 };
}

describe("Risen 3 — adding Arabic when the atlas is allowed to grow", () => {
  // Growing is off by default — the engine refuses an atlas larger than any it
  // ships — so these ask for it explicitly to check that path still works.
  const base = fontWithAtlas(256, 256, 8);
  const grow = { allowGrow: true } as const;

  it("grows the atlas instead of writing over the letters already there", () => {
    // Every shipped font is packed to its last row, so there is nowhere inside
    // to put anything: Linux Biolinum O_30 uses row 1022 of 1024.
    const out = addArabicToRisen3Fnt(base, [block(0x0627, 20, 40), block(0x0628, 24, 40)], grow);
    expect(out.heightBefore).toBe(256);
    expect(out.heightAfter).toBe(512);
    const atlas = risen3FntAtlas(out.document);
    // The row that was there before still reads as it did.
    const lastOld = atlas.pixels.subarray(255 * 256, 256 * 256);
    expect([...lastOld].every((v) => v === 200)).toBe(true);
  });

  it("gives each new glyph a charmap entry and a record that points at it", () => {
    const out = addArabicToRisen3Fnt(base, [block(0x0627, 20, 40, 13)], grow);
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
    const out = addArabicToRisen3Fnt(base, [block(0x0627, 20, 40)], grow);
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
    const out = addArabicToRisen3Fnt(base, [block(0x41, 12, 20)], grow);
    expect(out.added).toBe(0);
    expect(out.replaced).toEqual([0x41]);
    expect(out.document.charmap.filter((p) => p.charCode === 0x41)).toHaveLength(1);
    expect(out.document.glyphs).toHaveLength(base.glyphs.length);
  });

  it("comes back out of the serializer readable, with the lengths rebuilt", () => {
    const out = addArabicToRisen3Fnt(base, [block(0x0627, 20, 40), block(0x0628, 24, 40)], grow);
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
    expect(() => addArabicToRisen3Fnt(base, [block(0x0627, 300, 40)], grow)).toThrow();
  });
});

describe("Risen 3 — taking over the cells of the Russian alphabet", () => {
  /** A font whose eight cells all belong to Cyrillic letters. */
  const cyrillic = fontWithAtlas(1024, 256, 8, Array.from({ length: 8 }, (_, i) => 0x410 + i));

  it("adds Arabic without growing the atlas at all", () => {
    // This is the whole point. Growing changes the font's size, and the size is
    // written down in the archive's index too — the first build left that stale
    // and the engine dropped the font, so the game showed no text at all.
    const out = addArabicToRisen3Fnt(cyrillic, [block(0x0627, 20, 40), block(0x0628, 24, 40)]);
    expect(out.reused).toBe(2);
    expect(out.appended).toBe(0);
    expect(out.heightAfter).toBe(out.heightBefore);
    expect(risen3FntAtlas(out.document).height).toBe(256);
  });

  it("takes the Russian letter's entry away instead of leaving it pointing at Arabic", () => {
    const out = addArabicToRisen3Fnt(cyrillic, [block(0x0627, 20, 40)]);
    const arabic = out.document.charmap.find((p) => p.charCode === 0x0627)!;
    expect(arabic).toBeDefined();
    // Exactly one character was displaced, and it no longer maps anywhere — the
    // game draws nothing for it rather than an Arabic letter inside a Russian word.
    const displaced = cyrillic.charmap.filter(
      (p) => !out.document.charmap.some((q) => q.charCode === p.charCode)
    );
    expect(displaced).toHaveLength(1);
    expect(displaced[0].glyphIndex).toBe(arabic.glyphIndex);
    // And no character maps to that glyph twice.
    expect(out.document.charmap.filter((p) => p.glyphIndex === arabic.glyphIndex)).toHaveLength(1);
  });

  it("writes the Arabic over the old letter's pixels, leaving none of it", () => {
    const marked = fontWithAtlas(1024, 256, 8, Array.from({ length: 8 }, (_, i) => 0x410 + i));
    const before = risen3FntAtlas(marked);
    // Ink every cell, so whichever one is taken would show its leftovers.
    for (const g of marked.glyphs) {
      const [x0, y0, x1, y1] = g.fields;
      for (let y = y0; y < y1; y++) before.pixels.fill(255, y * before.width + x0, y * before.width + x1);
    }
    const out = addArabicToRisen3Fnt(marked, [block(0x0627, 10, 20)]);
    const after = risen3FntAtlas(out.document);
    const [nx0, ny0] = out.document.glyphs[out.document.charmap.find((p) => p.charCode === 0x0627)!.glyphIndex].fields;
    // The corner of the old cell the smaller new glyph does not cover reads as
    // "far outside a letter", not as the leftover of a Russian one.
    expect(after.pixels[(ny0 + 39) * after.width + (nx0 + 25)]).toBe(0);
    // And where the new glyph is, the field is inside a letter.
    expect(after.pixels[(ny0 + 10) * after.width + (nx0 + 5)]).toBeGreaterThan(128);
  });

  it("shrinks a form too big for any cell rather than growing the atlas", () => {
    // Growing is what the engine refuses, so a form that fits nowhere as drawn
    // is resampled into the roomiest cell left instead.
    const out = addArabicToRisen3Fnt(cyrillic, [block(0x0627, 20, 40), block(0x0628, 900, 40)]);
    expect(out.squeezed).toBe(1);
    expect(out.appended).toBe(0);
    expect(out.heightAfter).toBe(out.heightBefore);
    expect(out.narrowestScale).toBeLessThan(1);
  });

  it("refuses rather than grow when nothing can be reused", () => {
    // Better a named refusal than a file the engine drops without a word.
    expect(() => addArabicToRisen3Fnt(cyrillic, [block(0x0627, 20, 40)], { reuseRanges: null })).toThrow();
  });

  it("appends when growing is asked for explicitly", () => {
    const out = addArabicToRisen3Fnt(cyrillic, [block(0x0627, 20, 40)], { reuseRanges: null, allowGrow: true });
    expect(out.reused).toBe(0);
    expect(out.appended).toBe(1);
  });

  it("leaves a cell alone when two characters share it", () => {
    // Taking it would put an Arabic letter where the other character draws,
    // which is a wrong letter rather than a missing one.
    const shared = fontWithAtlas(1024, 256, 8, Array.from({ length: 8 }, (_, i) => 0x410 + i));
    shared.charmap = shared.charmap.map((p, i) => (i === 1 ? { ...p, glyphIndex: 0 } : p));
    const out = addArabicToRisen3Fnt(shared, [block(0x0627, 20, 40)]);
    const arabic = out.document.charmap.find((p) => p.charCode === 0x0627)!;
    expect(arabic.glyphIndex).not.toBe(0);
  });
});
