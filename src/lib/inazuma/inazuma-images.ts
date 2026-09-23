/**
 * Inazuma Eleven's 2D pictures: finding them in the ROM, drawing them, and
 * writing an edited picture back without disturbing anything around it.
 *
 * Every picture file under `data_iz/pic2d/` and `data_iz/pic3d/` is LZ10
 * compressed. Inside is either an SFP container (a table of named entries) or
 * one bare entry. Each entry starts with eight u32s: a format word (3), then
 * three (offset, size) pairs. Two layouts use them:
 *
 *   tiled   -- palette(s), tile map, 4bpp 8x8 tiles; the way the DS draws a
 *              background. One u16 per map cell: tile index in bits 0-9,
 *              H-flip bit 10, V-flip bit 11, palette in bits 12-15.
 *   linear  -- a 3D-engine texture: 4bpp (16 colours) or 8bpp (256 colours)
 *              pixels row by row, then its palette.
 *
 * Neither layout stores the picture's width. The tiled map is just a count of
 * cells and the texture a count of pixels; the width is one of the divisors.
 * `inazumaImageWidths` lists them and `guessInazumaImageWidth` picks the one
 * whose seams are quietest -- right more often than not, but not always, so
 * the tool lets the translator step through them. A wrong width never harms
 * the ROM: writing back at the same width puts every tile where it came from.
 *
 * Writing never re-lays anything out. A tiled picture keeps every map cell's
 * position, flips and palette; only the tile a cell names can change, and only
 * so that cells that used to share a tile can now differ. That is the fix for
 * the striped menus an earlier builder produced by rewriting whole maps.
 */

import { ndsFileIdByPath, ndsFiles, writeNdsFile } from "@/lib/nds/nds-rom";
import { compressLz10, decompressLz10 } from "@/lib/fireemblem12/nds-lz";

export interface InazumaImageRef {
  /** Unique key: the ROM path, plus `#entry` for an SFP container's entry. */
  id: string;
  romPath: string;
  /** The entry's name inside an SFP container; null for a bare file. */
  entryName: string | null;
  /** Where the entry's bytes start inside the decompressed container. */
  dataOffset: number;
  size: number;
}

export type InazumaImageLayout =
  | {
      kind: "tiled";
      palettes: [number, number, number][][];
      map: number[];
      mapOffset: number;
      tileOffset: number;
      tileCount: number;
    }
  | {
      kind: "linear";
      bpp: 4 | 8;
      palette: [number, number, number][];
      texOffset: number;
      pixels: number;
    };

export interface RenderedImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

const IMAGE_DIRS = ["data_iz/pic2d/", "data_iz/pic3d/"];

function u32(d: Uint8Array, at: number): number {
  return (d[at] | (d[at + 1] << 8) | (d[at + 2] << 16) | (d[at + 3] << 24)) >>> 0;
}

function u16(d: Uint8Array, at: number): number {
  return d[at] | (d[at + 1] << 8);
}

function rgb555(v: number): [number, number, number] {
  return [
    Math.round((v & 31) * 255 / 31),
    Math.round(((v >> 5) & 31) * 255 / 31),
    Math.round(((v >> 10) & 31) * 255 / 31),
  ];
}

/** An SFP container's entries: {name, dataOffset, size}. Throws if it is not one. */
export function parseSfpEntries(d: Uint8Array): { name: string; dataOffset: number; size: number }[] {
  if (d[0] !== 0x53 || d[1] !== 0x46 || d[2] !== 0x50) throw new Error("ليست حاوية SFP");
  const tableOffset = u32(d, 0x0c);
  const tileDataOffset = u32(d, 0x10);
  // The table's length is stored nowhere: it runs up to the name table, which
  // starts where entry 0's name does.
  const out: { name: string; dataOffset: number; size: number }[] = [];
  let tableEnd: number | null = null;
  for (let i = 0; ; i++) {
    const base = tableOffset + i * 16;
    if (tableEnd !== null ? base >= tableEnd : base + 16 > tileDataOffset) break;
    const nameOff = u32(d, base);
    const size = u32(d, base + 4);
    if (size === 0 || nameOff < tableOffset || nameOff >= d.length) break;
    if (i === 0) tableEnd = nameOff;
    let end = nameOff;
    while (end < d.length && d[end] !== 0) end++;
    let name = "";
    for (let k = nameOff; k < end; k++) name += String.fromCharCode(d[k]);
    out.push({ name, dataOffset: tileDataOffset + u32(d, base + 8) * 32, size });
  }
  return out;
}

