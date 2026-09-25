// What the flat .STR tables actually hold, and how much room each slot has.
import { readFileSync } from "node:fs";
import { findNdsFile } from "@/lib/nds/nds-rom";
const rom = new Uint8Array(readFileSync(process.argv[2]));
for (const p of ["data_iz/logic/en/unitbase.STR", "data_iz/logic/en/item.STR",
                 "data_iz/logic/en/command.STR", "data_iz/logic/en/games.STR",
                 "data_iz/logic/en/rpgtitle.STR"]) {
  const f = findNdsFile(rom, p)!;
  const d = rom.subarray(f.start, f.end);
  // slots: runs of text separated by NUL padding; measure the gap to the next run
  const runs: { at: number; text: string; room: number }[] = [];
  let i = 0;
  while (i < d.length) {
    while (i < d.length && d[i] === 0) i++;
    if (i >= d.length) break;
    const start = i;
    while (i < d.length && d[i] !== 0) i++;
    const text = String.fromCharCode(...d.subarray(start, i));
    let j = i; while (j < d.length && d[j] === 0) j++;
    runs.push({ at: start, text, room: j - start });
  }
  const sample = runs.slice(0, 6).map((r) => `${JSON.stringify(r.text)}(${r.room})`).join(" ");
  console.log(`${p}  ${d.length} bytes, ${runs.length} strings`);
  console.log(`   ${sample}`);
}
