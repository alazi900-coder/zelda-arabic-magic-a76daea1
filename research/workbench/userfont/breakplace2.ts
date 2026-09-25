import { readFileSync } from "node:fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
import { isInazumaTranslatable } from "@/lib/inazuma/inazuma-tags";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const rows = readInazumaText(rom).filter((r) => isInazumaTranslatable(r.text));
let trailN = 0, trailF = 0;
const samples: string[] = [];
for (const row of rows) {
  const t = row.text;
  if (/\\n$/.test(t)) { trailN++; if (samples.length < 3) samples.push("TRAIL-N: " + JSON.stringify(t.slice(-40))); }
  if (/\\f$/.test(t)) { trailF++; if (samples.length < 6) samples.push("TRAIL-F: " + JSON.stringify(t.slice(-40))); }
}
console.log({ trailN, trailF, total: rows.length });
samples.forEach((s) => console.log(" ", s));