/**
 * Every picture file in the ROM, unpacked, keyed by path. Reads the name
 * table and FAT once -- looking each file up on its own re-walks both, and a
 * thousand lookups made opening the ROM take minutes in the browser.
 */
export function readInazumaContainers(rom: Uint8Array): Map<string, Uint8Array> {
  const files = ndsFiles(rom);
  const out = new Map<string, Uint8Array>();
  for (const [path, id] of ndsFileIdByPath(rom)) {
    if (!IMAGE_DIRS.some((dir) => path.startsWith(dir))) continue;
    const f = files[id];
    if (!f) continue;
    const raw = rom.subarray(f.start, f.end);
    if (raw[0] !== 0x10) continue;
    try {
      out.set(path, decompressLz10(raw));
    } catch { /* not a picture file this tool reads */ }
  }
  return out;
}

/** The pictures one unpacked file holds: each entry of an SFP, or the file itself. */
export function inazumaContainerImages(romPath: string, d: Uint8Array): InazumaImageRef[] {
  let entries: { name: string | null; dataOffset: number; size: number }[];
  try {
    entries = parseSfpEntries(d);
  } catch {
    entries = [{ name: null, dataOffset: 0, size: d.length }];
  }
  return entries
    .filter((e) => e.size >= 32 && e.dataOffset + e.size <= d.length && u32(d, e.dataOffset) === 3)
    .map((e) => ({
      id: e.name ? `${romPath}#${e.name}` : romPath,
      romPath,
      entryName: e.name,
      dataOffset: e.dataOffset,
      size: e.size,
    }));
}

/** How the entry's bytes are laid out, or null for a layout this tool cannot draw. */
export function parseInazumaImage(d: Uint8Array, ref: InazumaImageRef): InazumaImageLayout | null {
  const o = ref.dataOffset;
  const h: number[] = [];
  for (let k = 0; k < 8; k++) h.push(u32(d, o + k * 4));
  if (h[0] !== 3 || h[3] !== h[1] + h[2]) return null;

  // Tiled: palettes (one or more blocks of 16 colours), a map whose every
  // cell names a tile that exists, then the tiles. The last pair is the tile
  // area's offset and byte size (h[7] is where its last tile starts).
  if (h[2] % 32 === 0 && h[2] > 0 && h[2] <= 512 && h[4] % 2 === 0 && h[4] > 0 && h[5] >= h[3] + h[4] && h[6] % 32 === 0 && h[6] > 0 && h[5] + h[6] <= ref.size) {
    const tileCount = h[6] / 32;
    const map: number[] = [];
    let valid = true;
    for (let m = 0; valid && m < h[4] / 2; m++) {
      const v = u16(d, o + h[3] + m * 2);
      if ((v & 0x3ff) >= tileCount) valid = false;
      map.push(v);
    }
    if (valid) {
      const palettes: [number, number, number][][] = [];
      for (let p = 0; p < h[2] / 32; p++) {
        const pal: [number, number, number][] = [];
        for (let i = 0; i < 16; i++) pal.push(rgb555(u16(d, o + h[1] + p * 32 + i * 2)));
        palettes.push(pal);
      }
      return { kind: "tiled", palettes, map, mapOffset: o + h[3], tileOffset: o + h[5], tileCount };
    }
  }

  // Linear texture: the pixels, then a palette of up to 16 colours (4bpp) or
  // up to 256 (8bpp). A palette may be stored short of its full size.
  if (h[4] > 8 && h[4] <= 512 && h[4] % 2 === 0 && h[2] > 0 && h[3] + h[4] <= ref.size) {
    const bpp = h[4] <= 32 ? 4 : 8;
    const palette: [number, number, number][] = [];
    for (let i = 0; i < h[4] / 2; i++) palette.push(rgb555(u16(d, o + h[3] + i * 2)));
    return { kind: "linear", bpp, palette, texOffset: o + h[1], pixels: (h[2] * 8) / bpp };
  }
  return null;
}

