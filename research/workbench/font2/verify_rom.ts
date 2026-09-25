// Reads the fonts back out of the built cartridge and draws from them, so what
// is checked is the bytes the game will load, not the source constants.
import { readFileSync, writeFileSync } from "node:fs";
import { findNdsFile } from "@/lib/nds/nds-rom";
import { INAZUMA_GLYPH_INDICES, INAZUMA_ARABIC_CODEPOINTS } from "@/lib/inazuma/inazuma-arabic-glyphs";
import { reshapeArabic, reverseBidi } from "@/lib/arabic-processing";

const rom = new Uint8Array(readFileSync(process.argv[2]));

function blocks(nftr: Uint8Array) {
  const view = new DataView(nftr.buffer, nftr.byteOffset, nftr.byteLength);
  let p = 0x10, plgc = -1, hdwc = -1, cellW = 0, cellH = 0, tile = 0;
  while (p < nftr.length - 8) {
    const kind = String.fromCharCode(nftr[p], nftr[p + 1], nftr[p + 2], nftr[p + 3]);
    const size = view.getUint32(p + 4, true);
    if (!size) break;
    if (kind === "PLGC") { cellW = nftr[p + 8]; cellH = nftr[p + 9]; tile = view.getUint16(p + 10, true); plgc = p + 16; }
    if (kind === "HDWC") hdwc = p + 16;
    p += size;
  }
  return { plgc, hdwc, cellW, cellH, tile };
}

const shaped = [...reverseBidi(reshapeArabic(process.argv[4] ?? "اضغط على الزر"))].map((c) => c.codePointAt(0)!);
const slotOf = new Map(INAZUMA_ARABIC_CODEPOINTS.map((cp, i) => [cp, i]));

for (const path of ["data_iz/font/FONT12.NFTR", "data_iz/font/FONT12N.NFTR", "data_iz/font/FONT8.NFTR"]) {
  const f = findNdsFile(rom, path);
  if (!f) { console.log(path, "NOT FOUND"); continue; }
  const nftr = rom.subarray(f.offset, f.offset + f.length);
  const { plgc, hdwc, cellW, cellH, tile } = blocks(nftr);
  const px = (gi: number, x: number, y: number) => {
    const b = y * cellW + x;
    return (nftr[plgc + gi * tile + (b >> 3)] >> (7 - (b & 7))) & 1;
  };
  console.log(`\n${path}  ${cellW}x${cellH} tile=${tile}`);
  const lines: string[] = Array.from({ length: cellH }, () => "");
  for (const cp of shaped) {
    if (cp === 32) { for (let y = 0; y < cellH; y++) lines[y] += "   "; continue; }
    const slot = slotOf.get(cp);
    if (slot === undefined) { for (let y = 0; y < cellH; y++) lines[y] += " ? "; continue; }
    const gi = INAZUMA_GLYPH_INDICES[slot];
    const w = nftr[hdwc + gi * 3 + 1];
    for (let y = 0; y < cellH; y++) {
      let s = "";
      for (let x = 0; x < w; x++) s += px(gi, x, y) ? "#" : ".";
      lines[y] += s + " ";
    }
  }
  lines.forEach((l) => console.log("  " + l));
}
