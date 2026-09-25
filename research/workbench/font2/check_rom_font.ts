// Reads the three fonts back out of a built cartridge and compares the Arabic
// slots against both glyph sets, so the answer comes from the shipped bytes.
import { readFileSync } from "node:fs";
import { findNdsFile } from "@/lib/nds/nds-rom";
import { INAZUMA_GLYPH_INDICES, INAZUMA_FONT12_GLYPHS_B64, INAZUMA_FONT8_GLYPHS_B64 } from "@/lib/inazuma/inazuma-arabic-glyphs";

const oldSrc = readFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/font2/old-glyphs.ts", "utf-8");
const OLD12 = Buffer.from(oldSrc.match(/INAZUMA_FONT12_GLYPHS_B64 = "([^"]+)"/)![1], "base64");
const OLD8 = Buffer.from(oldSrc.match(/INAZUMA_FONT8_GLYPHS_B64 = "([^"]+)"/)![1], "base64");
const NEW12 = Buffer.from(INAZUMA_FONT12_GLYPHS_B64, "base64");
const NEW8 = Buffer.from(INAZUMA_FONT8_GLYPHS_B64, "base64");

const rom = new Uint8Array(readFileSync(process.argv[2]));
console.log(process.argv[2].split("/").pop());

for (const [path, oldSet, newSet, tile] of [
  ["data_iz/font/FONT12.NFTR", OLD12, NEW12, 17],
  ["data_iz/font/FONT12N.NFTR", OLD12, NEW12, 17],
  ["data_iz/font/FONT8.NFTR", OLD8, NEW8, 7],
] as const) {
  const f = findNdsFile(rom, path);
  if (!f) { console.log(`  ${path}: NOT FOUND`); continue; }
  const nftr = rom.subarray(f.start, f.end);
  const view = new DataView(nftr.buffer, nftr.byteOffset, nftr.byteLength);
  let p = 0x10, plgc = -1;
  while (p < nftr.length - 8) {
    const kind = String.fromCharCode(nftr[p], nftr[p + 1], nftr[p + 2], nftr[p + 3]);
    const size = view.getUint32(p + 4, true);
    if (!size) break;
    if (kind === "PLGC") plgc = p + 16;
    p += size;
  }
  let matchOld = 0, matchNew = 0, matchNeither = 0;
  INAZUMA_GLYPH_INDICES.forEach((gi, i) => {
    const inRom = Buffer.from(nftr.subarray(plgc + gi * tile, plgc + (gi + 1) * tile));
    if (inRom.equals(newSet.subarray(i * tile, (i + 1) * tile))) matchNew++;
    else if (inRom.equals(oldSet.subarray(i * tile, (i + 1) * tile))) matchOld++;
    else matchNeither++;
  });
  console.log(`  ${path}: new=${matchNew}  old=${matchOld}  neither=${matchNeither}  (of 125)`);
}
