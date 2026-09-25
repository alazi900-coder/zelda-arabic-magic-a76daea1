import { mkdirSync, rmSync } from "node:fs";
import { openSfp, readEntry, renderEntry, widthCandidates } from "./l5img.mjs";
import { writePNG } from "./png_write.mjs";
const DIR = "export_iz"; rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true });
// Widths confirmed by eye; anything else gets the divisor nearest 16 tiles.
const FORCED = { 496: 31, 352: 32, 160: 20, 130: 13 };
for (const file of process.argv.slice(2)) {
  const { data, entries } = openSfp(file);
  for (const e of entries) {
    const img = readEntry(data, e);
    if (!img.map.length) { console.log(`  ${e.name}: no tile map — skipped`); continue; }
    const cells = img.map.length;
    const main = FORCED[cells] ?? widthCandidates(cells).sort((a, b) => Math.abs(a - 16) - Math.abs(b - 16))[0];
    const tried = [main, ...widthCandidates(cells).filter((w) => w !== main && w >= 4 && w <= 64).slice(0, 3)];
    for (const [i, tw] of tried.entries()) {
      const r = renderEntry(img, tw);
      const tag = i === 0 ? "" : `__alt${r.width}x${r.height}`;
      writePNG(`${DIR}/${e.name.replace(/\W/g, "_")}${tag}.png`, r.width, r.height, r.rgba);
    }
    console.log(`  ${e.name.padEnd(16)} ${main * 8}x${(cells / main) * 8}   (+${tried.length - 1} بدائل عرض)`);
  }
}
