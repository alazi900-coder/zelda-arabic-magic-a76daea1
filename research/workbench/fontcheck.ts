import { readFileSync } from "fs";
import { findNdsFile } from "@/lib/nds/nds-rom";
import { parseNarc } from "@/lib/nds/narc";

const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds"));
const file = findNdsFile(rom, "graphic/pl_font.narc")!;
const narc = parseNarc(rom.subarray(file.start, file.end));
const buf = narc.files[1]; // font_message

function u32(b: Uint8Array, at: number) { return b[at] | (b[at+1]<<8) | (b[at+2]<<16) | (b[at+3]<<24); }
const size = u32(buf, 0), widthTableOffset = u32(buf, 4), numGlyphs = u32(buf, 8);
console.log({ size, widthTableOffset, numGlyphs, maxW: buf[0xC], maxH: buf[0xD], tileW: buf[0xE], tileH: buf[0xF] });
console.log("total len", buf.length, "expected", widthTableOffset + numGlyphs);

// widthTable byte for slot X should equal glyphWidths[X] from res/fonts/font_message.json
const meta = JSON.parse(readFileSync("/home/user/decomps/pokeplatinum/res/fonts/font_message.json", "utf8"));
let mismatches = 0;
for (let slot = 0; slot < numGlyphs; slot++) {
  const got = buf[widthTableOffset + slot];
  const want = meta.glyphWidths[slot];
  if (got !== want) { if (mismatches < 5) console.log("mismatch at", slot, "got", got, "want", want); mismatches++; }
}
console.log("width-table mismatches:", mismatches, "of", numGlyphs);
