// The user's hand-drawn FONT12, and the copies made from it, into the ROM that
// already carries the fixed Arabic pictures and the Arabic song.
import { readFileSync, writeFileSync } from "node:fs";
import { findNdsFile, writeNdsFile } from "@/lib/nds/nds-rom";
const [, , basePath, dir, outPath] = process.argv;
let rom = new Uint8Array(readFileSync(basePath));
for (const name of ["FONT12", "FONT12N", "FONT12T"]) {
  const f = findNdsFile(rom, `data_iz/font/${name}.NFTR`)!;
  const data = new Uint8Array(readFileSync(`${dir}/out_${name}.NFTR`));
  if (data.length !== f.end - f.start) throw new Error(`${name}: size changed`);
  rom = writeNdsFile(rom, f, data);
  const back = rom.subarray(findNdsFile(rom, `data_iz/font/${name}.NFTR`)!.start, findNdsFile(rom, `data_iz/font/${name}.NFTR`)!.end);
  console.log(name, back.every((v, i) => v === data[i]) ? "written, reads back identical" : "MISMATCH");
}
writeFileSync(outPath, rom);
