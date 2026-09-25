import { readFileSync } from "node:fs";
import { lz77Decompress, parseSfp } from "./sfp_decode.mjs";
import { writePNG } from "./png_write.mjs";
const d = lz77Decompress(readFileSync(process.argv[2]));
const entries = parseSfp(d);
const dv = new DataView(d.buffer, d.byteOffset, d.length);
const e = entries.find((x) => x.name === process.argv[3]);
const h = []; for (let k = 0; k < 8; k++) h.push(dv.getUint32(e.dataOffset + k * 4, true));
const pal = [];
for (let i = 0; i < 16; i++) {
  const v = dv.getUint16(e.dataOffset + 32 + i * 2, true);
  pal.push([Math.round((v & 31) * 255 / 31), Math.round(((v >> 5) & 31) * 255 / 31), Math.round(((v >> 10) & 31) * 255 / 31)]);
}
const px = d.subarray(e.dataOffset + h[5], e.dataOffset + (process.env.END ? +process.env.END : h[6]));
const specs = process.argv.slice(4).map((s) => ({ w: parseInt(s), tiled: /T$/i.test(s) }));
const Z = 4, GAP = 10;
const imgs = specs.map(({ w, tiled }) => {
  const total = px.length * 2, height = Math.ceil(total / w);
  const rgba = new Uint8ClampedArray(w * height * 4);
  for (let i = 0; i < total; i++) {
    const nib = (i & 1) ? (px[i >> 1] >> 4) & 15 : px[i >> 1] & 15;
    let x, y;
    if (!tiled) { x = i % w; y = (i / w) | 0; }
    else { const tw = w >> 3, t = (i / 64) | 0, inT = i % 64;
           x = (t % tw) * 8 + (inT % 8); y = ((t / tw) | 0) * 8 + ((inT / 8) | 0); }
    if (x >= w || y >= height) continue;
    const o = (y * w + x) * 4, [r, g, b] = pal[nib];
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = nib === 0 ? 0 : 255;
  }
  return { w, height, rgba, label: `${w}${tiled ? "T" : "L"}` };
});
const W = imgs.reduce((s, im) => s + im.w * Z + GAP, GAP);
const H = Math.max(...imgs.map((i) => i.height)) * Z + GAP * 2;
const out = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { out[i*4]=25; out[i*4+1]=25; out[i*4+2]=35; out[i*4+3]=255; }
let ox = GAP;
for (const im of imgs) {
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.w; x++) {
    const s = (y * im.w + x) * 4;
    if (!im.rgba[s+3]) continue;
    for (let dy = 0; dy < Z; dy++) for (let dx = 0; dx < Z; dx++) {
      const o = ((GAP + y*Z+dy) * W + ox + x*Z+dx) * 4;
      out[o]=im.rgba[s]; out[o+1]=im.rgba[s+1]; out[o+2]=im.rgba[s+2];
    }
  }
  ox += im.w * Z + GAP;
}
writePNG("one.png", W, H, out);
console.log("labels:", imgs.map(i=>`${i.label} ${i.w}x${i.height}`).join("  "));
