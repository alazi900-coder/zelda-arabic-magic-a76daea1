import { readdirSync, readFileSync } from "node:fs";
import { lz77Decompress, parseSfp } from "./sfp_decode.mjs";
import { readEntry, widthCandidates } from "./l5img.mjs";
const byKind = {};
for (const f of readdirSync("spf")) {
  const kind = f.split("__")[0];
  const s = (byKind[kind] ??= { files: 0, entries: 0, widths: 0, bad: 0 });
  s.files++;
  try {
    const raw = lz77Decompress(new Uint8Array(readFileSync(`spf/${f}`)));
    for (const e of parseSfp(raw)) {
      const img = readEntry(raw, e);
      const cells = img.map.length;
      if (!cells || !Number.isInteger(cells)) { s.bad++; continue; }
      s.entries++;
      s.widths += widthCandidates(cells).filter((w) => w * 8 <= 512 && (cells / w) * 8 <= 512).length;
    }
  } catch { s.bad++; }
}
for (const [k, s] of Object.entries(byKind)) console.log(k, JSON.stringify(s));
