import { readFileSync } from "node:fs";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const buf = new Uint8Array(readFileSync(`${SCR}/kh358/EV_TT.p2`));
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

// 1) كل السلاسل المطبوعة المنتهية بصفر (٤ محارف فأكثر)
const strings: { at: number; text: string }[] = [];
let start = -1;
for (let i = 0; i < buf.length; i++) {
  const b = buf[i];
  const printable = b >= 0x20 && b !== 0x7f;
  if (printable) { if (start < 0) start = i; continue; }
  if (start >= 0 && b === 0 && i - start >= 4) {
    strings.push({ at: start, text: new TextDecoder("latin1").decode(buf.subarray(start, i)) });
  }
  start = -1;
}
console.log("سلاسل منتهية بصفر:", strings.length);
console.log("أول سلسلة عند:", strings[0]?.at, JSON.stringify(strings[0]?.text.slice(0, 40)));
console.log("آخر سلسلة عند:", strings[strings.length - 1]?.at);

// 2) ابحث عن جدول يشير إليها: جرّب u32 مطلق، ثم u32/u16 نسبي لعدة قواعد
const targets = new Set(strings.map((s) => s.at));
const tryTable = (label: string, read: (p: number) => number, width: number, base: number) => {
  let best = { at: -1, run: 0 };
  for (let p = 0; p + width * 8 < buf.length; p += width) {
    let run = 0, q = p;
    while (q + width <= buf.length && targets.has(base + read(q))) { run++; q += width; }
    if (run > best.run) best = { at: p, run };
  }
  if (best.run >= 8) console.log(`  ${label}: جدول عند ${best.at} بطول ${best.run} مدخلة`);
};
console.log("\nبحث عن جدول المؤشّرات:");
tryTable("u32 مطلق", (p) => dv.getUint32(p, true), 4, 0);
for (const base of [0, 0x10, 0x100, 0x200, 0x400, strings[0]?.at ?? 0]) {
  tryTable(`u32 نسبي(${base})`, (p) => dv.getUint32(p, true), 4, base);
  tryTable(`u16 نسبي(${base})`, (p) => dv.getUint16(p, true), 2, base);
}
