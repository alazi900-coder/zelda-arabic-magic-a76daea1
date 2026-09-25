// Does the .dat beside a .STR hold offsets into it? If it does, a translation
// that outgrows its slot can be moved to the end of the file and pointed at,
// instead of being refused for being two bytes too long.
import { readFileSync } from "node:fs";
import { findNdsFile } from "@/lib/nds/nds-rom";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const get = (p: string) => { const f = findNdsFile(rom, p)!; return rom.subarray(f.start, f.end); };

for (const base of ["unitbase", "item", "command", "games", "rpgtitle"]) {
  const str = get(`data_iz/logic/en/${base}.STR`);
  const dat = get(`data_iz/logic/en/${base}.dat`);
  // every offset in .STR where a string starts
  const starts = new Set<number>();
  for (let i = 0; i < str.length; i++) if (str[i] !== 0 && (i === 0 || str[i - 1] === 0)) starts.add(i);
  const dv = new DataView(dat.buffer, dat.byteOffset, dat.length);
  let hit32 = 0, tot32 = 0;
  for (let i = 0; i + 4 <= dat.length; i += 4) { const v = dv.getUint32(i, true); if (v && v < str.length) { tot32++; if (starts.has(v)) hit32++; } }
  console.log(`${base}: .STR ${str.length}b, ${starts.size} strings | .dat ${dat.length}b  u32 in range ${tot32}, of which land on a string start ${hit32}`);
}
