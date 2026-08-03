/**
 * The layout claims in risen3-fnt.ts were read off a real `0_na_fnt.pak` and
 * checked by rebuilding all seven fonts byte for byte. That file cannot live in
 * the repository, so the fixture here is built to the same shape — enough to
 * catch a field written in the wrong place, the wrong size, or a length left
 * stale, which is the failure that makes the engine drop a font entirely.
 */
import { describe, it, expect } from "vitest";
import {
  parseRisen3Fnt,
  buildRisen3Fnt,
  looksLikeRisen3Fnt,
  risen3FntName,
  risen3FntAtlas,
  patchRisen3FontDb,
  readRisen3FontDbEnd,
  readRisen3FontDbNames,
} from "@/lib/risen3-fnt";

const HEADER_END = 0xac;
const RECORD_SIZE = 28;

function ddsBytes(width: number, height: number, fill = 7): Uint8Array {
  const out = new Uint8Array(128 + width * height);
  out.set([0x44, 0x44, 0x53, 0x20], 0);
  const view = new DataView(out.buffer);
  view.setUint32(4, 124, true);
  view.setUint32(12, height, true);
  view.setUint32(16, width, true);
  out.fill(fill, 128);
  return out;
}

/** A font object shaped like the real ones: header, charmap, records, texture. */
function fixture(options: { pairs: number; glyphs: number; opaque: number; width: number; height: number }): Uint8Array {
  const dds = ddsBytes(options.width, options.height);
  const size =
    HEADER_END + 4 + 4 * options.pairs + 4 + RECORD_SIZE * options.glyphs + options.opaque + 4 + dds.length + 36;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) out[0x34 + i] = "GEDXFNT0".charCodeAt(i);
  view.setInt32(0x40, -30, true); // CreateFont height
  view.setUint32(0x50, 700, true); // weight
  for (const [i, ch] of [..."Test Font"].entries()) {
    out[0x5c + 2 * i] = ch.charCodeAt(0);
  }

  let p = HEADER_END;
  view.setUint32(p, options.pairs, true);
  p += 4;
  for (let i = 0; i < options.pairs; i++) {
    view.setUint16(p, 0x20 + i, true);
    view.setUint16(p + 2, i, true);
    p += 4;
  }
  view.setUint32(p, options.glyphs, true);
  p += 4;
  for (let i = 0; i < options.glyphs; i++) {
    for (let k = 0; k < RECORD_SIZE / 4; k++) view.setInt32(p + 4 * k, i * 10 + k, true);
    p += RECORD_SIZE;
  }
  for (let i = 0; i < options.opaque; i++) out[p + i] = 0xa5;
  p += options.opaque;
  view.setUint32(p, dds.length, true);
  p += 4;
  out.set(dds, p);
  p += dds.length;

  const end = p;
  view.setUint32(p, 44, true);
  view.setUint32(p + 4, end - 44, true);
  for (let k = 0; k < 3; k++) view.setBigInt64(p + 9 + 9 * k, BigInt(end), true);
  return out;
}

describe("Risen 3 font objects", () => {
  const shape = { pairs: 209, glyphs: 209, opaque: 4, width: 256, height: 256 };

  it("recognises one, and refuses anything else", () => {
    expect(looksLikeRisen3Fnt(fixture(shape))).toBe(true);
    expect(looksLikeRisen3Fnt(new Uint8Array(512))).toBe(false);
    expect(() => parseRisen3Fnt(new Uint8Array(512))).toThrow();
  });

  it("reads the name, the charmap, the records and the texture", () => {
    const doc = parseRisen3Fnt(fixture(shape));
    expect(risen3FntName(fixture(shape))).toBe("Test Font");
    expect(doc.charmap).toHaveLength(209);
    expect(doc.charmap[0]).toEqual({ charCode: 0x20, glyphIndex: 0 });
    expect(doc.glyphs).toHaveLength(209);
    // x0, y0, x1, y1, advance and two unresolved fields.
    expect(doc.glyphs[1].fields).toEqual([10, 11, 12, 13, 14, 15, 16]);
    const atlas = risen3FntAtlas(doc);
    expect([atlas.width, atlas.height]).toEqual([256, 256]);
    expect(atlas.pixels).toHaveLength(256 * 256);
  });

  it("rebuilds it byte for byte", () => {
    // Measured the same way on the shipped file: all seven fonts of a real
    // 0_na_fnt.pak come back identical, including the three that carry a block
    // between the records and the texture that nothing here reads.
    for (const opaque of [4, 12372, 15740, 21772]) {
      const bytes = fixture({ ...shape, opaque });
      expect(buildRisen3Fnt(parseRisen3Fnt(bytes))).toEqual(bytes);
    }
  });

  it("recomputes the texture length and the footer when the texture grows", () => {
    // A stale length is not cosmetic: the engine reads a truncated texture and
    // drops the whole font, Latin letters included.
    const doc = parseRisen3Fnt(fixture(shape));
    doc.dds = ddsBytes(256, 512);
    const out = buildRisen3Fnt(doc);
    const view = new DataView(out.buffer);
    const ddsAt = out.length - 36 - doc.dds.length;
    expect(view.getUint32(ddsAt - 4, true)).toBe(doc.dds.length);
    const footer = out.length - 36;
    expect(view.getUint32(footer, true)).toBe(44);
    expect(view.getUint32(footer + 4, true)).toBe(footer - 44);
    for (let k = 0; k < 3; k++) expect(Number(view.getBigInt64(footer + 9 + 9 * k, true))).toBe(footer);
    // And it still reads back.
    expect(risen3FntAtlas(parseRisen3Fnt(out)).height).toBe(512);
  });
});

