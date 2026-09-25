import { IZ_CPS } from "./lib.mjs";
import { assemble } from "./assemble.mjs";

/** Packs a cellW x cellH boolean grid MSB-first, bits running on without padding. */
function pack(grid, cellW, cellH, tileBytes) {
  const out = Buffer.alloc(tileBytes);
  for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) {
    if (!grid[y][x]) continue;
    const b = y * cellW + x;
    out[b >> 3] |= 0x80 >> (b & 7);
  }
  return out;
}

/** 11x12 -> 7x8: drop the row and column that repeat a neighbour, innermost first. */
function shrink(grid, w) {
  let rows = grid.map((r) => r.slice(0, w));
  const dropRow = () => {
    const dup = rows.findIndex((r, i) => i > 0 && r.every((v, x) => v === rows[i - 1][x]));
    rows.splice(dup >= 0 ? dup : rows.findIndex((r) => r.every((v) => !v)), 1);
  };
  const dropCol = () => {
    const width = rows[0].length;
    let pick = -1;
    for (let x = 1; x < width && pick < 0; x++) if (rows.every((r) => r[x] === r[x - 1])) pick = x;
    if (pick < 0) for (let x = 0; x < width && pick < 0; x++) if (rows.every((r) => !r[x])) pick = x;
    if (pick < 0) pick = width - 1;
    rows = rows.map((r) => r.filter((_, x) => x !== pick));
  };
  while (rows.length > 8) dropRow();
  while (rows[0].length > 7) dropCol();
  const outW = rows[0].length;
  const out = rows.map((r) => { const p = r.slice(); while (p.length < 7) p.push(false); return p; });
  return { grid: out, w: outW };
}

const glyphs = assemble();
const f12 = Buffer.concat(glyphs.map((g) => pack(g.grid, 11, 12, 17)));
const w12 = glyphs.map((g) => g.w);
const small = glyphs.map((g) => shrink(g.grid, g.w));
const f8 = Buffer.concat(small.map((s) => pack(s.grid, 7, 8, 7)));
const w8 = small.map((s) => s.w);

console.log(JSON.stringify({
  font12: f12.toString("base64"),
  widths12: w12,
  font8: f8.toString("base64"),
  widths8: w8,
  count: glyphs.length,
}));