/** Every width (in pixels) the picture can be laid out at, narrowest first. */
export function inazumaImageWidths(img: InazumaImageLayout): number[] {
  const out: number[] = [];
  if (img.kind === "tiled") {
    const cells = img.map.length;
    for (let w = 1; w <= cells && w * 8 <= 1024; w++) if (cells % w === 0) out.push(w * 8);
  } else {
    for (let w = 8; w <= 1024 && w <= img.pixels; w *= 2) if (img.pixels % w === 0) out.push(w);
  }
  return out.length ? out : [img.kind === "tiled" ? img.map.length * 8 : img.pixels];
}

export function renderInazumaImage(d: Uint8Array, img: InazumaImageLayout, width: number): RenderedImage {
  if (img.kind === "linear") {
    const height = Math.ceil(img.pixels / width);
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < img.pixels; i++) {
      const n = img.bpp === 8
        ? d[img.texOffset + i]
        : (i & 1 ? d[img.texOffset + (i >> 1)] >> 4 : d[img.texOffset + (i >> 1)] & 15);
      const [r, g, b] = img.palette[n] ?? [0, 0, 0];
      rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b;
      rgba[i * 4 + 3] = n === 0 ? 0 : 255;
    }
    return { width, height, rgba };
  }

  const tilesWide = width / 8;
  const height = Math.ceil(img.map.length / tilesWide) * 8;
  const rgba = new Uint8ClampedArray(width * height * 4);
  img.map.forEach((ent, m) => {
    const idx = ent & 0x3ff, hf = (ent >> 10) & 1, vf = (ent >> 11) & 1;
    const pal = img.palettes[(ent >> 12) & 15] ?? img.palettes[0];
    if (idx >= img.tileCount) return;
    const tx = (m % tilesWide) * 8, ty = Math.floor(m / tilesWide) * 8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const i = idx * 64 + (vf ? 7 - y : y) * 8 + (hf ? 7 - x : x);
      const byte = d[img.tileOffset + (i >> 1)];
      const n = i & 1 ? byte >> 4 : byte & 15;
      const o = ((ty + y) * width + tx + x) * 4;
      const [r, g, b] = pal[n];
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b;
      rgba[o + 3] = n === 0 ? 0 : 255;   // colour 0 is the transparent one on the DS
    }
  });
  return { width, height, rgba };
}

/**
 * How badly a layout's joins disagree. A picture is continuous, so at the
 * right width the pixels either side of a tile edge (or, for a texture, of a
 * row break) look alike; at a wrong width they are pieces that never touched.
 */
function seamScore(r: RenderedImage, tiled: boolean): number {
  const { width, height, rgba } = r;
  const at = (x: number, y: number) => {
    const o = (y * width + x) * 4;
    return rgba[o + 3] ? (rgba[o] + rgba[o + 1] + rgba[o + 2]) / 3 : -1;
  };
  const diff = (a: number, b: number) => ((a < 0) !== (b < 0) ? 255 : Math.abs(a - b));
  let seam = 0, inner = 0, n = 0, m = 0;
  for (let x = 0; x < width; x++) for (let y = 1; y < height; y++) {
    const d = diff(at(x, y - 1), at(x, y));
    if (!tiled || y % 8 === 0) { seam += d; n++; } else { inner += d; m++; }
  }
  if (tiled) {
    for (let y = 0; y < height; y++) for (let x = 1; x < width; x++) {
      const d = diff(at(x - 1, y), at(x, y));
      if (x % 8 === 0) { seam += d; n++; } else { inner += d; m++; }
    }
    return (n ? seam / n : 0) / Math.max(m ? inner / m : 1, 1e-6);
  }
  return n ? seam / n : 0;
}

/** The width whose layout joins up best, among shapes a DS screen could show. */
export function guessInazumaImageWidth(d: Uint8Array, img: InazumaImageLayout): number {
  const all = inazumaImageWidths(img);
  const total = img.kind === "tiled" ? img.map.length * 64 : img.pixels;
  // A 16-pixel ribbon 2,000 tall is arithmetic, not a picture.
  let cands = all.filter((w) => w >= 16 && w <= 512 && total / w <= 512);
  if (!cands.length) cands = all;
  let best = cands[0], bestScore = Infinity;
  for (const w of cands) {
    const s = seamScore(renderInazumaImage(d, img, w), img.kind === "tiled");
    if (s < bestScore) { bestScore = s; best = w; }
  }
  return best;
}

