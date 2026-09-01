/** Synthetic fonts/talk builder, for tests only. */
import { encodeFe12Glyph, type Fe12Raster } from "./fe12-font";

const HEADER_BASE = 0x20;
const TRAIL_TABLE_START = 0x40;
const TRAIL_TABLE_COUNT = 0xc0;

export interface FontGlyphSpec {
  code: number; // full 2-byte Shift-JIS code
  width: number;
  raster: Fe12Raster;
}

/** Builds a fonts/talk-shaped buffer holding exactly the given glyphs, each with `paddingBytes` of extra room after its encoding (so writeFe12GlyphInPlace has budget to draw into, like the real font's kanji glyphs do). */
export function buildSyntheticFont(glyphs: FontGlyphSpec[], paddingBytes = 40): Uint8Array {
  const byTrailByte = new Map<number, FontGlyphSpec[]>();
  for (const glyph of glyphs) {
    const trail = glyph.code & 0xff;
    if (trail < TRAIL_TABLE_START) throw new Error(`fixture glyph 0x${glyph.code.toString(16)} has a trail byte below 0x${TRAIL_TABLE_START.toString(16)}, which the real format's trail table cannot address.`);
    const list = byTrailByte.get(trail) ?? [];
    list.push(glyph);
    byTrailByte.set(trail, list);
  }

  const trailBytes = [...byTrailByte.keys()].sort((a, b) => a - b);
  const listBytesByTrail = new Map<number, Uint8Array>();
  const glyphBytesByCode = new Map<number, Uint8Array>();

  let cursor = TRAIL_TABLE_COUNT * 4; // relative to HEADER_BASE — lists start right after the trail table
  const listRelByTrail = new Map<number, number>();
  for (const trail of trailBytes) {
    listRelByTrail.set(trail, cursor);
    const entries = byTrailByte.get(trail)!;
    cursor += entries.length * 8 + 8; // one 8-byte entry per glyph + one zero terminator
  }
  const glyphRelByCode = new Map<number, number>();
  for (const glyph of glyphs) {
    glyphRelByCode.set(glyph.code, cursor);
    const encoded = encodeFe12Glyph(glyph.raster);
    const padded = new Uint8Array(encoded.length + paddingBytes);
    padded.set(encoded, 0);
    glyphBytesByCode.set(glyph.code, padded);
    cursor += padded.length;
  }

  for (const trail of trailBytes) {
    const entries = byTrailByte.get(trail)!;
    const bytes = new Uint8Array(entries.length * 8 + 8);
    const view = new DataView(bytes.buffer);
    entries.forEach((glyph, i) => {
      view.setUint16(i * 8, glyph.code, true);
      view.setUint16(i * 8 + 2, glyph.width, true);
      view.setUint32(i * 8 + 4, glyphRelByCode.get(glyph.code)!, true);
    });
    listBytesByTrail.set(trail, bytes);
  }

  const totalSize = HEADER_BASE + cursor;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);
  view.setUint32(0, totalSize, true);
  view.setUint32(4, 0, true);
  view.setUint32(8, 0, true);

  for (const trail of trailBytes) view.setUint32(HEADER_BASE + (trail - TRAIL_TABLE_START) * 4, listRelByTrail.get(trail)!, true);
  for (const trail of trailBytes) out.set(listBytesByTrail.get(trail)!, HEADER_BASE + listRelByTrail.get(trail)!);
  for (const glyph of glyphs) out.set(glyphBytesByCode.get(glyph.code)!, HEADER_BASE + glyphRelByCode.get(glyph.code)!);

  return out;
}

/** A synthetic 16x16 raster with no zero pixels at all, so its RLE encoding never benefits from a run — the worst case for byte budget, giving a generous but realistic-shaped placeholder glyph. */
export function busyRaster(seed: number): Fe12Raster {
  return Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => (((x * 7 + y * 3 + seed) % 15) + 1)));
}
