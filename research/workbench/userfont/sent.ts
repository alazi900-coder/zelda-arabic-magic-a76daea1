import { readFileSync } from "node:fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
import { isInazumaTranslatable } from "@/lib/inazuma/inazuma-tags";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const rows = readInazumaText(rom).filter((r) => isInazumaTranslatable(r.text) && r.text.includes("\\f"));
let breaks = 0, afterSentence = 0;
for (const r of rows) {
  const t = r.text.replace(/\\n/g, " ");
  const re = /\\f/g; let m;
  while ((m = re.exec(t))) { breaks++; const before = t.slice(0, m.index).trimEnd(); if (/[.!?…]["')]*$/.test(before)) afterSentence++; }
}
console.log({ lines: rows.length, breaks, afterSentence, pct: (100 * afterSentence / breaks).toFixed(1) });