/** The colour index for one pixel: 0 for transparent, else the nearest opaque colour. */
function nearest(pal: [number, number, number][], r: number, g: number, b: number, a: number): number {
  if (a < 128) return 0;
  let best = 1, bd = Infinity;
  for (let i = 1; i < pal.length; i++) {
    const dist = (pal[i][0] - r) ** 2 + (pal[i][1] - g) ** 2 + (pal[i][2] - b) ** 2;
    if (dist < bd) { bd = dist; best = i; }
  }
  return best;
}

export interface EncodeResult {
  /** Distinct 8x8 squares that had to share a slot because the tile area was full. */
  merged: number;
}

/**
 * Writes `rgba` (laid out at `width`, the width it was drawn on) into the
 * entry in place. The entry keeps its exact size, so nothing else moves.
 */
export function encodeInazumaImage(
  d: Uint8Array,
  img: InazumaImageLayout,
  width: number,
  rgba: Uint8ClampedArray | Uint8Array,
): EncodeResult {
  if (img.kind === "linear") {
    for (let i = 0; i < img.pixels; i++) {
      const n = nearest(img.palette, rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], rgba[i * 4 + 3]);
      if (img.bpp === 8) d[img.texOffset + i] = n;
      else {
        const at = img.texOffset + (i >> 1);
        d[at] = i & 1 ? (d[at] & 0x0f) | (n << 4) : (d[at] & 0xf0) | n;
      }
    }
    return { merged: 0 };
  }

  const tilesWide = width / 8;
  /** The 64 colour indices this cell needs its tile to hold, its flips undone. */
  const wanted = (m: number, ent: number): Uint8Array => {
    const hf = (ent >> 10) & 1, vf = (ent >> 11) & 1;
    const pal = img.palettes[(ent >> 12) & 15] ?? img.palettes[0];
    const px = (m % tilesWide) * 8, py = Math.floor(m / tilesWide) * 8;
    const cell = new Uint8Array(64);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const o = ((py + y) * width + px + x) * 4;
      cell[(vf ? 7 - y : y) * 8 + (hf ? 7 - x : x)] = nearest(pal, rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]);
    }
    return cell;
  };

  interface Content { cell: Uint8Array; cells: number[]; votes: Map<number, number>; slot?: number }
  const contents = new Map<string, Content>();
  img.map.forEach((ent, m) => {
    const t = ent & 0x3ff;
    if (t >= img.tileCount) return;
    const cell = wanted(m, ent);
    const key = cell.join(",");
    let c = contents.get(key);
    if (!c) { c = { cell, cells: [], votes: new Map() }; contents.set(key, c); }
    c.cells.push(m);
    c.votes.set(t, (c.votes.get(t) ?? 0) + 1);
  });

  // More distinct squares than slots: merge the closest pair, repeatedly.
  // Never drop the rarest -- the rarest squares are the letters.
  let list = [...contents.values()];
  const dist = (a: Uint8Array, b: Uint8Array) => { let n = 0; for (let i = 0; i < 64; i++) if (a[i] !== b[i]) n++; return n; };
  let merged = 0;
  if (list.length > img.tileCount) {
    const alive = list.map(() => true);
    const D = list.map((a, i) => list.map((b, j) => (j <= i ? Infinity : dist(a.cell, b.cell))));
    let n = list.length;
    while (n > img.tileCount) {
      let bi = -1, bj = -1, best = Infinity;
      for (let i = 0; i < list.length; i++) {
        if (!alive[i]) continue;
        for (let j = i + 1; j < list.length; j++) {
          if (alive[j] && D[i][j] < best) { best = D[i][j]; bi = i; bj = j; }
        }
      }
      if (bi < 0) break;
      if (list[bj].cells.length > list[bi].cells.length) [bi, bj] = [bj, bi];
      list[bi].cells.push(...list[bj].cells);
      alive[bj] = false; n--; merged++;
      for (let k = 0; k < list.length; k++) {
        if (!alive[k] || k === bi) continue;
        const dd = dist(list[bi].cell, list[k].cell);
        if (k < bi) D[k][bi] = dd; else D[bi][k] = dd;
      }
    }
    list = list.filter((_, i) => alive[i]);
    for (const c of list) {
      c.votes = new Map();
      for (const m of c.cells) { const t = img.map[m] & 0x3ff; c.votes.set(t, (c.votes.get(t) ?? 0) + 1); }
    }
  }

  // Each square gets a slot, preferring one its own cells already name, so
  // the map changes as little as possible.
  const free = new Set<number>();
  for (let t = 0; t < img.tileCount; t++) free.add(t);
  for (const c of list) {
    let slot = -1, votes = 0;
    for (const [t, v] of c.votes) if (free.has(t) && v > votes) { votes = v; slot = t; }
    if (slot < 0) slot = free.values().next().value as number;
    free.delete(slot);
    c.slot = slot;
    const at = img.tileOffset + slot * 32;
    for (let i = 0; i < 64; i += 2) d[at + i / 2] = c.cell[i] | (c.cell[i + 1] << 4);
  }
  for (const c of list) {
    for (const m of c.cells) {
      const ent = img.map[m];
      const next = (ent & ~0x3ff) | (c.slot as number);
      img.map[m] = next;
      d[img.mapOffset + m * 2] = next & 0xff;
      d[img.mapOffset + m * 2 + 1] = next >> 8;
    }
  }
  return { merged };
}

