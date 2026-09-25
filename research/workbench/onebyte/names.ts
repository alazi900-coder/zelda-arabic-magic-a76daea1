import { readFileSync, writeFileSync } from "fs";
import { extractInazumaEntries, buildInazumaRom } from "@/lib/inazuma/inazuma-editor-bridge";
const rom = new Uint8Array(readFileSync(process.env.ROM!));
const want: Record<string, string> = { "Endou": "إندو", "Kabeyama": "كابياما", "Kurimatsu": "كوريماتسو", "Handa": "هاندا", "Football Club": "نادي كرة القدم",
  "Come on! Let's do some practice!": "هيا! لنتدرب قليلاً!", "Practice?": "نتدرب؟" };
const t: Record<string, string> = {};
for (const e of extractInazumaEntries(rom).entries) {
  if ((e.msbtFile === "inazuma/pshort" || e.msbtFile === "inazuma/evet" || e.msbtFile === "inazuma/sys") && want[e.original]) t[`${e.msbtFile}:${e.index}`] = want[e.original];
}
const res = buildInazumaRom(rom, t);
console.log(Object.keys(t).length, res.translatedLines, res.tooLong, res.brokenTags, res.warnings);
writeFileSync(process.env.OUT!, res.rom);
