/**
 * Turning a drawn glyph into the signed distance field Risen 3 stores.
 *
 * Risen 3's font atlases are not pictures of letters. Each byte says how far
 * that pixel is from the edge of the glyph, so the engine can draw the same
 * texture at any size with a clean outline — which is what the `_sdf` in every
 * font's name means. Writing an ordinary drawing into one of these atlases
 * produces a smear, not a letter.
 *
 * The encoding was read off the shipped `Linux Biolinum O_30`, not assumed:
 *
 *   - 0 is far outside a glyph — 15685 of the 28381 sampled pixels.
 *   - 128 is exactly the edge. Sampling the middle row of `o` gives
 *     0 8 25 42 59 76 94 111 128 144 161 167 150 133 116 99 81 64 81 …, and
 *     the crossings of 128 land on the ring's outer and inner walls.
 *   - Inside, the value keeps climbing to about 173 at the middle of a stroke.
 *
 * The slope differs between glyphs — about 17 a pixel through `o`, 27 through
 * the thin stem of `I` — so the number stored is not a plain pixel distance.
 * What the engine reads is the crossing: the edge is wherever the field passes
 * 128, and the slope only decides how soft that edge looks. So the field here
 * is a true distance scaled by a fixed spread, which puts the crossing in the
 * same place and keeps the softness in the range the shipped glyphs use.
 */

const EDGE = 128;
const INFINITY = 1e20;

/**
 * Pixels a glyph's field reaches beyond its edge.
 *
 * At the default the stem of a small letter reaches roughly the 173 the shipped
 * fonts peak at, and the ramp outside dies within the packer's padding rather
 * than bleeding into the neighbouring cell.
 */
export const RISEN3_SDF_SPREAD = 6;

/**
 * One-dimensional squared distance transform (Felzenszwalb & Huttenlocher).
 *
 * The exact transform rather than a chamfer approximation: an approximate one
 * is off by up to half a pixel, and half a pixel of error moves the 128
 * crossing — which is the letter's outline.
 */
function distance1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INFINITY;
  z[1] = INFINITY;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INFINITY;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Euclidean distance, in pixels, from every pixel to the nearest set pixel. */
function distanceTransform(mask: Uint8Array, width: number, height: number): Float64Array {
  const f = new Float64Array(Math.max(width, height));
  const d = new Float64Array(Math.max(width, height));
  const v = new Int32Array(Math.max(width, height) + 1);
  const z = new Float64Array(Math.max(width, height) + 1);
  const grid = new Float64Array(width * height);
  for (let i = 0; i < grid.length; i++) grid[i] = mask[i] ? 0 : INFINITY;

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x];
    distance1d(f, height, d, v, z);
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = grid[y * width + x];
    distance1d(f, width, d, v, z);
    for (let x = 0; x < width; x++) grid[y * width + x] = Math.sqrt(d[x]);
  }
  return grid;
}

/**
 * Converts a drawn glyph — one byte of coverage a pixel — into the field.
 *
 * `coverage` is what a rasteriser produces: 0 where nothing was drawn, 255
 * where the pixel is fully inside the letter. Anything at or above half is
 * taken as inside, which puts the boundary where the rasteriser's own
 * antialiasing puts it.
 */
export function coverageToSdf(
  coverage: Uint8Array,
  width: number,
  height: number,
  spread: number = RISEN3_SDF_SPREAD
): Uint8Array {
  const inside = new Uint8Array(width * height);
  const outside = new Uint8Array(width * height);
  for (let i = 0; i < inside.length; i++) {
    if (coverage[i] >= 128) inside[i] = 1;
    else outside[i] = 1;
  }
  // Distance to the nearest pixel of the other side: outside a glyph that is
  // the distance to the letter, inside it the distance out of it.
  const toInside = distanceTransform(inside, width, height);
  const toOutside = distanceTransform(outside, width, height);

  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) {
    // Half a pixel either way, so a pixel sitting on the boundary reads as the
    // edge rather than a whole pixel inside it.
    const signed = inside[i] ? toOutside[i] - 0.5 : 0.5 - toInside[i];
    const value = Math.round(EDGE + (signed / spread) * EDGE);
    out[i] = value < 0 ? 0 : value > 255 ? 255 : value;
  }
  return out;
}

/** Where a row of field values crosses the edge — for checking a generated glyph. */
export function sdfEdgeCrossings(row: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 1; i < row.length; i++) {
    const a = row[i - 1];
    const b = row[i];
    if ((a < EDGE && b >= EDGE) || (a >= EDGE && b < EDGE)) {
      out.push(i - 1 + (EDGE - a) / (b - a));
    }
  }
  return out;
}
