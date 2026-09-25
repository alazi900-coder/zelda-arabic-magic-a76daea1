import { readFileSync } from "node:fs";
import { extractInazumaEntries } from "@/lib/inazuma/inazuma-editor-bridge";
import { repairInazumaTags } from "@/lib/inazuma/inazuma-tags";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const rows = extractInazumaEntries(rom).entries.filter((e) => e.original.includes("▼"));
const shape = (t: string) => t.replace(/▼/g, " ▼ ").split(/\s+/).filter(Boolean).join(" ");
for (const joiner of ["\n", " "]) {
  let right = 0, wrong = 0, none = 0;
  for (const e of rows) {
    const damaged = e.original.replace(/▼\n?/g, joiner);
    const r = repairInazumaTags(e.original, damaged);
    if (!r.changed || !r.text.includes("▼")) { none++; continue; }
    shape(r.text) === shape(e.original) ? right++ : wrong++;
  }
  console.log(`break lost as ${JSON.stringify(joiner)}: lines ${rows.length}  right ${right}  wrong ${wrong}  left alone ${none}  accuracy ${(100 * right / (right + wrong)).toFixed(1)}%`);
}
