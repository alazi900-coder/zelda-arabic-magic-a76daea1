import { readFileSync } from "node:fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
import { prepareInazumaLine } from "@/lib/inazuma/inazuma-editor-bridge";
import { isInazumaTranslatable } from "@/lib/inazuma/inazuma-tags";

const rom = new Uint8Array(readFileSync(process.argv[2]));
const rows = readInazumaText(rom).filter((r) => isInazumaTranslatable(r.text) && r.text.includes("\\f"));
const row = rows[0];
console.log("original:", JSON.stringify(row.text));

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
console.log("translation:", JSON.stringify(translation));

const whole = prepareInazumaLine(row.text, translation, undefined).encoded!;

function segsOf(bytes: string) {
  const out: string[] = []; let cur = "";
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === "\\" && (bytes[i+1] === "n" || bytes[i+1] === "f")) { out.push(cur); out.push(bytes.slice(i, i+2)); cur = ""; i++; }
    else cur += bytes[i];
  }
  out.push(cur);
  return out;
}
const wholeSegs = segsOf(whole);
console.log("original segments (by \\n/\\f):", segTexts);
console.log("whole re-split into", wholeSegs.length, "pieces, expected", segments.length);

// encode each Arabic prose segment independently for comparison
let idx = 0;
for (let i = 0; i < segments.length; i++) {
  if (segments[i] === "\\n" || segments[i] === "\\f") {
    console.log(`  [${i}] break token: got=${JSON.stringify(wholeSegs[i])} expect=${JSON.stringify(segments[i])} match=${wholeSegs[i]===segments[i]}`);
  } else {
    const enc = prepareInazumaLine("x", segTexts[i], undefined).encoded;
    console.log(`  [${i}] prose "${segTexts[i]}" -> lenGot=${wholeSegs[i]?.length} lenExpect=${enc?.length} match=${wholeSegs[i]===enc}`);
  }
}
