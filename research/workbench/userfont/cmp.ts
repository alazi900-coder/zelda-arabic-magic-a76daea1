import { readFileSync, writeFileSync } from "node:fs";
import { ndsFileIdByPath, findNdsFile } from "@/lib/nds/nds-rom";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const user = new Uint8Array(readFileSync(process.argv[3]));
const fonts = [...ndsFileIdByPath(rom).keys()].filter((p) => /\.NFTR$/i.test(p));
console.log("fonts in ROM:", fonts.join(", "));
function info(b: Uint8Array) {
  const dv = new DataView(b.buffer, b.byteOffset, b.length);
  let p = 0x10, plgc = -1, hdwc = -1, cw = 0, ch = 0, tb = 0, depth = 0, size = dv.getUint32(8, true);
  while (p < b.length - 8) {
    const k = String.fromCharCode(...b.subarray(p, p + 4)); const s = dv.getUint32(p + 4, true); if (!s) break;
    if (k === "PLGC") { plgc = p; cw = b[p + 8]; ch = b[p + 9]; tb = dv.getUint16(p + 10, true); depth = b[p + 14]; }
    if (k === "HDWC") hdwc = p;
    p += s;
  }
  const n = hdwc > 0 ? (dv.getUint32(plgc + 4, true) - 16) / tb : 0;
  return { size, plgc, hdwc, cw, ch, tb, depth, glyphs: Math.floor(n) };
}
for (const f of fonts) {
  const r = findNdsFile(rom, f)!; const b = rom.slice(r.start, r.end);
  writeFileSync(`${process.argv[4]}/${f.split("/").pop()}`, b);
  console.log(f, JSON.stringify(info(b)));
}
console.log("USER", JSON.stringify(info(user)));
// compare user vs original FONT12
const o = rom.slice(findNdsFile(rom, fonts.find((f) => /FONT12\.NFTR$/i.test(f))!)!.start, findNdsFile(rom, fonts.find((f) => /FONT12\.NFTR$/i.test(f))!)!.end);
const iu = info(user), io = info(o);
let diffOutside = 0;
if (user.length === o.length) {
  const changed: number[] = [];
  for (let g = 0; g < iu.glyphs; g++) {
    const a = iu.plgc + 16 + g * iu.tb, bb = io.plgc + 16 + g * io.tb;
    let d = false; for (let i = 0; i < iu.tb; i++) if (user[a + i] !== o[bb + i]) { d = true; break; }
    const ha = iu.hdwc + 16 + g * 3, hb = io.hdwc + 16 + g * 3;
    if (user[ha] !== o[hb] || user[ha + 1] !== o[hb + 1] || user[ha + 2] !== o[hb + 2]) d = true;
    if (d) changed.push(g);
  }
  console.log(`same length; glyphs changed ${changed.length}: ${changed.slice(0, 200).join(",")}`);
  for (let i = 0; i < user.length; i++) {
    const inPlgc = i >= iu.plgc + 16 && i < iu.plgc + 16 + iu.glyphs * iu.tb;
    const inHdwc = i >= iu.hdwc + 16 && i < iu.hdwc + 16 + iu.glyphs * 3;
    if (!inPlgc && !inHdwc && user[i] !== o[i]) diffOutside++;
  }
  console.log("bytes changed outside glyph pixels/widths:", diffOutside);
} else console.log("DIFFERENT LENGTH", user.length, o.length);
