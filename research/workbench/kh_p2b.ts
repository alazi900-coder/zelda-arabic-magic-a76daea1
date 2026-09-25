import { readFileSync } from "node:fs";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const buf = new Uint8Array(readFileSync(`${SCR}/kh358/EV_TT.p2`));
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
// جدول إزاحات 16-bit يبدأ عند 0x10 — نقرأه حتى يتوقف عن التصاعد
const offsets: number[] = [];
let p = 0x10, prev = -1;
while (p + 2 <= buf.length) {
  const v = dv.getUint16(p, true);
  if (v < prev) break;
  offsets.push(v); prev = v; p += 2;
}
console.log("عدد الإزاحات المتصاعدة:", offsets.length, " آخرها:", offsets[offsets.length - 1]);
const base = p;   // بداية النصوص المفترضة
console.log("بداية النصّ المفترضة:", base);
const dec = new TextDecoder("latin1");
const read = (i: number) => {
  const start = base + offsets[i];
  const end = buf.indexOf(0, start);
  return dec.decode(buf.subarray(start, end < 0 ? start : end)).replace(/[\x00-\x1f]/g, "·");
};
console.log("\nأول ١٢ سلسلة:");
for (let i = 0; i < Math.min(12, offsets.length); i++) console.log(`  [${i}] ${JSON.stringify(read(i))}`);
