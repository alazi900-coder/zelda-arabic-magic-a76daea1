import { readFileSync, writeFileSync } from "node:fs";
import { lz77Decompress, parseSfp } from "./sfp_decode.mjs";
import { lz77Compress } from "./lz77.mjs";
import { buildEntry } from "./build_entry.mjs";
import { readEntry, renderEntry } from "./l5img.mjs";
import { writePNG } from "./png_write.mjs";

const JOBS = [
  { sfp: "MTSIni.SPF_", entry: "STDN_I00.PAC", png: "ar/newgame.png", tw: 16, filter: "NEAREST" },
  { sfp: "STSIni.SPF_", entry: "ST_UP03.PAC", png: "ar/logo.png",    tw: 32, filter: "LANCZOS" },
];

for (const sfpName of [...new Set(JOBS.map((j) => j.sfp))]) {
  const packed = new Uint8Array(readFileSync(sfpName));
  const raw = lz77Decompress(packed);
  const before = raw.slice();
  const entries = parseSfp(raw);

  for (const job of JOBS.filter((j) => j.sfp === sfpName)) {
    const e = entries.find((x) => x.name === job.entry);
    const r = buildEntry(raw, e, job.png, job.tw, job.filter);
    console.log(`  ${job.entry}: ${r.width}x${r.height}  ${r.tiles}/${r.room} مربّعاً  ${r.cells} خليّة`);
    const check = renderEntry(readEntry(raw, e), job.tw);
    writePNG(`ar/inrom_${job.entry.replace(/\W/g, "_")}.png`, check.width, check.height, check.rgba);
  }

  // Nothing outside the two edited entries may have moved.
  const touched = JOBS.filter((j) => j.sfp === sfpName).map((j) => entries.find((x) => x.name === j.entry));
  let strayed = 0;
  for (const e of entries) {
    if (touched.includes(e)) continue;
    for (let i = e.dataOffset; i < e.dataOffset + e.size; i++) if (raw[i] !== before[i]) { strayed++; break; }
  }
  console.log(`  entries outside the edit that changed: ${strayed}`);

  const repacked = lz77Compress(raw);
  const back = lz77Decompress(repacked);
  let ok = back.length === raw.length;
  if (ok) for (let i = 0; i < raw.length; i++) if (back[i] !== raw[i]) { ok = false; break; }
  console.log(`${sfpName}: packed ${packed.length} -> ${repacked.length}  round-trip ${ok ? "OK" : "BROKEN"}`);
  writeFileSync(`ar/${sfpName}`, repacked);
}
