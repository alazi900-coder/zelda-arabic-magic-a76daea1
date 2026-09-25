import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { IZ_CPS, IZ8_W, iz8Px } from "./lib.mjs";
import { writePNG } from "../images/png_write.mjs";
const REPO = "/home/user/zelda-arabic-magic-a76daea1";
const HERE = new URL(".", import.meta.url).pathname;
const e = JSON.parse(readFileSync(`${HERE}emitted.json`, "utf-8"));
const f8 = Buffer.from(e.font8, "base64");
const newPx = (s, x, y) => { const b = y * 7 + x; return (f8[s * 7 + (b >> 3)] >> (7 - (b & 7))) & 1; };
const shape = (s) => JSON.parse(execFileSync(`${REPO}/node_modules/.bin/vite-node`, [`${HERE}shape.ts`, "--", s], { cwd: REPO, encoding: "utf-8" }).trim());
const slot = new Map(IZ_CPS.map((cp, i) => [cp, i]));
const Z = 6, GAP = 5;
const rows = process.argv.slice(2).map((l) => shape(l));
const cells = (codes, useNew) => codes.map((cp) => {
  if (cp === 32) return { w: 3, px: () => false };
  const s = slot.get(cp);
  if (s === undefined) return { w: 3, px: () => false };
  return useNew ? { w: e.widths8[s], px: (x, y) => !!newPx(s, x, y) } : { w: IZ8_W[s], px: (x, y) => !!iz8Px(s, x, y) };
});
const all = rows.map((c) => ({ old: cells(c, false), neu: cells(c, true) }));
const lw = (cs) => cs.reduce((s, c) => s + c.w + 1, 0);
const W = 16 + Math.max(...all.flatMap((r) => [lw(r.old), lw(r.neu)])) * Z;
const H = 16 + all.length * (2 * 8 * Z + GAP * 3);
const rgba = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { rgba[i * 4] = 16; rgba[i * 4 + 1] = 18; rgba[i * 4 + 2] = 28; rgba[i * 4 + 3] = 255; }
let oy = 8;
for (const r of all) {
  for (const [cs, tint] of [[r.old, [255, 130, 130]], [r.neu, [150, 255, 170]]]) {
    let ox = 8;
    for (const c of cs) {
      for (let y = 0; y < 8; y++) for (let x = 0; x < c.w; x++) {
        if (!c.px(x, y)) continue;
        for (let dy = 0; dy < Z; dy++) for (let dx = 0; dx < Z; dx++) {
          const o = ((oy + y * Z + dy) * W + ox + x * Z + dx) * 4;
          rgba[o] = tint[0]; rgba[o + 1] = tint[1]; rgba[o + 2] = tint[2];
        }
      }
      ox += (c.w + 1) * Z;
    }
    oy += 8 * Z + GAP;
  }
  oy += GAP;
}
writePNG(`${HERE}preview8.png`, W, H, rgba);
console.log("wrote preview8.png");
