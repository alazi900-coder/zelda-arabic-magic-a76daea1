import { readFileSync } from "node:fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
import { prepareInazumaLine } from "@/lib/inazuma/inazuma-editor-bridge";
import { isInazumaTranslatable } from "@/lib/inazuma/inazuma-tags";

const rom = new Uint8Array(readFileSync(process.argv[2]));
const rows = readInazumaText(rom).filter((r) => isInazumaTranslatable(r.text) && r.text.includes("\\f"));
const row = rows[0];

const WORDS = ["كلمة", "جملة", "عربية", "أخرى", "هنا", "الآن"];
const segments = row.text.split(/(\\n|\\f)/);
let wi = 0;
const segTexts = segments.map((seg) => {
  if (seg === "\\n" || seg === "\\f") return seg;
  const n = Math.max(1, Math.min(4, seg.trim().split(/\s+/).length));
  const words = Array.from({ length: n }, () => WORDS[wi++ % WORDS.length]);
  return words.join(" ");
});
const translation = segTexts.join("");
const whole = prepareInazumaLine(row.text, translation, undefined).encoded!;

console.log("raw whole char codes (first 200):", [...whole].slice(0, 200).map(c => c.charCodeAt(0)).join(","));
console.log("\\n count:", (whole.match(/\\n/g) ?? []).length);
console.log("\\f count:", (whole.match(/\\f/g) ?? []).length);
console.log("length:", whole.length);

// find literal backslash positions (char code 92) and what follows
for (let i = 0; i < whole.length; i++) {
  if (whole.charCodeAt(i) === 92) console.log(`backslash at ${i}, next char code = ${whole.charCodeAt(i+1)} (${whole[i+1]})`);
}
