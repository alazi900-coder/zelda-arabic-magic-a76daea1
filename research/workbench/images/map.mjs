import { readFileSync } from "node:fs";
import { lz77Decompress, parseSfp } from "./sfp_decode.mjs";
import { writePNG } from "./png_write.mjs";
const d = lz77Decompress(readFileSync(process.argv[2]));
const dv = new DataView(d.buffer, d.byteOffset, d.length);
const e = parseSfp(d).find((x) => x.name === process.argv[3]);
const h = []; for (let k = 0; k < 8; k++) h.push(dv.getUint32(e.dataOffset + k * 4, true));
const pal = [];
for (let i = 0; i < 16; i++) {
  const v = dv.getUint16(e.dataOffset + 32 + i * 2, true);
  pal.push([Math.round((v&31)*255/31), Math.round(((v>>5)&31)*255/31), Math.round(((v>>10)&31)*255/31)]);
}
const tiles = d.subarray(e.dataOffset + h[5], e.dataOffset + h[7]);
const nTiles = tiles.length / 32;
console.log(`${e.name}  header=${h.join(",")}  tiles=${nTiles}`);

function drawMapped(mapOff, mapCount, tw) {
  const th = Math.ceil(mapCount / tw);
  const W = tw * 8, H = th * 8;
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let m = 0; m < mapCount; m++) {
    const ent = dv.getUint16(e.dataOffset + mapOff + m * 2, true);
    const idx = ent & 0x3ff, hf = (ent >> 10) & 1, vf = (ent >> 11) & 1;
    if (idx >= nTiles) continue;
    const tx = (m % tw) * 8, ty = ((m / tw) | 0) * 8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const sx = hf ? 7 - x : x, sy = vf ? 7 - y : y;
      const i = idx * 64 + sy * 8 + sx;
      const nib = (i & 1) ? (tiles[i >> 1] >> 4) & 15 : tiles[i >> 1] & 15;
      const o = ((ty + y) * W + tx + x) * 4, [r, g, b] = pal[nib];
      rgba[o] = r; rgba[o+1] = g; rgba[o+2] = b; rgba[o+3] = nib === 0 ? 0 : 255;
    }
  }
  return { W, H, rgba };
}

const Z = 4, GAP = 10;
const cand = [];
for (const [off, cnt] of [[h[3], (h[4]-h[3])/2], [h[4], (h[5]-h[4])/2]]) {
  if (!(cnt > 0 && cnt < 4096)) continue;
  for (const tw of [8, 13, 16, 24, 26, 32]) {
    if (cnt % tw) continue;
    const im = drawMapped(off, cnt, tw);
    cand.push({ ...im, label: `map@${off} n=${cnt} ${tw}t` });
  }
}
console.log("candidates:", cand.map((c) => c.label).join("  ") || "none");
if (!cand.length) process.exit(0);
const W = cand.reduce((s, c) => s + c.W * Z + GAP, GAP);
const H = Math.max(...cand.map((c) => c.H)) * Z + GAP * 2;
const out = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { out[i*4]=25; out[i*4+1]=25; out[i*4+2]=35; out[i*4+3]=255; }
let ox = GAP;
for (const c of cand) {
  for (let y = 0; y < c.H; y++) for (let x = 0; x < c.W; x++) {
    const s = (y * c.W + x) * 4;
    if (!c.rgba[s+3]) continue;
    for (let dy = 0; dy < Z; dy++) for (let dx = 0; dx < Z; dx++) {
      const o = ((GAP + y*Z+dy) * W + ox + x*Z+dx) * 4;
      out[o]=c.rgba[s]; out[o+1]=c.rgba[s+1]; out[o+2]=c.rgba[s+2];
    }
  }
  ox += c.W * Z + GAP;
}
writePNG("map.png", W, H, out);
console.log("wrote map.png");
