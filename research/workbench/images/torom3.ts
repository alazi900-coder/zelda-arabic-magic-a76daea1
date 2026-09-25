// Writes the rebuilt containers into a ROM that is already patched: the one
// the cartridge was confirmed good on, so the fonts and the song come along
// untouched and only the pictures change.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { ndsFileIdByPath, findNdsFile, writeNdsFile } from "@/lib/nds/nds-rom";

const [, , basePath, packedDir, outPath] = process.argv;
let rom = new Uint8Array(readFileSync(basePath));
const byTail = new Map<string, string>();
for (const p of ndsFileIdByPath(rom).keys()) byTail.set(p.replace(/^data_iz\//, "").replace(/\//g, "__"), p);

let n = 0, grew = 0, missing = 0;
for (const file of readdirSync(packedDir)) {
  const target = byTail.get(file);
  if (!target) { console.log(`  no path for ${file}`); missing++; continue; }
  const f = findNdsFile(rom, target);
  if (!f) { console.log(`  missing in rom: ${target}`); missing++; continue; }
  const data = new Uint8Array(readFileSync(`${packedDir}/${file}`));
  if (data.length > f.end - f.start) grew++;
  rom = writeNdsFile(rom, f, data);
  n++;
}
console.log(`containers written ${n} (grew ${grew})  missing ${missing}`);
writeFileSync(outPath, rom);
console.log("wrote", outPath, rom.length, "bytes");
