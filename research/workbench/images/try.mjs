import { readFileSync } from "node:fs";
import { lz77Decompress, parseSfp } from "./sfp_decode.mjs";
import { writePNG } from "./png_write.mjs";

const d = lz77Decompress(readFileSync(process.argv[2]));
const entries = parseSfp(d);
const dv = new DataView(d.buffer, d.byteOffset, d.length);
const want = process.argv[3];
const e = entries.find((x) => x.name === want);
const h = []; for (let k = 0; k < 8; k++) h.push(dv.getUint32(e.dataOffset + k * 4, true));
console.log(`${e.name} size=${e.size} header=${h.join(",")}`);

// palette: 16 RGB555 at offset 32
const pal = [];
for (let i = 0; i < 16; i++) {
  const v = dv.getUint16(e.dataOffset + 32 + i * 2, true);
  pal.push([Math.round((v & 31) * 255 / 31), Math.round(((v >> 5) & 31) * 255 / 31), Math.round(((v >> 10) & 31) * 255 / 31)]);
}

const start = h[5], end = h[6];
const px = d.subarray(e.dataOffset + start, e.dataOffset + end);
console.log(`pixel region ${start}..${end} = ${px.length} bytes = ${px.length * 2} pixels = ${px.length / 32} tiles`);

function render(width, tiled) {
  const total = px.length * 2;
  const height = Math.ceil(total / width);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < total; i++) {
    const nib = (i & 1) ? (px[i >> 1] >> 4) & 15 : px[i >> 1] & 15;
    let x, y;
    if (!tiled) { x = i % width; y = (i / width) | 0; }
    else {
      const tw = width >> 3, t = (i / 64) | 0, inT = i % 64;
      x = (t % tw) * 8 + (inT % 8);
      y = ((t / tw) | 0) * 8 + ((inT / 8) | 0);
    }
    if (x >= width || y >= height) continue;
    const o = (y * width + x) * 4;
    const [r, g, b] = pal[nib];
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = nib === 0 ? 0 : 255;
  }
  return { width, height, rgba };
}

const widths = [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 128, 160, 192, 256];
const Z = 2, GAP = 8;
const imgs = [];
for (const w of widths) for (const tiled of [false, true]) {
  if (tiled && (w % 8)) continue;
  imgs.push({ ...render(w, tiled), label: `${w}${tiled ? "T" : "L"}` });
}
const W = imgs.reduce((s, im) => s + im.width * Z + GAP, GAP);
const H = Math.max(...imgs.map((im) => im.height)) * Z + GAP * 2;
const out = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { out[i * 4] = 25; out[i * 4 + 1] = 25; out[i * 4 + 2] = 35; out[i * 4 + 3] = 255; }
let ox = GAP;
for (const im of imgs) {
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
    const s = (y * im.width + x) * 4;
    if (!im.rgba[s + 3]) continue;
    for (let dy = 0; dy < Z; dy++) for (let dx = 0; dx < Z; dx++) {
      const o = ((GAP + y * Z + dy) * W + ox + x * Z + dx) * 4;
      out[o] = im.rgba[s]; out[o + 1] = im.rgba[s + 1]; out[o + 2] = im.rgba[s + 2];
    }
  }
  ox += im.width * Z + GAP;
}
writePNG(`try_${want.replace(/\W/g, "_")}.png`, W, H, out);
console.log("wrote try_" + want.replace(/\W/g, "_") + ".png  order:", imgs.map((i) => i.label).join(" "));
