/**
 * Puts the Arabised pictures back into their containers, layout untouched.
 *
 * The width comes from the file name the export wrote, not from a fresh guess:
 * the drawing was painted on the picture as it was laid out then, so it has to
 * go back on that same layout or the Arabic lands in the wrong squares.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { lz77Decompress, parseSfp } from "./sfp_decode.mjs";
import { lz77Compress } from "./lz77.mjs";
import { buildEntrySafe } from "./build_entry_safe.mjs";

// Two pictures were redrawn by hand before the sweep and are already known to
// be right on the cartridge; the sweep must not replace them with its own.
const HAND = {
  "pic2d__title__en__MTSIni": { "STDN_I00.PAC": ["ar/newgame.png", 16, "NEAREST"] },
  "pic2d__title__en__STSIni": { "ST_UP03.PAC": ["ar/logo.png", 32, "LANCZOS"] },
};

rmSync("packed", { recursive: true, force: true });
mkdirSync("packed", { recursive: true });
let entries = 0, containers = 0, merged = 0, strayed = 0;
const refused = [];

const groups = new Set([...readdirSync("ar_out"), ...Object.keys(HAND)]);
for (const group of groups) {
  const file = `${group}.SPF_`;
  if (!existsSync(`spf/${file}`)) { refused.push(`${group}: no container`); continue; }

  const jobs = [];
  if (existsSync(`ar_out/${group}`)) {
    for (const png of readdirSync(`ar_out/${group}`).filter((f) => f.endsWith(".png"))) {
      const m = png.match(/^(.*)__(\d+)x(\d+)\.png$/);
      if (!m) { refused.push(`${group}/${png}: no size in the name`); continue; }
      jobs.push({ key: m[1], png: `ar_out/${group}/${png}`, tw: +m[2] / 8, filter: "NEAREST" });
    }
  }
  for (const [name, [png, tw, filter]] of Object.entries(HAND[group] ?? {})) {
    const key = name.replace(/\W/g, "_");
    const i = jobs.findIndex((j) => j.key === key);
    if (i >= 0) jobs.splice(i, 1);
    jobs.push({ key, png, tw, filter });
  }
  if (!jobs.length) continue;

  const raw = lz77Decompress(new Uint8Array(readFileSync(`spf/${file}`)));
  const before = raw.slice();
  const list = parseSfp(raw);
  const touched = [];

  for (const job of jobs) {
    const e = list.find((x) => x.name.replace(/\W/g, "_") === job.key);
    if (!e) { refused.push(`${group}/${job.key}: no matching entry`); continue; }
    try {
      const r = buildEntrySafe(raw, e, job.png, job.tw, job.filter);
      entries++; merged += r.merged; touched.push(e);
    } catch (err) { refused.push(`${group}/${job.key}: ${err.message}`); }
  }
  if (!touched.length) continue;

  for (const e of list) {
    if (touched.includes(e)) continue;
    for (let i = e.dataOffset; i < e.dataOffset + e.size; i++)
      if (raw[i] !== before[i]) { strayed++; refused.push(`${group}/${e.name}: changed but was not edited`); break; }
  }

  const out = lz77Compress(raw);
  const back = lz77Decompress(out);
  let ok = back.length === raw.length;
  if (ok) for (let i = 0; i < raw.length; i++) if (back[i] !== raw[i]) { ok = false; break; }
  if (!ok) { refused.push(`${group}: repack round-trip failed`); continue; }
  writeFileSync(`packed/${file}`, out);
  containers++;
}
console.log(`containers ${containers}   pictures ${entries}   squares merged ${merged}   stray entries ${strayed}   refused ${refused.length}`);
refused.slice(0, 20).forEach((s) => console.log("  " + s));
