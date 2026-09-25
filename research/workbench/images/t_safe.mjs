import { readFileSync } from "node:fs";
import { lz77Decompress, parseSfp } from "./sfp_decode.mjs";
import { readEntry, renderEntry } from "./l5img.mjs";
import { buildEntrySafe } from "./build_entry_safe.mjs";
import { writePNG } from "./png_write.mjs";

const JOBS = [
  ["spf/pic2d__title__en__STSIni.SPF_", "ST_UP03.PAC", "ar/logo.png", 32, "LANCZOS"],
  ["spf/pic2d__title__en__MTSIni.SPF_", "STDN_I00.PAC", "ar/newgame.png", 16, "NEAREST"],
];
for (const [sfp, name, png, tw, filt] of JOBS) {
  const raw = lz77Decompress(new Uint8Array(readFileSync(sfp)));
  const before = raw.slice();
  const list = parseSfp(raw);
  const e = list.find((x) => x.name === name);
  const r = buildEntrySafe(raw, e, png, tw, filt);
  console.log(name, JSON.stringify(r));
  let strayed = 0;
  for (const o of list) { if (o === e) continue;
    for (let i = o.dataOffset; i < o.dataOffset + o.size; i++) if (raw[i] !== before[i]) { strayed++; break; } }
  console.log("  other entries touched:", strayed);
  const img = renderEntry(readEntry(raw, e), tw);
  writePNG(`safe_${name.replace(/\W/g,"_")}.png`, img.width, img.height, img.rgba);
}
