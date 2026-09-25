/**
 * Writes an edited PNG back into an SFP container, in place.
 *
 * Only the tile map and the tile pixels change. The palette is left exactly as
 * the cartridge has it and the drawing is snapped onto those sixteen colours,
 * and the entry keeps its original byte length -- a rebuild that needs fewer
 * tiles simply leaves the tail of the old tile area untouched -- so no other
 * entry in the container moves.
 */
import { execFileSync } from "node:child_process";
import { readEntry } from "./l5img.mjs";

const BLACK = 40;   // the drawings arrive on black, which is the transparent slot

export function buildEntry(decompressed, entry, pngPath, tilesWide, filter = "LANCZOS") {
  const img = readEntry(decompressed, entry);
  const dv = new DataView(decompressed.buffer, decompressed.byteOffset, decompressed.length);
  const h = img.header;
  const W = tilesWide * 8, H = (img.map.length / tilesWide) * 8;

  const raw = execFileSync("python3", ["-c", `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGBA").resize((${W}, ${H}), Image.${filter})
sys.stdout.buffer.write(im.tobytes())
`, pngPath], { maxBuffer: 1 << 28 });

  const pal = img.palettes[0];
  const near = (r, g, b, a) => {
    if (a < 128) return 0;
    if (r < BLACK && g < BLACK && b < BLACK) return 0;
    let best = 0, bd = Infinity;
    for (let i = 0; i < 16; i++) {
      const d = (pal[i][0] - r) ** 2 + (pal[i][1] - g) ** 2 + (pal[i][2] - b) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  const idx = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) idx[i] = near(raw[i * 4], raw[i * 4 + 1], raw[i * 4 + 2], raw[i * 4 + 3]);

  const seen = new Map(), tiles = [], map = [];
  for (let ty = 0; ty < H / 8; ty++) for (let tx = 0; tx < tilesWide; tx++) {
    const cell = new Uint8Array(64);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) cell[y * 8 + x] = idx[(ty * 8 + y) * W + tx * 8 + x];
    const key = cell.join(",");
    let id = seen.get(key);
    if (id === undefined) { id = tiles.length; seen.set(key, id); tiles.push(cell); }
    map.push(id);
  }

  const room = img.tileCount;
  if (tiles.length > room) {
    // The entry's tile area is a fixed size, and a redrawn picture often needs
    // a handful more because two cells that were identical in English differ by
    // a pixel or two in Arabic. Merging the closest pair and pointing both map
    // cells at the survivor costs those pixels and nothing else, so it runs
    // until the picture fits rather than refusing a whole label over one tile.
    const dist = (a, b) => { let d = 0; for (let i = 0; i < 64; i++) if (a[i] !== b[i]) d++; return d; };
    while (tiles.length > room) {
      let bi = -1, bj = -1, best = Infinity;
      for (let i = 0; i < tiles.length; i++) {
        for (let j = i + 1; j < tiles.length; j++) {
          const d = dist(tiles[i], tiles[j]);
          if (d < best) { best = d; bi = i; bj = j; if (d === 0) break; }
        }
        if (best === 0) break;
      }
      if (bi < 0) throw new Error(`${entry.name}: يحتاج ${tiles.length} مربّعاً ولا يسع إلا ${room}`);
      tiles.splice(bj, 1);
      for (let m = 0; m < map.length; m++) {
        if (map[m] === bj) map[m] = bi;
        else if (map[m] > bj) map[m]--;
      }
    }
  }
  if (map.length !== img.map.length) {
    throw new Error(`${entry.name}: عدد الخلايا ${map.length} لا يساوي ${img.map.length}`);
  }

  for (let m = 0; m < map.length; m++) dv.setUint16(entry.dataOffset + h[3] + m * 2, map[m], true);
  tiles.forEach((cell, t) => {
    const at = entry.dataOffset + h[5] + t * 32;
    for (let i = 0; i < 64; i += 2) decompressed[at + i / 2] = cell[i] | (cell[i + 1] << 4);
  });

  return { tiles: tiles.length, room, cells: map.length, width: W, height: H };
}
