import { readFileSync } from "node:fs";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const buf = new Uint8Array(readFileSync(`${SCR}/kh358/EV_TT.p2`));
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const dec = new TextDecoder("latin1");
// بدايات سلاسل "لغة طبيعية" فقط
const good = new Set<number>();
let s = -1;
for (let i = 0; i <= buf.length; i++) {
  const b = i < buf.length ? buf[i] : 0;
  const pr = b >= 0x20 && b !== 0x7f;
  if (pr) { if (s < 0) s = i; continue; }
  if (s >= 0 && b === 0 && i - s >= 6) {
    const t = dec.decode(buf.subarray(s, i));
    if (/[A-Za-zÀ-ÿ]{3}/.test(t) && /[ .,!?]/.test(t)) good.add(s);
  }
  s = -1;
}
console.log("بدايات حوارية:", good.size);
// جرّب كل سجلّ من الجدول عند 18496: خمس قيم، وابحث عن قاعدة تُصيب الخمسة
const rec = [0, 1, 2, 3, 4].map((i) => dv.getUint32(18500 + i * 4, true));
const hits: number[] = [];
for (let base = 0; base + Math.max(...rec) < buf.length; base++) {
  if (rec.every((v) => good.has(base + v))) hits.push(base);
}
console.log("قواعد تُصيب الخمسة:", hits.slice(0, 6), "إجمالاً", hits.length);
for (const base of hits.slice(0, 2)) {
  console.log(`\nقاعدة ${base}:`);
  rec.forEach((v, i) => {
    const at = base + v, e = buf.indexOf(0, at);
    console.log(`  [${i}] @${at} ${JSON.stringify(dec.decode(buf.subarray(at, e)).replace(/\n/g, "·").slice(0, 60))}`);
  });
}
