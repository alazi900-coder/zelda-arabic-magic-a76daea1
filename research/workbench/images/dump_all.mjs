import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { lz77Decompress, parseSfp, decodeEntry } from "./sfp_decode.mjs";
import { writePNG } from "./png_write.mjs";

const file = process.argv[2];
const outDir = process.argv[3];
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const raw = readFileSync(file);
const decompressed = lz77Decompress(raw);
const entries = parseSfp(decompressed);
console.log(`${file}: ${entries.length} entries`);

for (const e of entries) {
  const bytes = decompressed.subarray(e.dataOffset, e.dataOffset + e.size);
  const pixelBytes = e.size - 64; // minus 32-byte header, minus 32-byte palette
  const numTiles = pixelBytes / 32;
  if (numTiles < 1 || !Number.isInteger(numTiles)) {
    console.log(`  ${e.name}: size=${e.size} -- odd tile count (${numTiles}), skipping`);
    continue;
  }
  // Try a handful of plausible tile widths that evenly divide the tile count,
  // so the result is always a clean rectangle instead of a ragged guess.
  const candidates = [2, 3, 4, 5, 6, 8, 10, 12].filter((tw) => tw <= numTiles && numTiles % tw === 0);
  if (candidates.length === 0) candidates.push(numTiles); // single row fallback
  for (const tw of candidates) {
    const { width, height, rgba } = decodeEntry(bytes, tw);
    const safe = e.name.replace(/[^\w.-]/g, "_");
    writePNG(`${outDir}/${safe}__tw${tw}_${width}x${height}.png`, width, height, rgba);
  }
  console.log(`  ${e.name}: size=${e.size}, tiles=${numTiles}, tried widths ${candidates.join(",")}`);
}
