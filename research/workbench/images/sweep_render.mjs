import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { readEntry, renderEntry, widthCandidates } from "./l5img.mjs";
import { allContainers, containerEntries } from "./allimg.mjs";
import { writePNG } from "./png_write.mjs";

rmSync("sweep", { recursive: true, force: true });
mkdirSync("sweep", { recursive: true });
const index = [];
for (const file of allContainers()) {
  let c; try { c = containerEntries(file); } catch { continue; }
  if (!c) continue;
  const group = file.replace(/\.(SPF_|pac_)$/i, "");
  for (const e of c.entries) {
    let img; try { img = readEntry(c.raw, e); } catch { continue; }
    const cells = img.map.length;
    if (!cells || !Number.isInteger(cells) || cells > 4096) continue;
    const ws = widthCandidates(cells).filter((w) => w * 8 <= 512 && (cells / w) * 8 <= 512);
    for (const w of ws) {
      const r = renderEntry(img, w);
      const name = `${group}~${e.name.replace(/\W/g, "_")}~${r.width}x${r.height}.png`;
      writePNG(`sweep/${name}`, r.width, r.height, r.rgba);
      index.push(name);
    }
  }
}
writeFileSync("sweep_index.json", JSON.stringify(index));
console.log("rendered", index.length);
