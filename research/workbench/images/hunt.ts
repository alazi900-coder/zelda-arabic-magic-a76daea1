// Sweeps every file in the cartridge -- raw, and again after LZ77 -- for the
// UI words that are still in English, so we learn whether each one is text at
// all or has to be a picture.
import { readFileSync } from "node:fs";
import { ndsFileIdByPath, findNdsFile } from "@/lib/nds/nds-rom";
import { lz77Decompress } from "../images/sfp_decode.mjs";

const rom = new Uint8Array(readFileSync(process.argv[2]));
const words = process.argv.slice(3);
const pats = words.map((w) => new TextEncoder().encode(w));
const found: Record<string, string[]> = {};
for (const w of words) found[w] = [];

const has = (buf: Uint8Array, pat: Uint8Array) => {
  outer: for (let i = 0; i + pat.length <= buf.length; i++) {
    if (buf[i] !== pat[0]) continue;
    for (let k = 1; k < pat.length; k++) if (buf[i + k] !== pat[k]) continue outer;
    return true;
  }
  return false;
};

for (const p of ndsFileIdByPath(rom).keys()) {
  const f = findNdsFile(rom, p);
  if (!f) continue;
  const raw = rom.subarray(f.start, f.end);
  const views: [string, Uint8Array][] = [["", raw]];
  if (raw[0] === 0x10) { try { views.push([" (LZ77)", lz77Decompress(raw)]); } catch {} }
  for (let i = 0; i < words.length; i++)
    for (const [tag, buf] of views)
      if (found[words[i]].length < 6 && has(buf, pats[i])) { found[words[i]].push(p + tag); break; }
}
for (const w of words) console.log(`${w}: ${found[w].length ? found[w].join(", ") : "NOT FOUND as text"}`);
