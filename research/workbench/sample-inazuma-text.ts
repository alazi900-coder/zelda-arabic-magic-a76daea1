import { readFileSync, writeFileSync } from "node:fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";

const romPath = process.argv[2];
const rom = new Uint8Array(readFileSync(romPath));
const rows = readInazumaText(rom);
console.log("total rows:", rows.length);
console.log("by source:", Object.entries(
  rows.reduce((acc: Record<string, number>, r) => { acc[r.source] = (acc[r.source]||0)+1; return acc; }, {})
));

// Dump everything to a file for pattern scanning.
writeFileSync(
  "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/all_text_rows.json",
  JSON.stringify(rows, null, 0)
);
console.log("dumped");
