import { readFileSync } from "fs";
import { extractInazumaEntries } from "@/lib/inazuma/inazuma-editor-bridge";
import { categorizeInazumaEntry } from "@/lib/inazuma/inazuma-categories";
import { readInazumaText, writeInazumaText } from "@/lib/inazuma/inazuma-rom";
const rom = new Uint8Array(readFileSync(process.env.ROM!));
const { entries } = extractInazumaEntries(rom);
const bySrc = new Map<string, number>(), byCat = new Map<string, number>();
for (const e of entries) {
  bySrc.set(e.msbtFile, (bySrc.get(e.msbtFile) ?? 0) + 1);
  const c = categorizeInazumaEntry(e); byCat.set(c, (byCat.get(c) ?? 0) + 1);
}
console.log([...bySrc]); console.log([...byCat]);
for (const src of ["inazuma/pshort", "inazuma/skey", "inazuma/blogp", "inazuma/games", "inazuma/shout", "inazuma/school"]) {
  const e = entries.filter((x) => x.msbtFile === src).slice(0, 3);
  console.log(src, e.map((x) => [x.index, x.original, x.maxBytes]));
}
const rows = readInazumaText(rom);
const same = writeInazumaText(rom, rows);
console.log("roundtrip identical", same.changed, same.warnings.length, same.rom === rom || Buffer.compare(Buffer.from(same.rom), Buffer.from(rom)) === 0);
