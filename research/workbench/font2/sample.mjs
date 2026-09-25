import { execFileSync } from "node:child_process";
import { M3_MAP, M3_WIDTHS, IZ_CPS, IZ12_W, iz12Px } from "./lib.mjs";
import { fitToCell } from "./build.mjs";
import { writePNG } from "../images/png_write.mjs";

const REPO = "/home/user/zelda-arabic-magic-a76daea1";
const shape = (s) => JSON.parse(execFileSync(`${REPO}/node_modules/.bin/vite-node`,
  [`${new URL(".", import.meta.url).pathname}shape.ts`, "--", s], { cwd: REPO, encoding: "utf-8" }).trim());

const LINES = process.argv.slice(2);
const ZOOM = 4, GAP = 6, PAD = 8;

const fitted = new Map();
for (const cp of IZ_CPS) {
  const c = M3_MAP.get(cp);
  if (c === undefined) continue;
  const r = fitToCell(c);
  if (r?.grid) fitted.set(cp, { grid: r.grid, w: M3_WIDTHS[c] });
}
const izSlot = new Map(IZ_CPS.map((cp, i) => [cp, i]));

/** One line of shaped text, already in visual order, as {w, h, px(x,y)}. */
function layout(codes, useM3) {
  const cells = codes.map((cp) => {
    if (cp === 32) return { w: 4, px: () => false };
    if (useM3) {
      const f = fitted.get(cp);
      if (!f) return { w: 4, px: () => false, missing: true };
      return { w: f.w, px: (x, y) => f.grid[y][x] };
    }
    const s = izSlot.get(cp);
    if (s === undefined) return { w: 4, px: () => false, missing: true };
    return { w: IZ12_W[s], px: (x, y) => !!iz12Px(s, x, y) };
  });
  return cells;
}

const rows = [];
for (const line of LINES) {
  const codes = shape(line);
  rows.push({ label: line, iz: layout(codes, false), m3: layout(codes, true) });
}
const lineW = (cells) => cells.reduce((s, c) => s + c.w + 1, 0);
const W = PAD * 2 + Math.max(...rows.flatMap((r) => [lineW(r.iz), lineW(r.m3)])) * ZOOM;
const H = PAD * 2 + rows.length * (2 * 12 * ZOOM + GAP * 2) + (rows.length - 1) * GAP * 2;
const rgba = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { rgba[i * 4] = 16; rgba[i * 4 + 1] = 18; rgba[i * 4 + 2] = 28; rgba[i * 4 + 3] = 255; }

let oy = PAD;
for (const r of rows) {
  for (const [cells, tint] of [[r.iz, [255, 140, 140]], [r.m3, [150, 255, 170]]]) {
    let ox = PAD;
    for (const c of cells) {
      for (let y = 0; y < 12; y++) for (let x = 0; x < c.w; x++) {
        if (!c.px(x, y)) continue;
        for (let dy = 0; dy < ZOOM; dy++) for (let dx = 0; dx < ZOOM; dx++) {
          const o = ((oy + y * ZOOM + dy) * W + ox + x * ZOOM + dx) * 4;
          rgba[o] = tint[0]; rgba[o + 1] = tint[1]; rgba[o + 2] = tint[2];
        }
      }
      ox += (c.w + 1) * ZOOM;
    }
    oy += 12 * ZOOM + GAP;
  }
  oy += GAP * 2;
}
writePNG(`${new URL(".", import.meta.url).pathname}sample.png`, W, H, rgba);
console.log("wrote sample.png  (red = current Inazuma font, green = Mother 3 transplant)");
