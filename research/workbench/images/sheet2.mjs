import { openSfp, readEntry, renderEntry, widthCandidates } from "./l5img.mjs";
import { writePNG } from "./png_write.mjs";
// The DS background is 32 tiles across, and these menu pieces are cut to fit it,
// so the divisor nearest 16 tiles is the one that reads as a picture.
const pick = (cells) => { const forced = { 496: 31, 352: 32, 160: 20, 130: 13 }; return forced[cells] ?? widthCandidates(cells).sort((a, b) => Math.abs(a - 16) - Math.abs(b - 16))[0]; };
const items = [];
for (const file of process.argv.slice(2)) {
  const { data, entries } = openSfp(file);
  for (const e of entries) {
    const img = readEntry(data, e);
    if (!img.map.length) continue;
    const r = renderEntry(img, pick(img.map.length));
    items.push({ name: e.name, ...r });
  }
}
const Z = 2, GAP = 10, COLS = 4;
const rows = Math.ceil(items.length / COLS);
const colW = [], rowH = [];
items.forEach((it, i) => {
  const c = i % COLS, r = (i / COLS) | 0;
  colW[c] = Math.max(colW[c] || 0, it.width * Z);
  rowH[r] = Math.max(rowH[r] || 0, it.height * Z);
});
const W = colW.reduce((s, w) => s + w + GAP, GAP);
const H = rowH.reduce((s, h) => s + h + GAP, GAP);
const out = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { out[i*4]=22; out[i*4+1]=24; out[i*4+2]=34; out[i*4+3]=255; }
items.forEach((it, i) => {
  const c = i % COLS, r = (i / COLS) | 0;
  const ox = GAP + colW.slice(0, c).reduce((s, w) => s + w + GAP, 0);
  const oy = GAP + rowH.slice(0, r).reduce((s, h) => s + h + GAP, 0);
  for (let y = 0; y < it.height; y++) for (let x = 0; x < it.width; x++) {
    const s = (y * it.width + x) * 4;
    if (!it.rgba[s+3]) continue;
    for (let dy = 0; dy < Z; dy++) for (let dx = 0; dx < Z; dx++) {
      const o = ((oy + y*Z+dy) * W + ox + x*Z+dx) * 4;
      out[o]=it.rgba[s]; out[o+1]=it.rgba[s+1]; out[o+2]=it.rgba[s+2];
    }
  }
});
writePNG("all.png", W, H, out);
console.log(items.map((i, k) => `${k}:${i.name} ${i.width}x${i.height}`).join("  "));
