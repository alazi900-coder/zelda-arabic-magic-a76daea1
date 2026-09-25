/**
 * Puts the Arabised pictures back into their containers.
 *
 * Each entry keeps its exact byte length: the palette is untouched and the
 * drawing is snapped onto its sixteen colours, the map is rewritten in full,
 * and the tiles go where the old ones were. An entry whose new drawing needs
 * more tiles than the old one had is left in English rather than made to fit
 * by force, and the run says which.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { lz77Decompress, parseSfp } from "./sfp_decode.mjs";
import { lz77Compress } from "./lz77.mjs";
import { readEntry, renderEntry } from "./l5img.mjs";
import { bestWidth } from "./guess.mjs";
import { buildEntry } from "./build_entry.mjs";

mkdirSync("packed", { recursive: true });
let entries = 0, skipped = [], containers = 0;

for (const file of readdirSync("spf").filter((f) => /\.SPF_$/i.test(f))) {
  const group = file.replace(/\.SPF_$/i, "");
  const dir = `ar_out/${group}`;
  if (!existsSync(dir)) continue;
  const edited = readdirSync(dir).filter((f) => f.endsWith(".png"));
  if (!edited.length) continue;

  const packed = new Uint8Array(readFileSync(`spf/${file}`));
  const raw = lz77Decompress(packed);
  const list = parseSfp(raw);
  let touched = 0;

  for (const png of edited) {
    const entryName = png.replace(/__\d+x\d+\.png$/, "");
    const e = list.find((x) => x.name.replace(/\W/g, "_") === entryName);
    if (!e) { skipped.push(`${group}/${png}: no matching entry`); continue; }
    const img = readEntry(raw, e);
    const tw = bestWidth(img).width;
    try {
      const r = buildEntry(raw, e, `${dir}/${png}`, tw, "NEAREST");
      touched++; entries++;
      if (r.tiles > r.room) skipped.push(`${group}/${png}: ${r.tiles} > ${r.room}`);
    } catch (err) {
      skipped.push(`${group}/${png}: ${err.message}`);
    }
  }
  if (!touched) continue;
  const out = lz77Compress(raw);
  const back = lz77Decompress(out);
  let ok = back.length === raw.length;
  if (ok) for (let i = 0; i < raw.length; i++) if (back[i] !== raw[i]) { ok = false; break; }
  if (!ok) { skipped.push(`${group}: repack round-trip failed`); continue; }
  writeFileSync(`packed/${file}`, out);
  containers++;
}
console.log(`containers rebuilt ${containers}   entries written ${entries}   refused ${skipped.length}`);
skipped.slice(0, 15).forEach((s) => console.log("  " + s));