/**
 * Checks that an edited picture file is still encoded exactly as the game
 * wrote it, and throws naming the first picture that is not.
 *
 * Same length and the same entry table; outside the pictures, not one byte
 * different. Inside an edited picture: the same header, the same palette,
 * the same layout and colour depth, and every map cell keeping its flips and
 * palette -- only which tile a cell names, and the pixels, may change.
 */
export function verifyInazumaContainer(romPath: string, original: Uint8Array, edited: Uint8Array): void {
  const fail = (what: string): never => { throw new Error(`${romPath}: ${what} — أُوقف البناء حتى لا يُكتب ملف تالف`); };
  if (original.length !== edited.length) fail("تغيّر حجم الملف");
  const refs = inazumaContainerImages(romPath, original);
  const refs2 = inazumaContainerImages(romPath, edited);
  if (refs.length !== refs2.length || refs.some((r, i) => r.dataOffset !== refs2[i].dataOffset || r.size !== refs2[i].size)) fail("تغيّر جدول الصور");
  const inside = new Uint8Array(original.length);
  for (const r of refs) inside.fill(1, r.dataOffset, r.dataOffset + r.size);
  for (let i = 0; i < original.length; i++) if (!inside[i] && original[i] !== edited[i]) fail("تغيّر بايت خارج الصور");

  for (const r of refs) {
    const name = r.entryName ?? romPath;
    let same = true;
    for (let i = r.dataOffset; i < r.dataOffset + r.size; i++) if (original[i] !== edited[i]) { same = false; break; }
    if (same) continue;
    for (let i = r.dataOffset; i < r.dataOffset + 32; i++) if (original[i] !== edited[i]) fail(`${name}: تغيّرت ترويسة الصورة`);
    const a = parseInazumaImage(original, r), b = parseInazumaImage(edited, r);
    if (!a || !b || a.kind !== b.kind) return fail(`${name}: تغيّر نوع الصورة`);
    // Which bytes may change: the tiles and the map (tiled), or the pixels (texture).
    const allowed = new Uint8Array(original.length);
    if (a.kind === "tiled" && b.kind === "tiled") {
      if (a.map.length !== b.map.length || a.tileCount !== b.tileCount || a.palettes.length !== b.palettes.length) fail(`${name}: تغيّرت أبعاد الصورة`);
      for (let m = 0; m < a.map.length; m++) if ((a.map[m] & 0xfc00) !== (b.map[m] & 0xfc00)) fail(`${name}: تغيّر قلب أو لوحة خلية في الخريطة`);
      allowed.fill(1, a.mapOffset, a.mapOffset + a.map.length * 2);
      allowed.fill(1, a.tileOffset, a.tileOffset + a.tileCount * 32);
    } else if (a.kind === "linear" && b.kind === "linear") {
      if (a.bpp !== b.bpp || a.pixels !== b.pixels) fail(`${name}: تغيّر عمق الألوان`);
      allowed.fill(1, a.texOffset, a.texOffset + (a.pixels * a.bpp) / 8);
    }
    for (let i = r.dataOffset; i < r.dataOffset + r.size; i++) {
      if (!allowed[i] && original[i] !== edited[i]) fail(`${name}: تغيّرت لوحة الألوان أو جزء آخر غير الرسم`);
    }
  }
}

