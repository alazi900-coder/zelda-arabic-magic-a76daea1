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
const proseFor = (seg: string) => {
  const n = Math.max(1, Math.min(4, seg.trim().split(/\s+/).length));
  return Array.from({ length: n }, () => WORDS[wi++ % WORDS.length]).join(" ");
};
const editorSegments = segments.map((seg) => seg === "\\n" ? "\n" : seg === "\\f" ? seg : proseFor(seg));
const translation = editorSegments.join("");
console.log("translation (editor form):", JSON.stringify(translation));

const whole = prepareInazumaLine(row.text, translation, undefined).encoded!;
console.log("whole \\n count:", (whole.match(/\\n/g)??[]).length, "\\f count:", (whole.match(/\\f/g)??[]).length);
console.log("whole length:", whole.length);

let wi2 = 0;
const proseFor2 = (seg: string) => {
  const n = Math.max(1, Math.min(4, seg.trim().split(/\s+/).length));
  return Array.from({ length: n }, () => WORDS[wi2++ % WORDS.length]).join(" ");
};
segments.forEach((seg, i) => {
  if (seg === "\\n" || seg === "\\f") { console.log(`[${i}] BREAK ${JSON.stringify(seg)}`); return; }
  const text = proseFor2(seg);
  const enc = prepareInazumaLine("x", text, undefined).encoded;
  console.log(`[${i}] prose ${JSON.stringify(text)} -> encoded len=${enc?.length}`);
});
