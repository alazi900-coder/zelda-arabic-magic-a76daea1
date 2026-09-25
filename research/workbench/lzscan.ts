import { readFileSync } from "fs";
import { decompressGbaLz77, findGbaLz77Blocks } from "@/lib/gba/gba-lz77";
import { findNdsFile } from "@/lib/nds/nds-rom";
import { parseNarc } from "@/lib/nds/narc";

const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds"));
const file = findNdsFile(rom, "graphic/pl_font.narc")!;
const narc = parseNarc(rom.subarray(file.start, file.end));
console.log("subfiles", narc.files.length, narc.files.map(f => f.length));

// font_message is index 1
const buf = narc.files[1];
console.log("first 32 bytes:", Buffer.from(buf.slice(0, 32)).toString("hex"));

const blocks = findGbaLz77Blocks(buf, 0x1000, 0x20000);
console.log("candidate LZ77 blocks:", blocks);
for (const b of blocks) {
  const out = decompressGbaLz77(buf, b.at, 0x20000);
  console.log("  at", b.at, "->", out?.length);
}

console.log("--- manual probe ---");
for (const at of [12, 13, 14, 16]) {
  console.log("at", at, "byte", buf[at], "size3", buf[at+1] | (buf[at+2]<<8) | (buf[at+3]<<16));
  const out = decompressGbaLz77(buf, at, 0x30000);
  console.log("  decompress ->", out?.length);
}
