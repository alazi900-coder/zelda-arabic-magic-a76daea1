import { readFileSync } from "node:fs";
import { ndsFileIdByPath, ndsFiles } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/nds-rom";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const rom = new Uint8Array(readFileSync(`${SCR}/kh358/kh358.nds`));
const byPath = ndsFileIdByPath(rom);
const files = ndsFiles(rom);
const dec = new TextDecoder("latin1");
const EN = /\b(the|you|your|to|and|is|was|that|for|with|have|this|what|but|not|are|it's|I'm|don't)\b/gi;
const OTHER = /\b(der|die|das|und|ist|nicht|che|per|non|una|dans|vous|est|pas|para|que|con|los|und|aber|sono|sei)\b/gi;
let totalStrings = 0, enStrings = 0, enBytes = 0, filesSeen = 0;
for (const [path, id] of byPath) {
  if (!path.startsWith("ev/") || !path.endsWith(".p2")) continue;
  filesSeen++;
  const f = files[id];
  const buf = rom.subarray(f.start, f.end);
  let s = -1;
  for (let i = 0; i <= buf.length; i++) {
    const b = i < buf.length ? buf[i] : 0;
    const pr = b >= 0x20 && b !== 0x7f;
    if (pr) { if (s < 0) s = i; continue; }
    if (s >= 0 && b === 0 && i - s >= 6) {
      const t = dec.decode(buf.subarray(s, i));
      if (/[A-Za-zÀ-ÿ]{3}/.test(t) && /[ .,!?]/.test(t)) {
        totalStrings++;
        const en = (t.match(EN) ?? []).length, other = (t.match(OTHER) ?? []).length;
        if (en > other) { enStrings++; enBytes += i - s; }
      }
    }
    s = -1;
  }
}
console.log(`ملفات ev/*.p2        : ${filesSeen}`);
console.log(`سلاسل حوارية (كل اللغات): ${totalStrings}`);
console.log(`منها إنجليزية (تقديري)  : ${enStrings}  بحجم ${(enBytes / 1024).toFixed(0)} ك.ب`);
console.log(`متوسط طول السطر        : ${(enBytes / Math.max(1, enStrings)).toFixed(0)} بايت`);
