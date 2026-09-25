import { readFileSync, writeFileSync } from "node:fs";
import { writePNG } from "./png_write.mjs";

const REPO = "/home/user/zelda-arabic-magic-a76daea1";
const src = readFileSync(`${REPO}/src/lib/mother3/m3-arabic-font.ts`, "utf-8");
const font = Buffer.from(src.match(/M3_ARABIC_FONT_B64 = "([^"]+)"/)[1], "base64");
const widths = Buffer.from(src.match(/M3_ARABIC_WIDTHS_B64 = "([^"]+)"/)[1], "base64");

const tbl = readFileSync(`${REPO}/src/lib/mother3/m3-arabic-table.ts`, "utf-8");
const map = new Map();
for (const m of tbl.matchAll(/"\\u([0-9a-fA-F]{4})":\s*(0x[0-9A-Fa-f]+)/g)) {
  map.set(parseInt(m[1], 16), parseInt(m[2], 16));
}
console.log("arabic presentation forms mapped:", map.size);

function inkBounds(code) {
  const g = font.subarray(code * 0x20, (code + 1) * 0x20);
  let minX = 99, maxX = -1, minY = 99, maxY = -1;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const bit = (g[y * 2 + (x >> 3)] >> (7 - (x & 7))) & 1;
      if (bit) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
  }
  return { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

let maxW = 0, maxH = 0, count = 0, overWide = 0, overTall = 0;
for (const [cp, code] of map) {
  const b = inkBounds(code);
  if (b.maxX < 0) continue;
  count++;
  if (b.w > maxW) maxW = b.w;
  if (b.h > maxH) maxH = b.h;
  if (b.w > 11) overWide++;
  if (b.h > 12) overTall++;
}
console.log(`glyphs with ink: ${count}`);
console.log(`max ink: ${maxW}w x ${maxH}h   (Inazuma cell = 11x12)`);
console.log(`glyphs wider than 11px: ${overWide}   taller than 12px: ${overTall}`);

// Render a sample sheet: noon forms + a spread of common letters, at 1:1 and labelled.
const sample = [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8, 0xFE91, 0xFE92, 0xFEAE, 0xFEDF, 0xFEE0, 0xFEA9, 0xFEB3, 0xFED3];
const cell = 20, pad = 4;
const cols = sample.length;
const W = cols * (16 * cell + pad), H = 16 * cell + pad;
const rgba = new Uint8ClampedArray(W * H * 4).fill(0);
for (let i = 0; i < W * H; i++) { rgba[i * 4 + 3] = 255; }
sample.forEach((cp, i) => {
  const code = map.get(cp);
  if (code === undefined) { console.log("MISSING", cp.toString(16)); return; }
  const g = font.subarray(code * 0x20, (code + 1) * 0x20);
  const ox = i * (16 * cell + pad);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const bit = (g[y * 2 + (x >> 3)] >> (7 - (x & 7))) & 1;
      if (!bit) continue;
      for (let dy = 0; dy < cell; dy++) {
        for (let dx = 0; dx < cell; dx++) {
          const px = ox + x * cell + dx, py = y * cell + dy;
          const o = (py * W + px) * 4;
          rgba[o] = 255; rgba[o + 1] = 255; rgba[o + 2] = 255;
        }
      }
    }
  }
  const b = inkBounds(code);
  console.log(`U+${cp.toString(16).toUpperCase()} code 0x${code.toString(16)} width=${widths[code]} ink ${b.w}x${b.h}`);
});
writePNG("m3_arabic_sample.png", W, H, rgba);
console.log("wrote m3_arabic_sample.png");
