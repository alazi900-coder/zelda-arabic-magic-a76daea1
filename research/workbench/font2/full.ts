// One cartridge carrying everything: the existing translation, the new fonts,
// and the Arabic opening song.
//
// The song lives in two byte ranges, measured by diffing the song build against
// the stock cartridge: three bytes in the file table and the SAD audio itself.
// Nothing else in that build differs, so copying those ranges moves the song
// without dragging any of its other state along.
import { readFileSync, writeFileSync } from "node:fs";
import { patchInazumaFonts } from "@/lib/inazuma/inazuma-editor-bridge";

const [, , translatedPath, songPath, outPath] = process.argv;
const SONG_RANGES: [number, number][] = [[0x1E370C, 0x1E370F], [0x8F1E70F, 0x91FD4AF]];

const withFonts = patchInazumaFonts(new Uint8Array(readFileSync(translatedPath)));
const song = new Uint8Array(readFileSync(songPath));
const out = withFonts.slice();
for (const [start, end] of SONG_RANGES) out.set(song.subarray(start, end), start);
writeFileSync(outPath, out);
console.log("wrote", outPath, out.length, "bytes");