/**
 * A copy of the ROM with every edited picture file packed back in. Each file
 * is checked against the ROM's own copy (see verifyInazumaContainer), packed
 * with the same LZ10 compression the game uses, and unpacked again to prove
 * the packing before it is written.
 */
export function buildInazumaImagesRom(rom: Uint8Array, edited: Map<string, Uint8Array>): Uint8Array {
  let out = rom;
  const ids = ndsFileIdByPath(rom);
  const files = ndsFiles(rom);
  for (const [romPath, data] of edited) {
    const id = ids.get(romPath);
    const f = id === undefined ? undefined : ndsFiles(out)[id];
    if (!f || id === undefined) throw new Error(`الملف ${romPath} غير موجود في الروم`);
    const raw = rom.subarray(files[id].start, files[id].end);
    if (raw[0] !== 0x10) throw new Error(`${romPath}: الملف الأصلي ليس بضغط LZ10`);
    verifyInazumaContainer(romPath, decompressLz10(raw), data);
    const packed = compressLz10(data);
    const back = decompressLz10(packed);
    if (back.length !== data.length || back.some((b, i) => b !== data[i])) {
      throw new Error(`فشل التحقق من ضغط ${romPath}`);
    }
    const padded = new Uint8Array(Math.ceil(packed.length / 4) * 4);
    padded.set(packed);
    out = writeNdsFile(out, f, padded);
  }
  return out;
}

type Rgba = Uint8ClampedArray | Uint8Array;
const SAME_COLOUR = 40 * 40 * 3;

