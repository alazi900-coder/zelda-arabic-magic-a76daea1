import { readdirSync, mkdirSync } from "node:fs";
import { openSfp, readEntry, renderEntry, widthCandidates } from "./l5img.mjs";
import { bestWidth, scoreWidth } from "./guess.mjs";
import { writePNG } from "./png_write.mjs";
const SRC = "spf";
const files = readdirSync(SRC).filter((f) => /^pic2d__(menu|title)__en__.*\.SPF_$/.test(f));
for (const file of files) {
  let b; try { b = openSfp(`${SRC}/${file}`); } catch { continue; }
  const base = file.replace(/^pic2d__(menu|title)__en__/, "").replace(/\.SPF_$/i, "");
  for (const e of b.entries) {
    let img; try { img = readEntry(b.data, e); } catch { continue; }
    if (!img.map.length) continue;
    const chosen = bestWidth(img).width;
    const others = widthCandidates(img.map.length)
      .filter((w) => w !== chosen && w >= 2 && w * 8 <= 512 && (img.map.length / w) * 8 <= 512)
      .map((w) => ({ w, s: scoreWidth(img, w) }))
      .sort((a, x) => a.s - x.s).slice(0, 3);
    if (!others.length) continue;
    const dir = `menu_pack/${base}/عروض-أخرى`;
    mkdirSync(dir, { recursive: true });
    for (const { w } of others) {
      const r = renderEntry(img, w);
      writePNG(`${dir}/${e.name.replace(/\W/g, "_")}__${r.width}x${r.height}.png`, r.width, r.height, r.rgba);
    }
  }
}
console.log("done");
