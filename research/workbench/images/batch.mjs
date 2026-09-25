import { readdirSync, mkdirSync, rmSync } from "node:fs";
import { openSfp, readEntry, renderEntry } from "./l5img.mjs";
import { bestWidth } from "./guess.mjs";
import { writePNG } from "./png_write.mjs";

const SRC = "spf", OUT = "menu_png";
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const files = readdirSync(SRC).filter((f) => /^pic2d__(menu|title)__en__/.test(f));


let ok = 0, noMap = 0, failed = 0;
const report = [];
for (const file of files) {
  let bundle;
  try { bundle = openSfp(`${SRC}/${file}`); }
  catch (e) { failed++; report.push(`${file}: ${e.message}`); continue; }
  const base = file.replace(/^pic2d__(menu|title)__en__/, "").replace(/\.(SPF_|pac_)$/i, "");
  for (const e of bundle.entries) {
    try {
      const img = readEntry(bundle.data, e);
      if (!img.map.length) { noMap++; continue; }
      const tw = bestWidth(img).width;
      const r = renderEntry(img, tw);
      writePNG(`${OUT}/${base}__${e.name.replace(/\W/g, "_")}__${r.width}x${r.height}.png`, r.width, r.height, r.rgba);
      ok++;
    } catch (err) { failed++; report.push(`${file}/${e.name}: ${err.message}`); }
  }
}
console.log(`containers ${files.length}  images written ${ok}  entries without a map ${noMap}  failures ${failed}`);
report.slice(0, 10).forEach((r) => console.log("  " + r));