describe("Risen 3 — the archive index", () => {
  /** The index's record shape, read off a real w_fnt_0_na.db. */
  function dbFixture(entries: { name: string; end: number }[]): Uint8Array {
    const parts: number[] = [];
    for (const e of entries) {
      const name = [...e.name].map((c) => c.charCodeAt(0));
      const push32 = (v: number) => parts.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
      push32(name.length);
      parts.push(...name);
      push32(44);
      push32(e.end - 44);
      parts.push(0);
      for (let k = 0; k < 3; k++) {
        push32(e.end);
        push32(0);
        parts.push(0);
      }
      parts.push(0, 0, 0, 0, 0, 0, 0, 0);
    }
    return Uint8Array.from(parts);
  }

  const db = dbFixture([
    { name: "Linux Biolinum O_30__sdf", end: 1080204 },
    { name: "Consolas_14_bo", end: 72540 },
  ]);

  it("lists the names it knows", () => {
    // The index knows a font by its full name; the font's own header carries
    // only the family, and two of the seven share one.
    expect(readRisen3FontDbNames(db)).toEqual(["Linux Biolinum O_30__sdf", "Consolas_14_bo"]);
  });

  it("reads back the size it records", () => {
    expect(readRisen3FontDbEnd(db, "Linux Biolinum O_30__sdf")).toBe(1080204);
    expect(readRisen3FontDbEnd(db, "Consolas_14_bo")).toBe(72540);
  });

  it("writes a new size, and touches nobody else's record", () => {
    // This is the fix for the build that made the game show no text at all: the
    // atlas grew, the font grew with it, and the index still said the old size,
    // so the engine dropped the font — Latin letters included.
    const patched = patchRisen3FontDb(db, "Linux Biolinum O_30__sdf", 2133296);
    expect(readRisen3FontDbEnd(patched, "Linux Biolinum O_30__sdf")).toBe(2133296 - 36);
    expect(readRisen3FontDbEnd(patched, "Consolas_14_bo")).toBe(72540);
    expect(patched.length).toBe(db.length);
  });

  it("refuses a name it cannot find rather than writing somewhere wrong", () => {
    expect(() => patchRisen3FontDb(db, "Nope", 100)).toThrow();
  });
});

describe("Risen 3 — the charmap must stay in order", () => {
  it("sorts by character code when writing, whatever order it was given", () => {
    // Not tidiness. All seven shipped fonts are strictly ascending, and a build
    // that appended Arabic after the last existing code — «… 8250, 8364, 1548 …»
    // — made the game show no text at all, Latin included: the engine
    // binary-searches this table, so one step out of order loses every
    // character, not only the ones added.
    const doc = parseRisen3Fnt(fixture({ pairs: 4, glyphs: 4, opaque: 4, width: 64, height: 64 }));
    doc.charmap = [
      { charCode: 0x20ac, glyphIndex: 0 },
      { charCode: 0x0621, glyphIndex: 1 },
      { charCode: 0x0041, glyphIndex: 2 },
      { charCode: 0xfe8d, glyphIndex: 3 },
    ];
    const out = parseRisen3Fnt(buildRisen3Fnt(doc));
    expect(out.charmap.map((p) => p.charCode)).toEqual([0x0041, 0x0621, 0x20ac, 0xfe8d]);
    // Sorting must not change which glyph a character draws.
    for (const pair of doc.charmap) {
      expect(out.charmap.find((p) => p.charCode === pair.charCode)!.glyphIndex).toBe(pair.glyphIndex);
    }
  });

  it("keeps a font that was already in order byte for byte", () => {
    const bytes = fixture({ pairs: 209, glyphs: 209, opaque: 4, width: 256, height: 256 });
    expect(buildRisen3Fnt(parseRisen3Fnt(bytes))).toEqual(bytes);
  });
});
