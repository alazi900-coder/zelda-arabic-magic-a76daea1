import { readFileSync, writeFileSync } from "node:fs";
import { findNdsFile, writeNdsFile } from "@/lib/nds/nds-rom";
import { readInazumaText, writeInazumaText } from "@/lib/inazuma/inazuma-rom";
import { patchInazumaFont12, patchInazumaFont8 } from "@/lib/inazuma/inazuma-arabic-font";
import { encodeInazumaArabicText } from "@/lib/inazuma/inazuma-arabic-font";
import { processArabicText } from "@/lib/arabic-processing";

const [romPath, outPath] = process.argv.slice(2);
let rom = new Uint8Array(readFileSync(romPath));

// 1. Patch glyphs into the three fonts that share these two shapes.
for (const path of ["data_iz/font/FONT12.NFTR", "data_iz/font/FONT12N.NFTR"]) {
  const file = findNdsFile(rom, path)!;
  const patched = patchInazumaFont12(rom.subarray(file.start, file.end));
  rom = writeNdsFile(rom, file, patched);
}
{
  const file = findNdsFile(rom, "data_iz/font/FONT8.NFTR")!;
  const patched = patchInazumaFont8(rom.subarray(file.start, file.end));
  rom = writeNdsFile(rom, file, patched);
}
console.log("fonts patched");

// 2. Encode the test phrase and drop it into the same unitbase.STR slot the
//    earlier [TEST 1] proof used -- visible on the player info screen.
const shaped = processArabicText("مرحباً بكم في اينازوما اليفن");
const { text: encoded, missing } = encodeInazumaArabicText(shaped);
console.log("missing glyphs:", missing);
if (missing.length) throw new Error("ناقصة رموز: " + missing.join(" "));

const rows = readInazumaText(rom);
const target = rows.find((r) => r.source === "unitbase" && r.text.startsWith("No one has more love"))!;
const edited = rows.map((r) => (r === target ? { ...r, text: encoded } : r));
const result = writeInazumaText(rom, edited);
console.log("changed:", result.changed, "warnings:", result.warnings);

writeFileSync(outPath, result.rom);
console.log("written", outPath);
