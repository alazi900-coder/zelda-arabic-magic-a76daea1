// Same hunt, but through every pack in the cartridge, decoded the way the game
// stores its strings.
import { readFileSync } from "node:fs";
import { ndsFileIdByPath, findNdsFile } from "@/lib/nds/nds-rom";
import { readPack } from "@/lib/inazuma/inazuma-pack";

const rom = new Uint8Array(readFileSync(process.argv[2]));
const words = process.argv.slice(3);
const paths = [...ndsFileIdByPath(rom).keys()];
const bytes = (p: string) => { const f = findNdsFile(rom, p)!; return rom.subarray(f.start, f.end); };
const hits: Record<string, Set<string>> = {};
for (const w of words) hits[w] = new Set();

for (const pkh of paths.filter((p) => p.endsWith(".pkh"))) {
  const pkb = pkh.replace(/\.pkh$/, ".pkb");
  if (!paths.includes(pkb)) continue;
  let parsed;
  try { parsed = readPack(bytes(pkh), bytes(pkb)); } catch { continue; }
  let n = 0;
  for (const e of parsed.entries) for (const s of e.strings) {
    n++;
    for (const w of words) if (s.text.includes(w)) hits[w].add(pkh);
  }
  if (n) console.log(`  ${pkh}: ${n} strings`);
}
console.log("---");
for (const w of words) console.log(`${w}: ${[...hits[w]].join(", ") || "not in any pack"}`);
