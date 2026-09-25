import { readFileSync, writeFileSync } from "fs";
import { extractInazumaEntries, buildInazumaRom } from "@/lib/inazuma/inazuma-editor-bridge";
import { maskInazumaTokens, unmaskInazumaTokens } from "@/lib/inazuma/inazuma-tags";
const rom = new Uint8Array(readFileSync(process.env.ROM!));
const words = ["كلمة", "عربية", "هنا", "نص", "جميل", "مرحبا"];
const translations: Record<string, string> = {};
let n = 0;
for (const e of extractInazumaEntries(rom).entries) {
  if (e.msbtFile !== "inazuma/evet") continue;
  const { masked, tokens } = maskInazumaTokens(e.original);
  let k = 0;
  const ar = masked.replace(/[A-Za-z']+/g, () => words[k++ % words.length]);
  translations[`${e.msbtFile}:${e.index}`] = unmaskInazumaTokens(ar, tokens);
  n++;
}
const res = buildInazumaRom(rom, translations, { force: true });
console.log("evet", n, "written", res.translatedLines, "refused", res.brokenTags.length, res.tooLong.length, "missing", res.missingGlyphs);
writeFileSync(process.env.OUT!, res.rom);
