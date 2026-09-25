import { readFileSync, writeFileSync } from "node:fs";
import { ndsFileIdByPath, ndsFiles } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/nds-rom";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const rom = new Uint8Array(readFileSync(`${SCR}/kh358/kh358.nds`));
const out = rom.slice();
const byPath = ndsFileIdByPath(rom); const files = ndsFiles(rom);
const dec = new TextDecoder("latin1");
const EN = /\b(the|you|your|and|is|was|that|for|with|have|this|what|but|not|are)\b/gi;
const OTHER = /\b(der|die|das|und|ist|nicht|che|per|non|una|dans|vous|est|pas|para|que|con|los|sono|sei)\b/gi;
let patched = 0;
for (const [path, id] of byPath) {
  if (!path.startsWith("ev/") || !path.endsWith(".p2")) continue;
  const f = files[id]; const buf = rom.subarray(f.start, f.end);
  let s = -1;
  for (let i = 0; i <= buf.length; i++) {
    const b = i < buf.length ? buf[i] : 0;
    const pr = b >= 0x20 && b !== 0x7f;
    if (pr) { if (s < 0) s = i; continue; }
    if (s >= 0 && b === 0 && i - s >= 8) {
      const t = dec.decode(buf.subarray(s, i));
      if (/[A-Za-z]{3}/.test(t) && (t.match(EN) ?? []).length > (t.match(OTHER) ?? []).length) {
        const at = f.start + s;
        // بايت عالٍ منفرد (UTF-8 غير صالح) ثم É مُرمَّزة صحيحةً — بنفس عدد البايتات
        out[at] = 0xc9;             // منفرد
        out[at + 1] = 0xc3;         // É صالحة
        out[at + 2] = 0x89;
        patched++;
      }
    }
    s = -1;
  }
}
writeFileSync(`${SCR}/kh358/kh358_test.nds`, out);
console.log(`سطور مُرقَّعة: ${patched}`);
console.log("كل سطر يبدأ الآن بـ: [بايت 0xC9 منفرد][É بترميز UTF-8 صحيح]");
