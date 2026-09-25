import { readFileSync } from "node:fs";
import { lz77Decompress, parseSfp } from "./sfp_decode.mjs";
for (const file of process.argv.slice(2)) {
  const d = lz77Decompress(readFileSync(file));
  const entries = parseSfp(d);
  console.log(`\n${file}: ${entries.length} entries`);
  const dv = new DataView(d.buffer, d.byteOffset, d.length);
  for (const e of entries.slice(0, 12)) {
    const h = [];
    for (let k = 0; k < 8; k++) h.push(dv.getUint32(e.dataOffset + k * 4, true));
    const pixelBytes = e.size - 64;
    console.log(`  ${e.name.padEnd(18)} size=${String(e.size).padStart(6)} tiles=${(pixelBytes/32).toString().padStart(5)}  header: ${h.join(", ")}`);
  }
}
