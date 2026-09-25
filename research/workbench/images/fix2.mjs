import { openSfp, readEntry, renderEntry, widthCandidates } from "./l5img.mjs";
import { writePNG } from "./png_write.mjs";
import { mkdirSync } from "node:fs";
mkdirSync("fix", { recursive: true });
const jobs = [["MTSIni.SPF_", "STDN_W02.PAC"], ["STSIni.SPF_", "ST_UP01.PAC"], ["MTSIni.SPF_", "STDN_BG00.PAC"]];
for (const [file, name] of jobs) {
  const { data, entries } = openSfp(file);
  const img = readEntry(data, entries.find((e) => e.name === name));
  const cells = img.map.length;
  const ws = widthCandidates(cells).filter((w) => w * 8 >= 32 && w * 8 <= 512).sort((a, b) => a - b);
  console.log(`${name}: ${cells} cells, widths ${ws.map((w) => `${w * 8}x${(cells / w) * 8}`).join("  ")}`);
  for (const w of ws) {
    const r = renderEntry(img, w);
    writePNG(`fix/${name.replace(/\W/g, "_")}_${r.width}x${r.height}.png`, r.width, r.height, r.rgba);
  }
}
