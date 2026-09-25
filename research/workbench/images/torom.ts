// Clean cartridge + the new Arabic fonts + the Arabic song + the two redrawn
// pictures. No translation: the text stays as the cartridge has it.
import { readFileSync, writeFileSync } from "node:fs";
import { patchInazumaFonts } from "@/lib/inazuma/inazuma-editor-bridge";
import { findNdsFile, writeNdsFile } from "@/lib/nds/nds-rom";

const [, , basePath, songPath, outPath, ...images] = process.argv;
const SONG_RANGES: [number, number][] = [[0x1E370C, 0x1E370F], [0x8F1E70F, 0x91FD4AF]];
const SFP_DIR = "data_iz/pic2d/title/en/";

let rom = patchInazumaFonts(new Uint8Array(readFileSync(basePath)));

const song = new Uint8Array(readFileSync(songPath));
const withSong = rom.slice();
for (const [start, end] of SONG_RANGES) withSong.set(song.subarray(start, end), start);
rom = withSong;

for (const spec of images) {
  const [name, file] = spec.split("=");
  const target = SFP_DIR + name;
  const f = findNdsFile(rom, target);
  if (!f) throw new Error(`الروم لا يحتوي على ${target}`);
  const data = new Uint8Array(readFileSync(file));
  console.log(`${target}: ${f.end - f.start} -> ${data.length} بايت`);
  rom = writeNdsFile(rom, f, data);
}

writeFileSync(outPath, rom);
console.log("wrote", outPath, rom.length, "bytes");
