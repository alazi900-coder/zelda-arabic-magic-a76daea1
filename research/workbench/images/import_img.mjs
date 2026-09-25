/**
 * Turns an edited PNG back into the game's tile-mapped form.
 *
 * Both of these entries carry a single 16-colour palette, so the drawing has to
 * land on those exact 16 colours -- every pixel is snapped to its nearest one
 * rather than re-quantised, which keeps the palette bytes in the ROM untouched
 * and means only tiles and map change. Identical tiles are shared, the way the
 * original does, so the rebuilt entry stays within the tile budget it had.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { openSfp, readEntry, renderEntry } from "./l5img.mjs";
import { writePNG } from "./png_write.mjs";

const [, , sfpPath, entryName, pngPath, tilesWideArg] = process.argv;
const { data, entries } = openSfp(sfpPath);
const img = readEntry(data, entries.find((e) => e.name === entryName));
const tilesWide = +tilesWideArg;
const W = tilesWide * 8, H = (img.map.length / tilesWide) * 8;

// Decode + resize the PNG through Python/PIL, which is already here.
const raw = execFileSync("python3", ["-c", `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGBA").resize((${W}, ${H}), Image.LANCZOS)
sys.stdout.buffer.write(im.tobytes())
`, pngPath], { maxBuffer: 1 << 28 });

const pal = img.palettes[0];
// The drawing arrives on a black background rather than a transparent one, so
// near-black has to become index 0 -- the entry's transparent slot -- or the
// logo ships with a solid black box around it.
const BLACK = 40;
const near = (r, g, b, a) => {
  if (a < 128) return 0;
  if (r < BLACK && g < BLACK && b < BLACK) return 0;
  let best = 0, bd = Infinity;
  for (let i = 0; i < 16; i++) {
    const d = (pal[i][0]-r)**2 + (pal[i][1]-g)**2 + (pal[i][2]-b)**2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
};

const idx = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) idx[i] = near(raw[i*4], raw[i*4+1], raw[i*4+2], raw[i*4+3]);

// Build tiles, sharing identical ones.
const tilesHigh = H / 8;
const seen = new Map(); const tiles = []; const map = [];
for (let ty = 0; ty < tilesHigh; ty++) for (let tx = 0; tx < tilesWide; tx++) {
  const cell = new Uint8Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) cell[y*8+x] = idx[(ty*8+y)*W + tx*8+x];
  const key = cell.join(",");
  let id = seen.get(key);
  if (id === undefined) { id = tiles.length; seen.set(key, id); tiles.push(cell); }
  map.push(id);
}
console.log(`${entryName}: ${W}x${H}  tiles needed ${tiles.length} (original had ${img.tileCount})  cells ${map.length} (original ${img.map.length})`);

// Preview exactly what the game would draw.
const rebuilt = { palettes: img.palettes, map, tileCount: tiles.length,
  tiles: (() => { const b = new Uint8Array(tiles.length * 32);
    tiles.forEach((c, t) => { for (let i = 0; i < 64; i += 2) b[t*32 + i/2] = c[i] | (c[i+1] << 4); });
    return b; })() };
const r = renderEntry(rebuilt, tilesWide);
writePNG(`ar/preview_${entryName.replace(/\W/g, "_")}.png`, r.width, r.height, r.rgba);
console.log(`  wrote ar/preview_${entryName.replace(/\W/g, "_")}.png`);
