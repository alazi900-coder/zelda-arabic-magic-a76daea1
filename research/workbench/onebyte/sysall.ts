import { readFileSync, writeFileSync } from "fs";
import { extractInazumaEntries, buildInazumaRom } from "@/lib/inazuma/inazuma-editor-bridge";
import { maskInazumaTokens, unmaskInazumaTokens } from "@/lib/inazuma/inazuma-tags";
const rom = new Uint8Array(readFileSync(process.env.ROM!));
const words = ["نص", "عربي", "هنا", "جميل"];
const t: Record<string, string> = {};
const skip = new Set(["inazuma/evet", "inazuma/mcht", "inazuma/movie"]);
for (const e of extractInazumaEntries(rom).entries) {
  if (skip.has(e.msbtFile)) continue;
  const { masked, tokens } = maskInazumaTokens(e.original);
  let k = 0;
  t[`${e.msbtFile}:${e.index}`] = unmaskInazumaTokens(masked.replace(/[A-Za-z']+/g, () => words[k++ % words.length]), tokens);
}
const res = buildInazumaRom(rom, t, { force: true });
console.log(Object.keys(t).length, res.translatedLines, res.cut.length, res.warnings.slice(0, 3));
writeFileSync(process.env.OUT!, res.rom);
