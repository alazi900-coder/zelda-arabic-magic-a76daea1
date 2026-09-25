import { readFileSync } from "node:fs";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const buf = new Uint8Array(readFileSync(`${SCR}/kh358/EV_TT.p2`));
const dec = new TextDecoder("latin1");
// امشِ على الكتلة النصّية سلسلةً سلسلة من أول سطر حوار
const START = 18333;
let p = START;
const out: string[] = [];
for (let n = 0; n < 24 && p < buf.length; n++) {
  const e = buf.indexOf(0, p);
  if (e < 0) break;
  out.push(`[${n}] @${p} ${JSON.stringify(dec.decode(buf.subarray(p, e)).replace(/[\x00-\x1f]/g, "·").slice(0, 70))}`);
  p = e + 1;
  while (p < buf.length && buf[p] === 0) p++;   // تخطَّ الحشو
}
console.log(out.join("\n"));
