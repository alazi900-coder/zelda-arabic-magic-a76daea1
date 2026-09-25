import { mkdirSync } from "node:fs";
import { openSfp, readEntry, renderEntry, widthCandidates } from "./l5img.mjs";
import { writePNG } from "./png_write.mjs";
const outDir = "out2"; mkdirSync(outDir, { recursive: true });
for (const file of process.argv.slice(2)) {
  const { data, entries } = openSfp(file);
  console.log(`\n${file}`);
  for (const e of entries) {
    let img;
    try { img = readEntry(data, e); } catch (err) { console.log(`  ${e.name}: ${err.message}`); continue; }
    const cells = img.map.length;
    if (!cells || !Number.isInteger(img.tileCount)) { console.log(`  ${e.name}: cells=${cells} tiles=${img.tileCount} — skipped`); continue; }
    const w = widthCandidates(cells)[0];
    const r = renderEntry(img, w);
    const safe = `${file.replace(/\W/g, "_")}__${e.name.replace(/\W/g, "_")}`;
    writePNG(`${outDir}/${safe}.png`, r.width, r.height, r.rgba);
    console.log(`  ${e.name.padEnd(16)} cells=${String(cells).padStart(5)} tiles=${String(img.tileCount).padStart(5)} -> ${r.width}x${r.height}  (other widths: ${widthCandidates(cells).slice(1,5).map(x=>x*8).join(", ")})`);
  }
}
