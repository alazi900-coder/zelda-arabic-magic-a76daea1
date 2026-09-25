// Every string in the flat tables, with the room its slot actually has, so a
// translation can be checked against the space before anything is written.
import { readFileSync, writeFileSync } from "node:fs";
import { findNdsFile } from "@/lib/nds/nds-rom";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const out: Record<string, { at: number; room: number; text: string }[]> = {};
for (const base of ["unitbase", "item", "command", "games", "rpgtitle"]) {
  const p = `data_iz/logic/en/${base}.STR`;
  const f = findNdsFile(rom, p)!;
  const d = rom.subarray(f.start, f.end);
  const rows: { at: number; room: number; text: string }[] = [];
  let i = 0;
  while (i < d.length) {
    while (i < d.length && d[i] === 0) i++;
    if (i >= d.length) break;
    const at = i;
    while (i < d.length && d[i] !== 0) i++;
    const text = String.fromCharCode(...d.subarray(at, i));
    let j = i; while (j < d.length && d[j] === 0) j++;
    rows.push({ at, room: j - at, text });
  }
  out[base] = rows;
  console.log(`${base}: ${rows.length} strings, rooms ${[...new Set(rows.map(r => r.room))].sort((a,b)=>a-b).slice(0,8).join("/")}...`);
}
writeFileSync(process.argv[3], JSON.stringify(out));
