import { readFileSync, writeFileSync } from "node:fs";
import { ndsFileIdByPath, ndsFiles } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/nds-rom";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const rom = new Uint8Array(readFileSync(`${SCR}/kh358/kh358.nds`));
const byPath = ndsFileIdByPath(rom); const files = ndsFiles(rom);
const path = process.argv[2] ?? "text/font_eu_10all.nftr";
const f = files[byPath.get(path)!];
const buf = rom.subarray(f.start, f.end);
writeFileSync(`${SCR}/kh358/${path.split("/").pop()}`, buf);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const str = (o: number, n: number) => String.fromCharCode(...buf.subarray(o, o + n));
console.log(`${path}  (${buf.length} بايت)`);
console.log(`  magic=${str(0,4)} bom=0x${dv.getUint16(4,true).toString(16)} ver=0x${dv.getUint16(6,true).toString(16)} size=${dv.getUint32(8,true)} hdr=${dv.getUint16(12,true)} blocks=${dv.getUint16(14,true)}`);
let p = dv.getUint16(12, true);
const blocks: { name: string; at: number; size: number }[] = [];
while (p + 8 <= buf.length) {
  const name = str(p, 4);
  const size = dv.getUint32(p + 4, true);
  if (!/^[A-Z]{4}$/.test(name) || size < 8 || p + size > buf.length) break;
  blocks.push({ name, at: p, size });
  p += size;
}
console.log("  كتل:", blocks.map((b) => `${b.name}@${b.at}(${b.size})`).join("  "));
const finf = blocks.find((b) => b.name === "FINF");
if (finf) {
  const o = finf.at + 8;
  console.log(`  FINF: type=${buf[o]} lineFeed=${buf[o+1]} alterIdx=${dv.getUint16(o+2,true)} lm=${buf[o+4]} cw=${buf[o+5]} h=${buf[o+6]}`);
  console.log(`        PLGC=${dv.getUint32(o+7,true)} HDWC=${dv.getUint32(o+11,true)} PAMC=${dv.getUint32(o+15,true)} enc=${buf[o+19]}`);
}
const cglp = blocks.find((b) => b.name === "CGLP");
if (cglp) {
  const o = cglp.at + 8;
  const tileW = buf[o], tileH = buf[o+1], bytesPer = dv.getUint16(o+2, true), depth = buf[o+6];
  console.log(`  CGLP: ${tileW}x${tileH} bytes/glyph=${bytesPer} depth=${depth}bpp → عدد الرسمات=${Math.floor((cglp.size - 16) / bytesPer)}`);
}
for (const b of blocks.filter((b) => b.name === "CMAP")) {
  const o = b.at + 8;
  console.log(`  CMAP@${b.at}: نطاق U+${dv.getUint16(o,true).toString(16).padStart(4,"0")}..U+${dv.getUint16(o+2,true).toString(16).padStart(4,"0")} نوع=${dv.getUint32(o+4,true)} التالي=${dv.getUint32(o+8,true)}`);
}
