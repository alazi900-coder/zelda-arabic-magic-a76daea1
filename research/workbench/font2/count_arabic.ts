// Counts how many text rows carry the two-byte codes the Arabic encoder emits,
// which is what "this ROM holds a translation" actually means on this cartridge.
import { readFileSync } from "node:fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
import { INAZUMA_SHIFT_JIS_CODES } from "@/lib/inazuma/inazuma-arabic-glyphs";

// readInazumaText decodes the 2-byte codes as their Shift-JIS characters, so
// build the same character set to test against.
const arabicChars = new Set(INAZUMA_SHIFT_JIS_CODES.map((code) => {
  const buf = Buffer.from([code >> 8, code & 0xff]);
  return new TextDecoder("shift-jis").decode(buf);
}));

const rows = readInazumaText(new Uint8Array(readFileSync(process.argv[2])));
let hits = 0;
const samples: string[] = [];
for (const r of rows) {
  if (![...r.text].some((c) => arabicChars.has(c))) continue;
  hits++;
  if (samples.length < 3) samples.push(r.text.slice(0, 40));
}
console.log(`${process.argv[2].split("/").pop()}: ${hits} rows carry Arabic codes (of ${rows.length})`);
samples.forEach((s) => console.log("   ", JSON.stringify(s)));
