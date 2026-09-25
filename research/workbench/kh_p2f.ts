import { readFileSync } from "node:fs";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const buf = new Uint8Array(readFileSync(`${SCR}/kh358/EV_TT.p2`));
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const dec = new TextDecoder("latin1");

// سلاسل "حوارية" حقيقية: ٦ محارف فأكثر وفيها حرف وفراغ
const strs: { at: number; text: string }[] = [];
let s = -1;
for (let i = 0; i <= buf.length; i++) {
  const b = i < buf.length ? buf[i] : 0;
  if (b >= 0x20 && b !== 0x7f) { if (s < 0) s = i; continue; }
  if (s >= 0 && b === 0 && i - s >= 6) {
    const t = dec.decode(buf.subarray(s, i));
    if (/[A-Za-z]{2}/.test(t) && / /.test(t)) strs.push({ at: s, text: t });
  }
  s = -1;
}
console.log("سلاسل حوارية:", strs.length, " من", strs[0].at, "إلى", strs[strs.length - 1].at);

// جرّب كل قاعدة محتملة: هل توجد نافذة تحوي مؤشّرات كثيرة لبدايات السلاسل؟
const starts = new Set(strs.map((x) => x.at));
let best = { base: -1, tableAt: -1, run: 0, width: 0 };
const bases = new Set<number>([0, 0x10, 250, 1024, 1148, strs[0].at]);
for (const base of bases) {
  for (const width of [2, 4]) {
    const read = width === 2 ? (p: number) => dv.getUint16(p, true) : (p: number) => dv.getUint32(p, true);
    for (let p = 0; p + width * 16 < strs[0].at + 64; p += width) {
      let run = 0, q = p;
      while (q + width <= buf.length && starts.has(base + read(q))) { run++; q += width; }
      if (run > best.run) best = { base, tableAt: p, run, width };
    }
  }
}
console.log("أفضل مطابقة:", best);
if (best.run >= 8) {
  const read = best.width === 2 ? (p: number) => dv.getUint16(p, true) : (p: number) => dv.getUint32(p, true);
  for (let i = 0; i < Math.min(6, best.run); i++) {
    const at = best.base + read(best.tableAt + i * best.width);
    const e = buf.indexOf(0, at);
    console.log(`   [${i}] @${at} ${JSON.stringify(dec.decode(buf.subarray(at, e)).slice(0, 60))}`);
  }
}
