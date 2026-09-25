import { readFileSync } from "fs";
import { parseGtaIvGxt, decodeGtaIvArabicFontUnits, gtaIvRawUnitsToString } from "@/lib/gtaiv/gxt-format";

const buf = readFileSync("/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/a5c910b1-russian_3.gxt");
const gxt = parseGtaIvGxt(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
console.log("tables:", gxt.tables.length, "entries:", gxt.tables.reduce((n, t) => n + t.entries.length, 0));

const want = ["خيارات", "لتغيير", "الملابس", "اضغط"];
let shown = 0;
for (const t of gxt.tables) {
  for (const e of t.entries) {
    const text = decodeGtaIvArabicFontUnits(e.textUnits, true);
    if (!want.some((w) => text.includes(w))) continue;
    if (shown++ >= 6) break;
    console.log(`\n--- ${t.name}/${e.crc.toString(16)}`);
    console.log("decoded:", JSON.stringify(text));
    console.log("units  :", Array.from(e.textUnits).join(" "));
  }
  if (shown >= 6) break;
}
