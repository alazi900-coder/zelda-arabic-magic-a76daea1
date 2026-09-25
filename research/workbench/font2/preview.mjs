import { execFileSync } from "node:child_process";
import { IZ_CPS, IZ12_W, iz12Px } from "./lib.mjs";
import { assemble } from "./assemble.mjs";
import { writePNG } from "../images/png_write.mjs";

const REPO = "/home/user/zelda-arabic-magic-a76daea1";
const HERE = new URL(".", import.meta.url).pathname;
const shape = (s) => JSON.parse(execFileSync(`${REPO}/node_modules/.bin/vite-node`,
  [`${HERE}shape.ts`, "--", s], { cwd: REPO, encoding: "utf-8" }).trim());

const glyphs = new Map(assemble().map((g) => [g.cp, g]));
const izSlot = new Map(IZ_CPS.map((cp, i) => [cp, i]));
const Z = 4, GAP = 5;

function cells(codes, useNew) {
  return codes.map((cp) => {
    if (cp === 32) return { w: 4, px: () => false };
    if (useNew) {
      const g = glyphs.get(cp);
      return g ? { w: g.w, px: (x, y) => g.grid[y][x] } : { w: 4, px: () => false };
    }
    const s = izSlot.get(cp);
    return s === undefined ? { w: 4, px: () => false } : { w: IZ12_W[s], px: (x, y) => !!iz12Px(s, x, y) };
  });
}

const LINES = process.argv.slice(2);
const rows = LINES.map((l) => { const c = shape(l); return { old: cells(c, false), neu: cells(c, true) }; });
const lineW = (cs) => cs.reduce((s, c) => s + c.w + 1, 0);
const W = 16 + Math.max(...rows.flatMap((r) => [lineW(r.old), lineW(r.neu)])) * Z;
const H = 16 + rows.length * (2 * 12 * Z + GAP * 3);
const rgba = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { rgba[i * 4] = 16; rgba[i * 4 + 1] = 18; rgba[i * 4 + 2] = 28; rgba[i * 4 + 3] = 255; }
let oy = 8;
for (const r of rows) {
  for (const [cs, tint] of [[r.old, [255, 130, 130]], [r.neu, [150, 255, 170]]]) {
    let ox = 8;
    for (const c of cs) {
      for (let y = 0; y < 12; y++) for (let x = 0; x < c.w; x++) {
        if (!c.px(x, y)) continue;
        for (let dy = 0; dy < Z; dy++) for (let dx = 0; dx < Z; dx++) {
          const o = ((oy + y * Z + dy) * W + ox + x * Z + dx) * 4;
          rgba[o] = tint[0]; rgba[o + 1] = tint[1]; rgba[o + 2] = tint[2];
        }
      }
      ox += (c.w + 1) * Z;
    }
    oy += 12 * Z + GAP;
  }
  oy += GAP;
}
writePNG(`${HERE}preview.png`, W, H, rgba);
console.log("wrote preview.png");
