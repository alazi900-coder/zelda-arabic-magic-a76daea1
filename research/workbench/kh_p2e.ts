import { readFileSync } from "node:fs";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const buf = new Uint8Array(readFileSync(`${SCR}/kh358/EV_TT.p2`));
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const dec = new TextDecoder("latin1");
const show = (at: number, n = 64) =>
  [...buf.subarray(at, at + n)].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "·")).join("");

console.log("عند 1024 :", JSON.stringify(show(1024)));
console.log("عند 1148 :", JSON.stringify(show(1148)));
console.log("عند 18333:", JSON.stringify(show(18333)));

// الجدول عند 0x10 بإزاحات نسبية لعدّة قواعد — أيّها يعطي نصّاً معقولاً؟
const offsets: number[] = [];
let p = 0x10, prev = -1;
while (p + 2 <= buf.length) { const v = dv.getUint16(p, true); if (v < prev) break; offsets.push(v); prev = v; p += 2; }
console.log("\nالجدول: عدد =", offsets.length, "نهايته =", offsets[offsets.length - 1], "ينتهي عند", p);

for (const base of [p, 1024, 1148, 18333 - offsets[0]]) {
  const sample = [0, 1, 2, 3].map((i) => {
    const s = base + offsets[i];
    const e = buf.indexOf(0, s);
    return dec.decode(buf.subarray(s, e < 0 ? s + 20 : e)).replace(/[\x00-\x1f]/g, "·");
  });
  console.log(`  قاعدة ${base}: ${JSON.stringify(sample)}`);
}
