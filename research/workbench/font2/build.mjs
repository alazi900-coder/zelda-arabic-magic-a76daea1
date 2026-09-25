/**
 * Re-cuts Inazuma's Arabic glyph set from the Mother 3 Arabic font.
 *
 * Mother 3 draws Arabic in a 16x16 cell on a baseline of row 7; Inazuma's
 * FONT12 cell is 11x12. The transplant is a straight copy plus one vertical
 * shift, because the two fonts share a bit depth (1bpp) and the same joining
 * convention (initial/medial carry the connector at column 0, final/medial at
 * the advance's last column).
 *
 * The Inazuma baseline is row 6, not the NFTR header's Latin row 10: Arabic
 * needs five rows of descender for jeem, ain, sad, noon, waw and yeh, and
 * drawing it on the Latin baseline is what broke the set being replaced --
 * noon's bowl had nowhere to go, so it was drawn beside the letter instead of
 * under it. Row 6 was picked by counting clipped ink over every candidate: it
 * loses 14 rows across 13 glyphs, against 45 at row 8 and 131 at row 10.
 */
import { M3_MAP, M3_WIDTHS, m3Px, bounds } from "./lib.mjs";

export const M3_BASE = 7;
export const IZ_BASE = 6;
export const CELL_W = 11, CELL_H = 12;
const SRC = 16;

const blankRow = () => new Array(SRC).fill(false);
const isBlank = (row) => row.every((v) => !v);
const inkCount = (row) => row.reduce((n, v) => n + (v ? 1 : 0), 0);

function m3Grid(code) {
  const g = [];
  for (let y = 0; y < SRC; y++) {
    const row = [];
    for (let x = 0; x < SRC; x++) row.push(!!m3Px(code, x, y));
    g.push(row);
  }
  return g;
}

/**
 * Removes one row from the half of the glyph that overflows, so it loses
 * height without its baseline moving: taking a row from above the baseline
 * leaves everything at or below it untouched, and vice versa.
 *
 * A row that repeats its neighbour goes first. On these glyphs that is always
 * one rung of a straight stroke -- an alef's stem, a dad's tail -- so the
 * letter only gets shorter. The obvious-looking alternative, dropping the row
 * with the least ink, destroys the very marks that have to survive: it eats a
 * step of the hamza's zigzag, and a blank row above the baseline is the gap
 * that holds a hamza or madda clear of the letter under it, so removing that
 * welds the mark onto the body.
 */
function dropRow(grid, base, above, band) {
  const range = [];
  if (above) { for (let y = band.minY; y < base; y++) range.push(y); }
  else { for (let y = base + 1; y <= band.maxY; y++) range.push(y); }
  if (range.length === 0) return null;
  const same = (a, b) => a >= 0 && a < SRC && b >= 0 && b < SRC && grid[a].every((v, x) => v === grid[b][x]);
  const pick =
    range.find((y) => !isBlank(grid[y]) && same(y, y + 1)) ??
    range.find((y) => !isBlank(grid[y]) && same(y, y - 1)) ??
    range.find((y) => isBlank(grid[y])) ??
    range.reduce((best, y) => (inkCount(grid[y]) < inkCount(grid[best]) ? y : best), range[0]);
  const g = grid.map((r) => r.slice());
  g.splice(pick, 1);
  if (above) g.unshift(blankRow()); else g.push(blankRow());
  return g;
}

/** Places one Mother 3 glyph into a cellW x cellH cell whose baseline is izBase. */
export function fitToCell(code, cellW = CELL_W, cellH = CELL_H, izBase = IZ_BASE) {
  let grid = m3Grid(code);
  const notes = [];
  for (let guard = 0; guard < 10; guard++) {
    const b = bounds((x, y) => grid[y][x], SRC, SRC);
    if (b.empty) return null;
    const top = izBase - (M3_BASE - b.minY), bot = izBase + (b.maxY - M3_BASE);
    if (top >= 0 && bot < cellH) {
      const out = [];
      for (let y = 0; y < cellH; y++) {
        const sy = y - izBase + M3_BASE;
        const row = [];
        for (let x = 0; x < cellW; x++) row.push(sy >= 0 && sy < SRC ? grid[sy][x] : false);
        out.push(row);
      }
      return { grid: out, notes };
    }
    const above = top < 0;
    const next = dropRow(grid, M3_BASE, above, b);
    if (!next) return { grid: null, notes: [...notes, above ? "nothing to drop above" : "nothing to drop below"] };
    grid = next;
    notes.push(above ? "dropped a row above the baseline" : "dropped a row below the baseline");
  }
  return { grid: null, notes: [...notes, "did not converge"] };
}

export const m3Width = (code) => M3_WIDTHS[code];
export { M3_MAP };
