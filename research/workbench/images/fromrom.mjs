// Decode straight out of the built cartridge's own bytes.
import { readFileSync, writeFileSync } from "node:fs";
import { lz77Decompress, parseSfp } from "./sfp_decode.mjs";
import { readEntry, renderEntry } from "./l5img.mjs";
import { writePNG } from "./png_write.mjs";
for (const [name, entry, tw] of [["MTSIni.SPF_", "STDN_I00.PAC", 16], ["STSIni.SPF_", "ST_UP03.PAC", 32]]) {
  const d = lz77Decompress(new Uint8Array(readFileSync(`ar/${name}`)));
  const e = parseSfp(d).find((x) => x.name === entry);
  const r = renderEntry(readEntry(d, e), tw);
  writePNG(`ar/final_${entry.replace(/\W/g, "_")}.png`, r.width, r.height, r.rgba);
  console.log(`${entry}: ${r.width}x${r.height}`);
}
