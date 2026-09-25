import { readFileSync, mkdirSync } from "node:fs";
import { lz77Decompress, parseSfp } from "./sfp_decode.mjs";
import { readEntry, renderEntry, widthCandidates } from "./l5img.mjs";
import { writePNG } from "./png_write.mjs";
mkdirSync("probe", { recursive: true });
const g = process.argv[2];
const raw = lz77Decompress(new Uint8Array(readFileSync(`spf/${g}.SPF_`)));
for (const e of parseSfp(raw)) {
  const img = readEntry(raw, e);
  const cells = img.map.length;
  const ws = widthCandidates(cells).filter((w) => w * 8 <= 512 && (cells / w) * 8 <= 512);
  console.log(`${e.name}  cells=${cells} tiles=${img.tileCount} pals=${img.palettes.length}  widths=${ws.map(w=>w*8+"x"+(cells/w)*8).join(" ")}`);
  for (const w of ws.slice(0, 6)) {
    const r = renderEntry(img, w);
    writePNG(`probe/${g}__${e.name.replace(/\W/g,"_")}__${r.width}x${r.height}.png`, r.width, r.height, r.rgba);
  }
}
