import { readFileSync } from "node:fs";
import { ndsFileIdByPath, ndsFiles } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/nds-rom";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const rom = new Uint8Array(readFileSync(`${SCR}/kh358/kh358.nds`));
const byPath = ndsFileIdByPath(rom); const files = ndsFiles(rom);
const dec = new TextDecoder("utf-8");
const NEEDLES = ["New Game", "Continue", "PRESS", "Press", "START", "Options", "Language", "Nintendo", "Mission", "Load"];
for (const [path, id] of byPath) {
  const f = files[id]; if (!f) continue;
  const size = f.end - f.start;
  if (size < 32 || size > 2_000_000) continue;
  const buf = rom.subarray(f.start, f.end);
  const txt = new TextDecoder("latin1").decode(buf);
  const found = NEEDLES.filter((n) => txt.includes(n));
  if (found.length >= 2) {
    console.log(`${path.padEnd(28)} ${String(size).padStart(8)}  ${found.join(", ")}`);
    for (const n of found.slice(0, 3)) {
      const at = txt.indexOf(n);
      console.log(`      @${f.start + at}  ${JSON.stringify(txt.slice(at - 10, at + 40).replace(/[\x00-\x1f]/g, "·"))}`);
    }
  }
}
