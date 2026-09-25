import { readdirSync, mkdirSync, rmSync } from "node:fs";
import { openSfp, readEntry, renderEntry } from "./l5img.mjs";
import { bestWidth } from "./guess.mjs";
import { writePNG } from "./png_write.mjs";
const SRC = "spf", OUT = "all_png";
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const files = readdirSync(SRC).filter((f) => /\.SPF_$/i.test(f));
let ok = 0, skip = 0, fail = 0;
for (const file of files) {
  let b; try { b = openSfp(`${SRC}/${file}`); } catch { fail++; continue; }
  const group = file.replace(/\.SPF_$/i, "");
  mkdirSync(`${OUT}/${group}`, { recursive: true });
  for (const e of b.entries) {
    try {
      const img = readEntry(b.data, e);
      if (!img.map.length || !Number.isInteger(img.tileCount) || img.tileCount < 1) { skip++; continue; }
      const tw = bestWidth(img).width;
      const r = renderEntry(img, tw);
      writePNG(`${OUT}/${group}/${e.name.replace(/\W/g, "_")}__${r.width}x${r.height}.png`, r.width, r.height, r.rgba);
      ok++;
    } catch { fail++; }
  }
}
console.log(`containers ${files.length}  images ${ok}  skipped ${skip}  failed ${fail}`);
