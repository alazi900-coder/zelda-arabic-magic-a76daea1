import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { lz77Decompress, parseSfp } from "./sfp_decode.mjs";
import { readEntry, renderEntry } from "./l5img.mjs";
import { writePNG } from "./png_write.mjs";
const rows = [];
for (const file of readdirSync("packed")) {
  const group = file.replace(/\.SPF_$/, "");
  const raw = lz77Decompress(new Uint8Array(readFileSync(`packed/${file}`)));
  const list = parseSfp(raw);
  const dir = `ar_out/${group}`;
  if (!existsSync(dir)) continue;
  for (const png of readdirSync(dir).filter(f => f.endsWith(".png"))) {
    const m = png.match(/^(.*)__(\d+)x(\d+)\.png$/); if (!m) continue;
    const e = list.find(x => x.name.replace(/\W/g,"_") === m[1]); if (!e) continue;
    const img = renderEntry(readEntry(raw, e), +m[2] / 8);
    writePNG(`check2/${group}__${m[1]}.png`, img.width, img.height, img.rgba);
    rows.push(`check2/${group}__${m[1]}.png ${dir}/${png}`);
  }
}
writeFileSync("check2/list.txt", rows.join("\n"));
console.log(rows.length);
