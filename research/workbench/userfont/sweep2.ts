import { readFileSync } from "node:fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
import { isInazumaTranslatable, extractInazumaTags } from "@/lib/inazuma/inazuma-tags";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const rows = readInazumaText(rom).filter((r) => isInazumaTranslatable(r.text) && r.text.includes("\\f"));
let onlyBreaks = 0, withSlots = 0;
for (const row of rows) {
  const tags = extractInazumaTags(row.text);
  if (tags.every((t) => t === "\\f")) onlyBreaks++; else withSlots++;
}
console.log({ total: rows.length, onlyBreaks, withSlots });
console.log("sample with slots:", rows.find((r) => extractInazumaTags(r.text).some((t) => t !== "\\f"))?.text.slice(0, 80));
