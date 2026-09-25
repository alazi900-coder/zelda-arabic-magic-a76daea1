import { readdirSync } from "node:fs";
import { readP3d } from "./p3d.mjs";
import { writePNG } from "./png_write.mjs";
export function renderP3d(f, W, S = 3) {
  const { d, dv, h } = readP3d(f);
  const tex = d.subarray(h[1], h[1] + h[2]);
  const pal = []; for (let i = 0; i < h[4] / 2; i++) { const v = dv.getUint16(h[3] + i * 2, true); pal.push([(v&31)*8.2|0, ((v>>5)&31)*8.2|0, ((v>>10)&31)*8.2|0]); }
  const px = tex.length * 2, H = px / W;
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < px; i++) { const n = (i & 1) ? tex[i >> 1] >> 4 : tex[i >> 1] & 15; const [r,g,b] = pal[n] ?? [255,0,255]; rgba.set([r,g,b, n ? 255 : 0], i * 4); }
  return { W, H, rgba };
}
const only = process.argv.slice(2);
for (const f of only) for (const W of [64,128,256]) { const r = renderP3d(f, W); writePNG(`p3dview/${f}_${W}.png`, r.W, r.H, r.rgba); }
