import { readFileSync, readdirSync } from "node:fs";
import { lz77Decompress } from "./sfp_decode.mjs";
export function readP3d(file) {
  const raw = new Uint8Array(readFileSync(`spf/${file}`));
  let d; try { d = lz77Decompress(raw); } catch { d = raw; }
  const dv = new DataView(d.buffer, d.byteOffset, d.length);
  const h = []; for (let k = 0; k < 8; k++) h.push(dv.getUint32(k * 4, true));
  return { d, dv, h };
}
const stats = {};
for (const f of readdirSync("spf").filter(f => f.startsWith("pic3d__en__"))) {
  const { h } = readP3d(f);
  const key = `tex=${h[2]} pal=${h[4]} [6]=${h[6]}`;
  stats[key] = (stats[key] || 0) + 1;
}
console.log(Object.entries(stats).sort((a,b)=>b[1]-a[1]).slice(0,30));
