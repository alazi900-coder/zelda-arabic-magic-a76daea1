import { readFileSync } from "node:fs";
import { ndsFileIdByPath, ndsFiles } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/nds-rom";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const rom = new Uint8Array(readFileSync(`${SCR}/kh358/kh358.nds`));
const byPath = ndsFileIdByPath(rom); const files = ndsFiles(rom);
const dec = new TextDecoder("latin1");
const EN = /\b(the|you|your|and|is|was|that|for|with|have|this|what|but|not|are)\b/gi;
const OTHER = /\b(der|die|das|und|ist|nicht|che|per|non|una|dans|vous|est|pas|para|que|con|los|sono|sei)\b/gi;
const slack: number[] = []; const lens: number[] = [];
for (const [path, id] of byPath) {
  if (!path.startsWith("ev/") || !path.endsWith(".p2")) continue;
  const f = files[id]; const buf = rom.subarray(f.start, f.end);
  let s = -1;
  for (let i = 0; i <= buf.length; i++) {
    const b = i < buf.length ? buf[i] : 0;
    const pr = b >= 0x20 && b !== 0x7f;
    if (pr) { if (s < 0) s = i; continue; }
    if (s >= 0 && b === 0 && i - s >= 6) {
      const t = dec.decode(buf.subarray(s, i));
      if (/[A-Za-zÀ-ÿ]{3}/.test(t) && (t.match(EN) ?? []).length > (t.match(OTHER) ?? []).length) {
        // كم بايت صفر متتالٍ بعد نهاية السلسلة؟ (أوّلها هو الفاصل الإلزامي)
        let z = i;
        while (z < buf.length && buf[z] === 0) z++;
        lens.push(i - s);
        slack.push(z - i - 1);   // ما بعد الصفر الإلزامي = مساحة حرّة
      }
    }
    s = -1;
  }
}
slack.sort((a, b) => a - b);
const q = (p: number) => slack[Math.floor(slack.length * p)];
console.log(`سطور: ${slack.length}`);
console.log(`بايتات حرّة بعد كل سطر (زيادةً على الصفر الفاصل):`);
console.log(`  0%=${slack[0]}  25%=${q(0.25)}  وسيط=${q(0.5)}  75%=${q(0.75)}  90%=${q(0.9)}  الأقصى=${slack[slack.length - 1]}`);
console.log(`  متوسط = ${(slack.reduce((a, b) => a + b, 0) / slack.length).toFixed(2)} بايت`);
console.log(`  سطور بلا أي مساحة حرّة: ${((slack.filter((v) => v === 0).length / slack.length) * 100).toFixed(1)}%`);
