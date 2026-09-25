// Clean cartridge + the new Arabic fonts + the Arabic song + every container
// whose pictures were redrawn. No translation: the text stays as it was.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { patchInazumaFonts } from "@/lib/inazuma/inazuma-editor-bridge";
import { ndsFileIdByPath, findNdsFile, writeNdsFile } from "@/lib/nds/nds-rom";

const [, , basePath, songPath, packedDir, outPath] = process.argv;
const SONG_RANGES: [number, number][] = [[0x1E370C, 0x1E370F], [0x8F1E70F, 0x91FD4AF]];

let rom = patchInazumaFonts(new Uint8Array(readFileSync(basePath)));
const song = new Uint8Array(readFileSync(songPath));
const withSong = rom.slice();
for (const [start, end] of SONG_RANGES) withSong.set(song.subarray(start, end), start);
rom = withSong;

// The dumped names flattened the path with "__"; match them back by tail.
const byTail = new Map<string, string>();
for (const p of ndsFileIdByPath(rom).keys()) byTail.set(p.replace(/^data_iz\//, "").replace(/\//g, "__"), p);

let n = 0, grew = 0;
for (const file of readdirSync(packedDir)) {
  const target = byTail.get(file);
  if (!target) { console.log(`  no path for ${file}`); continue; }
  const f = findNdsFile(rom, target);
  if (!f) { console.log(`  missing in rom: ${target}`); continue; }
  const data = new Uint8Array(readFileSync(`${packedDir}/${file}`));
  if (data.length > f.end - f.start) grew++;
  rom = writeNdsFile(rom, f, data);
  n++;
}
console.log(`containers written ${n} (of which ${grew} grew and were relocated)`);
writeFileSync(outPath, rom);
console.log("wrote", outPath, rom.length, "bytes");