/** The colour most of an area's edge is, or "transparent"; null if the edge has no majority. */
function edgeColour(rgba: Rgba, width: number, x0: number, y0: number, w: number, h: number): [number, number, number] | "transparent" | null {
  const counts = new Map<string, number>();
  let total = 0;
  const add = (x: number, y: number) => {
    const o = ((y0 + y) * width + x0 + x) * 4;
    const key = rgba[o + 3] < 128 ? "t" : `${rgba[o] >> 4},${rgba[o + 1] >> 4},${rgba[o + 2] >> 4}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total++;
  };
  for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { add(0, y); add(w - 1, y); }
  let best = "", n = 0;
  for (const [k, v] of counts) if (v > n) { n = v; best = k; }
  if (n < total * 0.5) return null;
  if (best === "t") return "transparent";
  const [r, g, b] = best.split(",").map((v) => Number(v) * 16 + 8);
  return [r, g, b];
}

function isColour(rgba: Rgba, o: number, c: [number, number, number] | "transparent"): boolean {
  if (c === "transparent") return rgba[o + 3] < 128;
  if (rgba[o + 3] < 128) return false;
  return (rgba[o] - c[0]) ** 2 + (rgba[o + 1] - c[1]) ** 2 + (rgba[o + 2] - c[2]) ** 2 <= SAME_COLOUR;
}

/**
 * A replacement drawn on a background of its own (black, white, any flat
 * colour, or transparent where the original was not) gets the original's
 * background back: every pixel of that colour takes the original pixel.
 *
 * Only when the new picture's edge mostly differs from the original's -- a
 * PNG that was exported from here and painted on keeps the original edge, and
 * is left alone, so a fill the translator painted over English text is not
 * mistaken for background and turned back into the English.
 * Returns how many pixels were restored.
 */
export function restoreOriginalBackground(next: Rgba, original: Rgba, width: number, height: number): number {
  if (width < 2 || height < 2) return 0;
  const bg = edgeColour(next, width, 0, 0, width, height);
  if (!bg) return 0;
  let edge = 0, differ = 0;
  const check = (x: number, y: number) => {
    const o = (y * width + x) * 4;
    edge++;
    const clearNext = next[o + 3] < 128, clearOriginal = original[o + 3] < 128;
    if (clearNext !== clearOriginal) differ++;
    else if (!clearNext && (next[o] - original[o]) ** 2 + (next[o + 1] - original[o + 1]) ** 2 + (next[o + 2] - original[o + 2]) ** 2 > SAME_COLOUR) differ++;
  };
  for (let x = 0; x < width; x++) { check(x, 0); check(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { check(0, y); check(width - 1, y); }
  if (differ < edge * 0.5) return 0;
  let restored = 0;
  for (let o = 0; o < next.length; o += 4) {
    if (!isColour(next, o, bg)) continue;
    next[o] = original[o]; next[o + 1] = original[o + 1]; next[o + 2] = original[o + 2]; next[o + 3] = original[o + 3];
    restored++;
  }
  return restored;
}

/**
 * For a word pasted into a region: which of the overlay's pixels are its own
 * background (its edge colour, or transparent). Those keep the picture
 * underneath, so a word drawn on black or white lands on the button as if
 * cut out. `overlay` is already scaled to the region.
 */
export function overlayBackgroundMask(overlay: Rgba, w: number, h: number, sourceEdge: [number, number, number] | "transparent" | null): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (overlay[o + 3] < 128 || (sourceEdge && sourceEdge !== "transparent" && isColour(overlay, o, sourceEdge))) mask[i] = 1;
  }
  return mask;
}

/** The overlay image's own background colour, read from its unscaled edge. */
export function overlayEdgeColour(rgba: Rgba, width: number, height: number): [number, number, number] | "transparent" | null {
  return width >= 2 && height >= 2 ? edgeColour(rgba, width, 0, 0, width, height) : null;
}

export interface InazumaImageSection {
  id: string;
  label: string;
  emoji: string;
  note?: string;
  group: "localization" | "other";
}

const SECTIONS: { prefix: string; section: InazumaImageSection }[] = [
  { prefix: "data_iz/pic2d/menu/", section: { id: "menu", label: "القوائم", emoji: "📋", note: "أزرار وعناوين القوائم والإحصائيات", group: "localization" } },
  { prefix: "data_iz/pic2d/title/", section: { id: "title", label: "شاشة العنوان", emoji: "🏁", group: "localization" } },
  { prefix: "data_iz/pic2d/en/", section: { id: "ui", label: "واجهات المباراة والخريطة", emoji: "⚽", group: "localization" } },
  { prefix: "data_iz/pic3d/en/", section: { id: "tex-en", label: "صور ثلاثية الأبعاد (أسماء ولافتات)", emoji: "✨", group: "localization" } },
  { prefix: "data_iz/pic3d/script/", section: { id: "script", label: "صور المشاهد", emoji: "🎭", group: "localization" } },
  { prefix: "data_iz/pic2d/ending/", section: { id: "ending", label: "النهاية", emoji: "🎬", group: "localization" } },
  { prefix: "data_iz/pic2d/team/", section: { id: "team", label: "الفرق", emoji: "🛡️", group: "other" } },
  { prefix: "data_iz/pic2d/", section: { id: "pic2d-other", label: "صور ثنائية أخرى", emoji: "🗂️", group: "other" } },
  { prefix: "data_iz/pic3d/", section: { id: "pic3d-other", label: "صور ثلاثية أخرى", emoji: "🗂️", group: "other" } },
];

export function classifyInazumaImage(romPath: string): InazumaImageSection {
  return (SECTIONS.find((s) => romPath.startsWith(s.prefix)) ?? SECTIONS[SECTIONS.length - 1]).section;
}

export function buildInazumaImageSections(refs: InazumaImageRef[]): { localization: (InazumaImageSection & { count: number })[]; other: (InazumaImageSection & { count: number })[] } {
  const counts = new Map<string, number>();
  for (const r of refs) {
    const id = classifyInazumaImage(r.romPath).id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const seen = new Set<string>();
  const all = SECTIONS.map((s) => s.section)
    .filter((s) => { if (seen.has(s.id) || !counts.get(s.id)) return false; seen.add(s.id); return true; })
    .map((s) => ({ ...s, count: counts.get(s.id) ?? 0 }));
  return { localization: all.filter((s) => s.group === "localization"), other: all.filter((s) => s.group === "other") };
}
