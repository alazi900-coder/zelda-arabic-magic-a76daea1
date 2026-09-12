/**
 * Phantom Hourglass title-screen logo — a 256×128 3D texture, not a sprite.
 *
 * `English/Menu/Tex2D/title.bin` is LZ10-compressed and, once decompressed,
 * a NARC holding exactly two members named "title.ntfp" (an 8bpp palette,
 * RGB555 entries) and "title.ntft" (one palette index per pixel, row-major).
 * Verified against the real file this session: index 0 decodes to pure
 * black and covers the whole area outside the logo's silhouette, which is
 * why it's treated as the transparent slot here rather than a real color —
 * the game's texture parameters mark color 0 transparent for this asset,
 * and encoding anything else into that slot would show as a black box
 * instead of a see-through background.
 */
import { compressLz10, decompressLz10 } from "@/lib/fireemblem12/nds-lz";
import { parseNarc, buildNarc, type Narc } from "@/lib/nds/narc";

export const TITLE_TEXTURE_WIDTH = 256;
export const TITLE_TEXTURE_HEIGHT = 128;
const MAX_COLORS = 255; // index 0 is reserved for transparent

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA, top-to-bottom row-major, length === width*height*4 */
  data: Uint8ClampedArray;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function rgb888to555(c: Rgb): number {
  const r = Math.round((c.r / 255) * 31);
  const g = Math.round((c.g / 255) * 31);
  const b = Math.round((c.b / 255) * 31);
  return (r & 0x1f) | ((g & 0x1f) << 5) | ((b & 0x1f) << 10);
}

function rgb555to888(v: number): Rgb {
  const r = (v & 0x1f) * 255 / 31;
  const g = ((v >> 5) & 0x1f) * 255 / 31;
  const b = ((v >> 10) & 0x1f) * 255 / 31;
  return { r, g, b };
}

/** Median-cut quantizer: splits the opaque pixels into up to `maxColors`
 * boxes by the longest channel, each box's mean becoming one palette entry.
 * Good enough for flat/gradient logo art — this isn't photographic content. */
function quantize(pixels: Rgb[], maxColors: number): Rgb[] {
  if (pixels.length === 0) return [];
  type Box = { pixels: Rgb[] };
  const boxRange = (box: Box) => {
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
    for (const p of box.pixels) {
      if (p.r < rMin) rMin = p.r; if (p.r > rMax) rMax = p.r;
      if (p.g < gMin) gMin = p.g; if (p.g > gMax) gMax = p.g;
      if (p.b < bMin) bMin = p.b; if (p.b > bMax) bMax = p.b;
    }
    const rw = rMax - rMin, gw = gMax - gMin, bw = bMax - bMin;
    const widest = Math.max(rw, gw, bw);
    const axis: keyof Rgb = widest === rw ? "r" : widest === gw ? "g" : "b";
    return { widest, axis };
  };

  const boxes: Box[] = [{ pixels }];
  while (boxes.length < maxColors) {
    let splitIdx = -1;
    let splitWidest = -1;
    let splitAxis: keyof Rgb = "r";
    boxes.forEach((box, i) => {
      if (box.pixels.length < 2) return;
      const { widest, axis } = boxRange(box);
      if (widest > splitWidest) {
        splitWidest = widest;
        splitIdx = i;
        splitAxis = axis;
      }
    });
    if (splitIdx < 0 || splitWidest === 0) break;
    const box = boxes[splitIdx];
    const sorted = [...box.pixels].sort((a, b) => a[splitAxis] - b[splitAxis]);
    const mid = Math.floor(sorted.length / 2);
    boxes.splice(splitIdx, 1, { pixels: sorted.slice(0, mid) }, { pixels: sorted.slice(mid) });
  }

  return boxes.map((box) => {
    let r = 0, g = 0, b = 0;
    for (const p of box.pixels) { r += p.r; g += p.g; b += p.b; }
    const n = box.pixels.length;
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  });
}

