// A two-texture LAHD file (RGBA8, 64x64 each) built only with the parser's
// own replace routine, so the viewer reads it exactly as it reads a real one.
import { writeFileSync } from "node:fs";
import { analyzeWilay, replaceWilayTexture } from "@/lib/wilay-parser";
const W = 64, H = 64, F = 40;
function placeholderMibl(): Uint8Array {
  const size = W * H * 4 + 4096; // pixel data + a page for the footer
  const m = new Uint8Array(size);
  const v = new DataView(m.buffer, size - F, F);
  v.setUint32(0, W * H * 4, true); v.setUint32(4, 4096, true);
  v.setUint32(8, W, true); v.setUint32(12, H, true); v.setUint32(16, 1, true);
  v.setUint32(20, 1, true); v.setUint32(24, 37, true); v.setUint32(28, 1, true); v.setUint32(32, 10001, true);
  m.set([0x4c, 0x42, 0x49, 0x4d], size - F + 36);
  return m;
}
const header = 128, texBase = header, items = 2;
const itemsOff = 8;
const dataStart = itemsOff + items * 12;
const mibls = [placeholderMibl(), placeholderMibl()];
const total = texBase + dataStart + mibls.reduce((a, m) => a + m.length, 0);
const buf = new Uint8Array(total);
const dv = new DataView(buf.buffer);
buf.set([0x4c, 0x41, 0x48, 0x44]); dv.setUint32(4, 10002, true);
dv.setUint32(36, texBase, true);
dv.setUint32(texBase, itemsOff, true); dv.setUint32(texBase + 4, items, true);
let at = dataStart;
mibls.forEach((m, i) => {
  dv.setUint32(texBase + itemsOff + i * 12, 0, true);
  dv.setUint32(texBase + itemsOff + i * 12 + 4, at, true);
  dv.setUint32(texBase + itemsOff + i * 12 + 8, m.length, true);
  buf.set(m, texBase + at); at += m.length;
});
let data: ArrayBuffer = buf.buffer;
// paint each texture: tex0 red/blue checker, tex1 green gradient
for (let t = 0; t < 2; t++) {
  const info = analyzeWilay(data);
  const px = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    if (t === 0) { const c = ((x >> 3) + (y >> 3)) & 1; px.set(c ? [220, 30, 30, 255] : [30, 30, 220, 255], o); }
    else px.set([0, x * 4, y * 4, 255], o);
  }
  data = replaceWilayTexture(data, info.textures[t], px, W, H)!;
}
const info = analyzeWilay(data);
console.log(info.valid, info.textures.map((t) => `${t.index}:${t.width}x${t.height}:${t.formatName}:${t.type}`));
writeFileSync(process.argv[2], new Uint8Array(data));
