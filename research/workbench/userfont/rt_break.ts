import { readFileSync } from "node:fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
import { isInazumaTranslatable } from "@/lib/inazuma/inazuma-tags";
import { toInazumaBreakTokens, fromInazumaBreakTokens } from "@/lib/inazuma/inazuma-break-tokens";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const rows = readInazumaText(rom).filter((r) => isInazumaTranslatable(r.text));
let bad = 0, withF = 0, hasTri = 0;
for (const r of rows) {
  const editor = r.text.replace(/\\n/g, "\n");
  if (editor.includes("▼")) hasTri++;
  if (editor.includes("\\f")) withF++;
  if (fromInazumaBreakTokens(toInazumaBreakTokens(editor)) !== editor) { bad++; if (bad < 4) console.log("BAD", JSON.stringify(editor)); }
}
console.log({ rows: rows.length, withF, hasTri, bad });
