import { readFileSync, writeFileSync } from "node:fs";
import { extractInazumaEntries, buildInazumaRom } from "@/lib/inazuma/inazuma-editor-bridge";

const SRC = process.argv[2], OUT = process.argv[3];
const rom = new Uint8Array(readFileSync(SRC));
const { entries } = extractInazumaEntries(rom);
console.log("entries:", entries.length);

// A handful of lines that put every reworked letter on screen: the dialogue
// the game opens with, plus menu commands.
const WORDS = [
  "اضغط على الزر", "هجوم عاصفة النار", "مدرسة رايمون الثانوية",
  "احفظ اللعبة الآن", "ضربة ساحقة قوية", "حافظ على النقاط",
  "انضم إليك!", "فريق كرة القدم", "مباراة ودية",
];
const translations: Record<string, string> = {};
let n = 0;
for (const e of entries) {
  if (n >= 4000) break;
  const key = `${e.msbtFile}:${e.index}`;
  translations[key] = WORDS[n % WORDS.length];
  n++;
}
const r = buildInazumaRom(rom, translations);
const out = r.rom;
console.log("translated lines:", r.translatedLines, "broken tags:", r.brokenTags.length, "too long:", r.tooLong.length);
console.log("missing glyphs:", r.missingGlyphs.join(" ") || "none");
r.warnings.slice(0, 5).forEach((w) => console.log("warn:", w));
writeFileSync(OUT, out);
console.log("wrote", OUT, out.length, "bytes");
