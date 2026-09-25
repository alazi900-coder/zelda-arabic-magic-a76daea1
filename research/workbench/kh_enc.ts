import { readFileSync } from "node:fs";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const buf = new Uint8Array(readFileSync(`${SCR}/kh358/EV_TT.p2`));
const lat = new TextDecoder("latin1");
const utf8 = new TextDecoder("utf-8", { fatal: false });
// خذ سلاسل فيها بايتات فوق 0x7F وقارن التفسيرين
let shown = 0;
let s = -1;
for (let i = 0; i <= buf.length && shown < 6; i++) {
  const b = i < buf.length ? buf[i] : 0;
  const pr = b >= 0x20 && b !== 0x7f;
  if (pr) { if (s < 0) s = i; continue; }
  if (s >= 0 && b === 0 && i - s >= 10) {
    const raw = buf.subarray(s, i);
    if ([...raw].some((x) => x > 0x7f)) {
      console.log(`@${s}`);
      console.log(`   latin1: ${JSON.stringify(lat.decode(raw).slice(0, 60))}`);
      console.log(`   utf-8 : ${JSON.stringify(utf8.decode(raw).slice(0, 60))}`);
      shown++;
    }
  }
  s = -1;
}
