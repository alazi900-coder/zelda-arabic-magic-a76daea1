import { readFileSync } from "node:fs";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const buf = new Uint8Array(readFileSync(`${SCR}/kh358/EV_TT.p2`));
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const dec = new TextDecoder("latin1");

// اطبع أول ٤٨ بايت كـ u32 ثم كـ u16
console.log("u32:", Array.from({ length: 12 }, (_, i) => dv.getUint32(i * 4, true)));
console.log("u16:", Array.from({ length: 24 }, (_, i) => dv.getUint16(i * 2, true)));

// أين أوّل سطر حوار إنجليزي حقيقي؟
const latin = dec.decode(buf);
const probe = "Oh, yeah. I think so.";
const at = latin.indexOf(probe);
console.log("\nالسطر التجريبي عند:", at);

// ابحث عن هذا الرقم في الملف كـ u32 أو u16 (مطلق أو ناقص قاعدة معروفة)
const findValue = (want: number, label: string) => {
  const hits32: number[] = [], hits16: number[] = [];
  for (let p = 0; p + 4 <= buf.length; p += 1) {
    if (dv.getUint32(p, true) === want) hits32.push(p);
  }
  for (let p = 0; p + 2 <= buf.length; p += 1) {
    if (dv.getUint16(p, true) === want) hits16.push(p);
  }
  console.log(`  ${label}: u32 في ${hits32.slice(0, 6).join(", ") || "لا شيء"} | u16 في ${hits16.slice(0, 6).join(", ") || "لا شيء"}`);
};
console.log("\nمواضع تحتوي قيمة إزاحة السطر:");
findValue(at, "مطلق");
for (const base of [0x10, 0x400, 18432, 1148]) if (at - base > 0) findValue(at - base, `ناقص ${base}`);
