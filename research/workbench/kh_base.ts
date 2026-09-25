import { readFileSync } from "node:fs";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const buf = new Uint8Array(readFileSync(`${SCR}/kh358/EV_TT.p2`));
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const dec = new TextDecoder("latin1");

// بدايات كل سلسلة منتهية بصفر
const starts = new Set<number>();
let inStr = false;
for (let i = 0; i < buf.length; i++) {
  const printable = buf[i] >= 0x20 && buf[i] !== 0x7f;
  if (printable && !inStr) { starts.add(i); inStr = true; }
  else if (!printable) inStr = false;
}

// سجلّ عند 18500: خمس قيم u32
const rec = [0, 1, 2, 3, 4].map((i) => dv.getUint32(18500 + i * 4, true));
console.log("قيم السجلّ:", rec);

// ابحث عن قاعدة تجعل الخمسة كلّها بدايات سلاسل
const found: number[] = [];
for (let base = 0; base < 30000; base++) {
  if (rec.every((v) => starts.has(base + v))) found.push(base);
}
console.log("قواعد صالحة:", found.slice(0, 5), found.length > 5 ? `(+${found.length - 5})` : "");
for (const base of found.slice(0, 3)) {
  console.log(`\nقاعدة ${base}:`);
  rec.forEach((v, i) => {
    const at = base + v, e = buf.indexOf(0, at);
    console.log(`   [${i}] @${at} ${JSON.stringify(dec.decode(buf.subarray(at, e)).replace(/\n/g, "·").slice(0, 55))}`);
  });
}
