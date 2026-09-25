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
console.log("segments:", JSON.stringify(segments));

let wi = 0;
const translation = segments.map((seg) => {
  if (seg === "\\n" || seg === "\\f") return seg;
  const n = Math.max(1, Math.min(4, seg.trim().split(/\s+/).length));
  const words = Array.from({ length: n }, () => WORDS[wi++ % WORDS.length]);
  return words.join(" ");
}).join("");
console.log("translation:", JSON.stringify(translation));

const whole = prepareInazumaLine(row.text, translation, undefined);
console.log("whole.encoded null?", whole.encoded === null, "brokenTag", whole.brokenTag, "missing", whole.missing);

let wi2 = 0;
const rebuilt = segments.map((seg) => {
  if (seg === "\\n" || seg === "\\f") return seg;
  const n = Math.max(1, Math.min(4, seg.trim().split(/\s+/).length));
  const words = Array.from({ length: n }, () => WORDS[wi2++ % WORDS.length]);
  const r = prepareInazumaLine("x", words.join(" "), undefined);
  console.log("  seg piece:", words.join(" "), "-> encoded null?", r.encoded===null, r.missing);
  return r.encoded ?? "";
}).join("");
console.log("rebuilt === whole.encoded:", rebuilt === whole.encoded);
console.log("whole:", JSON.stringify(whole.encoded));
console.log("rebuilt:", JSON.stringify(rebuilt));
