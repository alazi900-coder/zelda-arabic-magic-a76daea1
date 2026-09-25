/**
 * Writes an edited PNG back into an SFP entry WITHOUT reordering its layout.
 *
 * The first version rewrote the tile map in row-major order at the width I had
 * estimated. The width is not stored in the file, so where the estimate was
 * wrong the map came out in the wrong order and the picture turned to stripes
 * -- which is exactly what the cartridge showed.
 *
 * Here nothing is reordered. Every map cell keeps its position, its flips and
 * its palette; only which tile it names can change, and only so that two cells
 * that used to share a tile can now differ. A wrong width can still misplace
 * the Arabic I painted, but it can no longer scramble a picture.
 *
 * The tile area keeps its exact size, so the entry's length never moves. The
 * distinct 8x8 squares the new drawing needs are ranked by how much of the
 * picture they cover and handed the slots; if they outnumber the slots, the
 * rarest are folded into their closest neighbour instead of the whole label
 * being refused, and the count comes back in `merged`.
 */
import { execFileSync } from "node:child_process";
import { readEntry } from "./l5img.mjs";

const BLACK = 40;   // the drawings arrive on black, which is the transparent slot

export function buildEntrySafe(decompressed, entry, pngPath, tilesWide, filter = "NEAREST") {
  const img = readEntry(decompressed, entry);
  const dv = new DataView(decompressed.buffer, decompressed.byteOffset, decompressed.length);
  const h = img.header;
  const tilesHigh = Math.ceil(img.map.length / tilesWide);
  const W = tilesWide * 8, H = tilesHigh * 8;

  const raw = execFileSync("python3", ["-c", `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGBA")
if im.size != (${W}, ${H}): im = im.resize((${W}, ${H}), Image.${filter})
sys.stdout.buffer.write(im.tobytes())
`, pngPath], { maxBuffer: 1 << 28 });

  const snap = (pal, r, g, b, a) => {
    if (a < 128) return 0;
    if (r < BLACK && g < BLACK && b < BLACK) return 0;
    let best = 0, bd = Infinity;
    for (let i = 0; i < 16; i++) {
      const d = (pal[i][0] - r) ** 2 + (pal[i][1] - g) ** 2 + (pal[i][2] - b) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  /** The 64 nibbles this cell needs its tile to hold, with the cell's flips undone. */
  const wanted = (m, ent) => {
    const hf = (ent >> 10) & 1, vf = (ent >> 11) & 1;
    const pal = img.palettes[(ent >> 12) & 15] ?? img.palettes[0];
    const px = (m % tilesWide) * 8, py = ((m / tilesWide) | 0) * 8;
    const cell = new Uint8Array(64);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const o = ((py + y) * W + px + x) * 4;
      cell[(vf ? 7 - y : y) * 8 + (hf ? 7 - x : x)] = snap(pal, raw[o], raw[o + 1], raw[o + 2], raw[o + 3]);
    }
    return cell;
  };

  // Group the cells by the square they want, keeping a note of the tile each
  // one names today so a content can be given back the slot it already sits in.
  const contents = new Map();
  img.map.forEach((ent, m) => {
    if ((ent & 0x3ff) >= img.tileCount) return;
    const cell = wanted(m, ent);
    const key = cell.join(",");
    let c = contents.get(key);
    if (!c) { c = { cell, cells: [], votes: new Map() }; contents.set(key, c); }
    c.cells.push(m);
    const t = ent & 0x3ff;
    c.votes.set(t, (c.votes.get(t) ?? 0) + 1);
  });

  // Each distinct square costs one slot whatever its area, so when they
  // outnumber the slots the ones to give up are the ones that cost least to
  // give up -- the closest pair, merged repeatedly -- and never simply the
  // rarest. The rarest squares are the letters; dropping those erases the word.
  const list = [...contents.values()];
  const dist = (a, b) => { let d = 0; for (let i = 0; i < 64; i++) if (a[i] !== b[i]) d++; return d; };
  let merged = 0;
  if (list.length > img.tileCount) {
    const D = list.map((a, i) => list.map((b, j) => (j <= i ? Infinity : dist(a.cell, b.cell))));
    const alive = list.map(() => true);
    let n = list.length;
    while (n > img.tileCount) {
      let bi = -1, bj = -1, best = Infinity;
      for (let i = 0; i < list.length; i++) { if (!alive[i]) continue;
        for (let j = i + 1; j < list.length; j++) { if (!alive[j]) continue;
          if (D[i][j] < best) { best = D[i][j]; bi = i; bj = j; } } }
      if (bi < 0) break;
      // the square that covers more of the picture is the one that survives
      if (list[bj].cells.length > list[bi].cells.length) { const t = bi; bi = bj; bj = t; }
      list[bi].cells.push(...list[bj].cells);
      alive[bj] = false; n--; merged++;
      for (let k = 0; k < list.length; k++) {
        if (!alive[k] || k === bi) continue;
        const d = dist(list[bi].cell, list[k].cell);
        if (k < bi) D[k][bi] = d; else D[bi][k] = d;
      }
    }
    for (let i = list.length - 1; i >= 0; i--) if (!alive[i]) list.splice(i, 1);
    for (const c of list) {
      c.votes = new Map();
      for (const m of c.cells) { const t = img.map[m] & 0x3ff; c.votes.set(t, (c.votes.get(t) ?? 0) + 1); }
    }
  }

  // Hand each square a slot, preferring one its own cells already point at so
  // the map changes as little as possible.
  const free = new Set();
  for (let t = 0; t < img.tileCount; t++) free.add(t);
  const placed = [];
  for (const c of list) {
    let slot = -1, n = 0;
    for (const [t, v] of c.votes) if (free.has(t) && v > n) { n = v; slot = t; }
    if (slot < 0) slot = free.values().next().value;
    free.delete(slot);
    c.slot = slot;
    placed.push(c);
  }

  for (const c of placed) {
    const at = entry.dataOffset + h[5] + c.slot * 32;
    for (let i = 0; i < 64; i += 2) decompressed[at + i / 2] = c.cell[i] | (c.cell[i + 1] << 4);
  }
  let moved = 0;
  for (const c of placed) {
    for (const m of c.cells) {
      const ent = img.map[m];
      if ((ent & 0x3ff) === c.slot) continue;
      dv.setUint16(entry.dataOffset + h[3] + m * 2, (ent & ~0x3ff) | c.slot, true);
      moved++;
    }
  }

  return { cells: img.map.length, distinct: contents.size, room: img.tileCount,
           merged, moved, width: W, height: H };
}
