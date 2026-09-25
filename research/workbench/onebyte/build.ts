import { readFileSync, writeFileSync } from "fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
import { buildInazumaRom } from "@/lib/inazuma/inazuma-editor-bridge";
const rom = new Uint8Array(readFileSync(process.env.ROM!));
const want: Record<string, string> = {
  "Come on! Let's do some practice!": "هيا! لنتدرب قليلاً!",
  "Practice?": "نتدرب؟",
  "Yeah! We should always be match ready!": "نعم! يجب أن نكون مستعدين\nللمباراة دائماً!",
};
const translations: Record<string, string> = {};
for (const r of readInazumaText(rom)) {
  if (r.source === "evet" && want[r.text]) translations[`inazuma/evet:${r.entry * 100000 + r.key}`] = want[r.text];
}
console.log("keys", Object.keys(translations).length);
const t0 = Date.now();
const res = buildInazumaRom(rom, translations);
console.log("built in", Date.now() - t0, "ms; lines", res.translatedLines, "refused", res.brokenTags.length, res.tooLong.length, "missing", res.missingGlyphs);
writeFileSync(process.env.OUT!, res.rom);
