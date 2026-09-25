// Where in the cartridge does a literal string live? Searches the raw image and
// names the file whose range each hit falls in.
import { readFileSync } from "node:fs";
import { ndsFileIdByPath, findNdsFile } from "@/lib/nds/nds-rom";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const paths = [...ndsFileIdByPath(rom).keys()];
const ranges = paths.map((p) => ({ p, f: findNdsFile(rom, p)! })).filter((r) => r.f);
const owner = (off: number) => ranges.find((r) => off >= r.f.start && off < r.f.end)?.p ?? "(outside any file)";

for (const needle of process.argv.slice(3)) {
  const pat = new TextEncoder().encode(needle);
  const hits: number[] = [];
  outer: for (let i = 0; i + pat.length <= rom.length; i++) {
    if (rom[i] !== pat[0]) continue;
    for (let k = 1; k < pat.length; k++) if (rom[i + k] !== pat[k]) continue outer;
    hits.push(i);
    if (hits.length >= 12) break;
  }
  console.log(`${needle}: ${hits.length} hit(s)`);
  for (const h of hits) console.log(`   0x${h.toString(16)}  ${owner(h)}`);
}
