import { readFileSync, readdirSync } from "node:fs";
import { ndsFileIdByPath, findNdsFile } from "@/lib/nds/nds-rom";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const dir = process.argv[3];
const byTail = new Map<string, string>();
for (const p of ndsFileIdByPath(rom).keys()) byTail.set(p.replace(/^data_iz\//, "").replace(/\//g, "__"), p);
let same = 0, diff = 0;
for (const file of readdirSync(dir)) {
  const f = findNdsFile(rom, byTail.get(file)!);
  if (!f) { diff++; continue; }
  const inRom = rom.subarray(f.start, f.end);
  const mine = new Uint8Array(readFileSync(`${dir}/${file}`));
  let ok = inRom.length === mine.length;
  if (ok) for (let i = 0; i < mine.length; i++) if (inRom[i] !== mine[i]) { ok = false; break; }
  ok ? same++ : diff++;
}
console.log(`containers identical to what was packed: ${same}   mismatched: ${diff}`);
