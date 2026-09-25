import { M3_MAP, M3_WIDTHS, IZ_CPS, IZ12_W, iz12Px } from "./lib.mjs";
import { fitToCell } from "./build.mjs";
import { writePNG } from "../images/png_write.mjs";

// Presentation forms grouped per letter, in isolated/final/initial/medial order.
const GROUPS = [];
for (let cp = 0xFE80; cp <= 0xFEFC; ) {
  const run = [];
  while (cp <= 0xFEFC && run.length < 4 && IZ_CPS.includes(cp)) { run.push(cp); cp++; }
  if (run.length) GROUPS.push(run); else cp++;
}
const ROWS = [];
for (const g of GROUPS) {
  // split 2-form letters off so每 row is one letter's forms
  ROWS.push(g.slice(0, 4));
  if (g.length > 4) ROWS.push(g.slice(4));
}

const Z = 4, CW = 12 * Z, CH = 13 * Z, COLS = 4, GAP = 8;
const W = COLS * (CW + GAP) + GAP;
const H = ROWS.length * (CH + GAP) + GAP;
const rgba = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { rgba[i * 4] = 14; rgba[i * 4 + 1] = 16; rgba[i * 4 + 2] = 26; rgba[i * 4 + 3] = 255; }

ROWS.forEach((row, ry) => {
  row.forEach((cp, cx) => {
    const c = M3_MAP.get(cp);
    const ox = GAP + cx * (CW + GAP), oy = GAP + ry * (CH + GAP);
    // cell backdrop so an empty glyph is still visible as a slot
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const o = ((oy + y) * W + ox + x) * 4;
      rgba[o] = 34; rgba[o + 1] = 36; rgba[o + 2] = 48;
    }
    let px = null, w = 0, colour = [150, 255, 170];
    if (c !== undefined) {
      const r = fitToCell(c);
      if (r?.grid) { px = (x, y) => r.grid[y][x]; w = M3_WIDTHS[c]; }
    }
    if (!px) { // absent from Mother 3 -- show the cartridge's own glyph in red
      const s = IZ_CPS.indexOf(cp);
      px = (x, y) => !!iz12Px(s, x, y); w = IZ12_W[s]; colour = [255, 120, 120];
    }
    for (let y = 0; y < 12; y++) for (let x = 0; x < Math.min(w, 11); x++) {
      if (!px(x, y)) continue;
      for (let dy = 0; dy < Z; dy++) for (let dx = 0; dx < Z; dx++) {
        const o = ((oy + y * Z + dy) * W + ox + x * Z + dx) * 4;
        rgba[o] = colour[0]; rgba[o + 1] = colour[1]; rgba[o + 2] = colour[2];
      }
    }
  });
});
writePNG(`${new URL(".", import.meta.url).pathname}sheet.png`, W, H, rgba);
console.log(`${ROWS.length} rows, ${IZ_CPS.length} forms`);
ROWS.forEach((r, i) => console.log(`row ${i}: ${r.map((c) => c.toString(16).toUpperCase()).join(" ")}`));
