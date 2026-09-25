/**
 * Picks an entry's width by measuring, since the file does not store one.
 *
 * A picture is continuous: the right-hand column of a cell usually resembles
 * the left-hand column of the cell beside it, and the bottom row of a cell the
 * top row of the cell below. Laid out at the wrong width those neighbours are
 * pieces that never touched, and the seams light up. So every divisor of the
 * cell count is scored by how much its seams disagree, and the quietest wins.
 */
import { renderEntry, widthCandidates } from "./l5img.mjs";

export function scoreWidth(img, tilesWide) {
  const r = renderEntry(img, tilesWide);
  const { width, height, rgba } = r;
  const at = (x, y) => { const o = (y * width + x) * 4; return rgba[o + 3] ? (rgba[o] + rgba[o + 1] + rgba[o + 2]) / 3 : -1; };
  let seam = 0, inner = 0, n = 0, m = 0;
  for (let y = 0; y < height; y++) for (let x = 1; x < width; x++) {
    const a = at(x - 1, y), b = at(x, y);
    const d = (a < 0) !== (b < 0) ? 255 : Math.abs(a - b);
    if (x % 8 === 0) { seam += d; n++; } else { inner += d; m++; }
  }
  for (let x = 0; x < width; x++) for (let y = 1; y < height; y++) {
    const a = at(x, y - 1), b = at(x, y);
    const d = (a < 0) !== (b < 0) ? 255 : Math.abs(a - b);
    if (y % 8 === 0) { seam += d; n++; } else { inner += d; m++; }
  }
  // A seam that is no rougher than the inside of a tile is a seam that was
  // never cut; normalising by the inside keeps busy pictures comparable to calm.
  const s = n ? seam / n : 0, i = m ? inner / m : 1;
  return s / Math.max(i, 1e-6);
}

export function bestWidth(img) {
  const cells = img.map.length;
  // A DS screen is 256x192, and nothing here is drawn far past that, so a
  // candidate that makes the picture a 32-pixel ribbon 1472 tall is not a
  // candidate -- it is the arithmetic working and the shape being absurd.
  const fits = (w) => w * 8 <= 512 && (cells / w) * 8 <= 512;
  let cands = widthCandidates(cells).filter((w) => w >= 2 && fits(w));
  if (!cands.length) cands = widthCandidates(cells).filter((w) => w >= 2);
  let best = cands[0], bestScore = Infinity;
  for (const w of cands) {
    const s = scoreWidth(img, w);
    if (s < bestScore) { bestScore = s; best = w; }
  }
  return { width: best, score: bestScore };
}
