import { readFileSync } from "node:fs";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const buf = new Uint8Array(readFileSync(`${SCR}/kh358/font_eu_10all.nftr`));
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const str = (o: number, n: number) => String.fromCharCode(...buf.subarray(o, o + n));
let p = dv.getUint16(12, true);
const blocks: { name: string; at: number; size: number }[] = [];
while (p + 8 <= buf.length) {
  const name = str(p, 4); const size = dv.getUint32(p + 4, true);
  if (!/^[A-Z]{4}$/.test(name) || size < 8 || p + size > buf.length) break;
  blocks.push({ name, at: p, size }); p += size;
}
const finf = blocks.find((b) => b.name === "FNIF")!;
let o = finf.at + 8;
console.log(`FINF: type=${buf[o]} lineFeed=${buf[o+1]} alterCharIdx=${dv.getUint16(o+2,true)} leftMargin=${buf[o+4]} charWidth=${buf[o+5]} height=${buf[o+6]}`);
console.log(`      CGLP@${dv.getUint32(o+7,true)}  CWDH@${dv.getUint32(o+11,true)}  CMAP@${dv.getUint32(o+15,true)}  encoding=${buf[o+19]}`);

const cglp = blocks.find((b) => b.name === "PLGC")!;
o = cglp.at + 8;
const tileW = buf[o], tileH = buf[o + 1], bytesPer = dv.getUint16(o + 2, true), baseline = buf[o + 4], maxW = buf[o + 5], depth = buf[o + 6], rotate = buf[o + 7];
const glyphCount = Math.floor((cglp.size - 16) / bytesPer);
console.log(`CGLP: ${tileW}x${tileH}  bytes/glyph=${bytesPer}  baseline=${baseline}  maxWidth=${maxW}  ${depth}bpp  rotate=${rotate}  عدد=${glyphCount}`);

const cwdh = blocks.find((b) => b.name === "HDWC")!;
o = cwdh.at + 8;
console.log(`CWDH: first=${dv.getUint16(o,true)} last=${dv.getUint16(o+2,true)}  (${dv.getUint16(o+2,true) - dv.getUint16(o,true) + 1} مدخلة)`);

console.log("\nخرائط الحروف (CMAP):");
let covered = 0;
for (const b of blocks.filter((x) => x.name === "PAMC")) {
  o = b.at + 8;
  const lo = dv.getUint16(o, true), hi = dv.getUint16(o + 2, true), type = dv.getUint32(o + 4, true);
  let n = 0;
  if (type === 0) n = hi - lo + 1;
  else if (type === 1) n = dv.getUint16(o + 12, true);
  else if (type === 2) n = dv.getUint16(o + 12, true);
  covered += n;
  console.log(`  U+${lo.toString(16).padStart(4,"0")}..U+${hi.toString(16).padStart(4,"0")}  نوع=${type}  ~${n} حرفاً`);
}
console.log(`إجمالي الحروف المُخرَّطة تقريباً: ${covered} / رسمات متاحة: ${glyphCount}`);