function nearestIndex(c: Rgb, palette: Rgb[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const dr = c.r - p.r, dg = c.g - p.g, db = c.b - p.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}

export interface EncodedTitleTexture {
  ntfp: Uint8Array;
  ntft: Uint8Array;
  /** how many distinct opaque colors the source actually had, before capping at 255 */
  sourceColorCount: number;
}

/** `alphaThreshold`: source pixels with alpha at or below this become the
 * transparent index-0 slot; everything else is quantized into up to 255
 * opaque colors. Default 8 treats only near-fully-transparent pixels as
 * background, since a real photo/logo edit rarely has exact alpha=0. */
export function encodeTitleTexture(img: RgbaImage, alphaThreshold = 8): EncodedTitleTexture {
  if (img.width !== TITLE_TEXTURE_WIDTH || img.height !== TITLE_TEXTURE_HEIGHT) {
    throw new Error(
      `مقاس الشعار يجب أن يكون ${TITLE_TEXTURE_WIDTH}×${TITLE_TEXTURE_HEIGHT} (وصل ${img.width}×${img.height})`
    );
  }
  const n = img.width * img.height;
  const isTransparent = new Uint8Array(n);
  const opaquePixels: Rgb[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) {
    const a = img.data[i * 4 + 3];
    if (a <= alphaThreshold) {
      isTransparent[i] = 1;
      continue;
    }
    const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
    opaquePixels.push({ r, g, b });
    seen.add((r << 16) | (g << 8) | b);
  }

  const palette = quantize(opaquePixels, MAX_COLORS);
  // palette[0] is reserved for transparent (color value doesn't matter — the
  // game never draws it — but black matches the original file's own slot 0).
  const ntfp = new Uint8Array((palette.length + 1) * 2);
  ntfp[0] = 0; ntfp[1] = 0;
  palette.forEach((c, i) => {
    const v = rgb888to555(c);
    ntfp[(i + 1) * 2] = v & 0xff;
    ntfp[(i + 1) * 2 + 1] = (v >> 8) & 0xff;
  });

  const ntft = new Uint8Array(n);
  let opaqueCursor = 0;
  const paletteCache = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    if (isTransparent[i]) { ntft[i] = 0; continue; }
    const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
    const key = (r << 16) | (g << 8) | b;
    let idx = paletteCache.get(key);
    if (idx === undefined) {
      idx = nearestIndex({ r, g, b }, palette) + 1; // +1: slot 0 is transparent
      paletteCache.set(key, idx);
    }
    ntft[i] = idx;
    opaqueCursor++;
  }
  void opaqueCursor;

  return { ntfp, ntft, sourceColorCount: seen.size };
}

/** Decodes an existing title.bin (LZ10 + NARC) back to RGBA pixels, for
 * showing the current/original logo as a reference next to the new one. */
export function decodeTitleTexture(titleBinBytes: Uint8Array): RgbaImage {
  const narc = parseNarc(decompressLz10(titleBinBytes));
  const [ntfp, ntft] = narc.files;
  const palette: Rgb[] = [];
  for (let i = 0; i * 2 < ntfp.length; i++) {
    palette.push(rgb555to888(ntfp[i * 2] | (ntfp[i * 2 + 1] << 8)));
  }
  const w = TITLE_TEXTURE_WIDTH, h = TITLE_TEXTURE_HEIGHT;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const idx = ntft[i];
    const c = palette[idx] ?? { r: 255, g: 0, b: 255 };
    data[i * 4] = c.r; data[i * 4 + 1] = c.g; data[i * 4 + 2] = c.b;
    data[i * 4 + 3] = idx === 0 ? 0 : 255;
  }
  return { width: w, height: h, data };
}

/** Repacks an encoded texture into the exact NARC layout the original
 * title.bin uses (same "title.ntfp"/"title.ntft" filename table, taken
 * from `sourceTitleBin`), then LZ10-compresses it the way the game expects. */
export function buildTitleBin(encoded: EncodedTitleTexture, sourceTitleBin: Uint8Array): Uint8Array {
  const sourceNarc = parseNarc(decompressLz10(sourceTitleBin));
  const narc: Narc = { files: [encoded.ntfp, encoded.ntft], btnf: sourceNarc.btnf };
  return compressLz10(buildNarc(narc));
}
