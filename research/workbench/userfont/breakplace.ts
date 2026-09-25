import { readFileSync } from "node:fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
import { isInazumaTranslatable } from "@/lib/inazuma/inazuma-tags";

const rom = new Uint8Array(readFileSync(process.argv[2]));
const rows = readInazumaText(rom).filter((r) => isInazumaTranslatable(r.text));
console.log("translatable rows:", rows.length);

let adjacent = 0, leading = 0, trailing = 0;
const samples: string[] = [];
for (const row of rows) {
  const t = row.text;
  if (/(\\n|\\f)(\\n|\\f)/.test(t)) { adjacent++; if (samples.length < 5) samples.push("ADJ: " + t.slice(0, 60)); }
  if (/^(\\n|\\f)/.test(t)) { leading++; if (samples.length < 10) samples.push("LEAD: " + t.slice(0, 60)); }
  if (/(\\n|\\f)$/.test(t)) { trailing++; if (samples.length < 15) samples.push("TRAIL: " + t.slice(0, 60)); }
}
console.log({ adjacent, leading, trailing });
samples.forEach((s) => console.log(" ", s));
