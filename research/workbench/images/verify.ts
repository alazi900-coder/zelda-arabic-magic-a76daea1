// Reads the pictures back out of the built cartridge, so what is checked is the
// bytes the game will load rather than the files that went in.
import { readFileSync } from "node:fs";
import { findNdsFile } from "@/lib/nds/nds-rom";
const rom = new Uint8Array(readFileSync(process.argv[2]));
for (const name of ["MTSIni.SPF_", "STSIni.SPF_"]) {
  const f = findNdsFile(rom, `data_iz/pic2d/title/en/${name}`);
  if (!f) { console.log(`${name}: MISSING`); continue; }
  const inRom = rom.subarray(f.start, f.end);
  const mine = new Uint8Array(readFileSync(`${process.argv[3]}/${name}`));
  let same = inRom.length === mine.length;
  if (same) for (let i = 0; i < mine.length; i++) if (inRom[i] !== mine[i]) { same = false; break; }
  console.log(`${name}: ${inRom.length} bytes in the cartridge, identical to what was packed: ${same}`);
}
