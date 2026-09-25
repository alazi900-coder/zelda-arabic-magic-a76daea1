import { readFileSync } from "node:fs";
import { lz77Decompress, parseSfp } from "./sfp_decode.mjs";
const d = lz77Decompress(readFileSync(process.argv[2]));
const entries = parseSfp(d);
const dv = new DataView(d.buffer, d.byteOffset, d.length);
for (const e of entries.filter((x) => process.argv.slice(3).includes(x.name))) {
  const h = [];
  for (let k = 0; k < 8; k++) h.push(dv.getUint32(e.dataOffset + k * 4, true));
  console.log(`\n${e.name}  size=${e.size}  header: ${h.join(", ")}`);
  const marks = [...new Set([32, h[2], h[3], h[4], h[5], h[6], h[7], e.size])].sort((a, b) => a - b);
  for (let i = 0; i < marks.length - 1; i++) {
    const s = marks[i], t = marks[i + 1];
    const bytes = d.subarray(e.dataOffset + s, e.dataOffset + Math.min(t, s + 24));
    console.log(`  [${String(s).padStart(6)} .. ${String(t).padStart(6)}) ${String(t - s).padStart(6)}B  ` +
      [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(" "));
  }
}
