/**
 * Level-5's image entry, as stored inside an SFP container in Inazuma Eleven.
 *
 * The entry is not a flat sheet -- that assumption is what made every earlier
 * dump come out as noise. It is a tile-mapped image, the way the DS hardware
 * actually draws backgrounds:
 *
 *   0x00  8 x u32 header, a table of section offsets:
 *           [0] format (3)
 *           [1] palette offset (32)
 *           [2] palette offset again
 *           [3] tile MAP offset
 *           [4] map LENGTH in bytes
 *           [5] tile DATA offset
 *           [6] next section
 *           [7] tile data end
 *   0x20  palette: 16 x RGB555
 *   map:  one u16 per cell -- tile index in bits 0-9, H-flip bit 10, V-flip 11
 *   data: 4bpp 8x8 tiles, 32 bytes each, low nibble = left pixel
 *
 * The width is not stored as a number anywhere: the map's cell count is the
 * area, and the width is one of its divisors. `guessWidth` picks the divisor
 * whose aspect comes closest to the shapes these menus actually use.
 */
import { readFileSync } from "node:fs";
import { lz77Decompress, parseSfp } from "./sfp_decode.mjs";

export function readEntry(decompressed, entry) {
  const dv = new DataView(decompressed.buffer, decompressed.byteOffset, decompressed.length);
  const h = [];
  for (let k = 0; k < 8; k++) h.push(dv.getUint32(entry.dataOffset + k * 4, true));
  // One image can carry several 16-colour palettes; each map cell names the
  // one it uses in its top nibble. Reading only the first is what turned the
  // bigger pictures into coloured noise.
  const palCount = Math.max(1, Math.floor((h[3] - h[1]) / 32));
  const palettes = [];
  for (let p = 0; p < palCount; p++) {
    const pal = [];
    for (let i = 0; i < 16; i++) {
      const v = dv.getUint16(entry.dataOffset + h[1] + p * 32 + i * 2, true);
      pal.push([
        Math.round((v & 31) * 255 / 31),
        Math.round(((v >> 5) & 31) * 255 / 31),
        Math.round(((v >> 10) & 31) * 255 / 31),
      ]);
    }
    palettes.push(pal);
  }
  // h[4] is the map's length in bytes, not where it ends: h[3] + h[4], rounded
  // up to 32, lands exactly on h[5] in all 680 entries of this cartridge.
  // Reading it as an end offset cut every map short.
  const mapCount = h[4] / 2;
  const map = [];
  for (let m = 0; m < mapCount; m++) map.push(dv.getUint16(entry.dataOffset + h[3] + m * 2, true));
  const tiles = decompressed.subarray(entry.dataOffset + h[5], entry.dataOffset + h[7]);
  return { header: h, palettes, map, tiles, tileCount: tiles.length / 32 };
}

/** Divisors of the cell count, ordered by how close the result is to 2:1. */
export function widthCandidates(cells) {
  const out = [];
  for (let w = 1; w <= cells; w++) if (cells % w === 0) out.push(w);
  return out.sort((a, b) => Math.abs(a / (cells / a) - 2) - Math.abs(b / (cells / b) - 2));
}

export function renderEntry(img, tilesWide) {
  const tilesHigh = Math.ceil(img.map.length / tilesWide);
  const width = tilesWide * 8, height = tilesHigh * 8;
  const rgba = new Uint8ClampedArray(width * height * 4);
  img.map.forEach((ent, m) => {
    const idx = ent & 0x3ff, hf = (ent >> 10) & 1, vf = (ent >> 11) & 1;
    const pal = img.palettes[(ent >> 12) & 15] ?? img.palettes[0];
    if (idx >= img.tileCount) return;
    const tx = (m % tilesWide) * 8, ty = ((m / tilesWide) | 0) * 8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const sx = hf ? 7 - x : x, sy = vf ? 7 - y : y;
      const i = idx * 64 + sy * 8 + sx;
      const nib = (i & 1) ? (img.tiles[i >> 1] >> 4) & 15 : img.tiles[i >> 1] & 15;
      const o = ((ty + y) * width + tx + x) * 4;
      const [r, g, b] = pal[nib];
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b;
      rgba[o + 3] = nib === 0 ? 0 : 255;   // index 0 is the transparent one on NDS
    }
  });
  return { width, height, rgba };
}

export function openSfp(path) {
  const d = lz77Decompress(readFileSync(path));
  return { data: d, entries: parseSfp(d) };
}
