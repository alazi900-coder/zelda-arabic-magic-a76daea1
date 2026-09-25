import { readFileSync } from "node:fs";
import { ndsFileIdByPath, ndsFiles } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/nds-rom";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const rom = new Uint8Array(readFileSync(`${SCR}/kh358/kh358.nds`));
const byPath = ndsFileIdByPath(rom);
const files = ndsFiles(rom);
// كلمات إنجليزية شائعة في نصوص اللعبة
const NEEDLES = ["Roxas", "Keyblade", "Heartless", "Organization", "the ", "you "];
type Hit = { path: string; size: number; score: number; sample: string };
const hits: Hit[] = [];
for (const [path, id] of byPath) {
  const f = files[id];
  if (!f) continue;
  const size = f.end - f.start;
  if (size < 64 || size > 4_000_000) continue;
  const buf = rom.subarray(f.start, f.end);
  // فحص ASCII و UTF-16LE معاً
  const ascii = new TextDecoder("latin1").decode(buf);
  const utf16 = new TextDecoder("utf-16le").decode(buf.subarray(0, Math.min(buf.length, 400000)));
  let score = 0; let sample = "";
  for (const text of [ascii, utf16]) {
    for (const needle of NEEDLES) {
      const n = text.split(needle).length - 1;
      if (n > 0) { score += n; if (!sample) { const at = text.indexOf(needle); sample = text.slice(Math.max(0, at - 30), at + 50).replace(/[\x00-\x1f]/g, "·"); } }
    }
  }
  if (score > 3) hits.push({ path, size, score, sample });
}
hits.sort((a, b) => b.score - a.score);
console.log("ملفات تبدو نصّية:", hits.length);
for (const h of hits.slice(0, 20)) console.log(`  ${h.path.padEnd(30)} ${String(h.size).padStart(8)}  نقاط=${h.score}\n      «${h.sample}»`);
