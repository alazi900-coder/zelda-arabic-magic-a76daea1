import { prepareInazumaLine } from "@/lib/inazuma/inazuma-editor-bridge";

const words = [
  "كلمة جملة عربية أخرى",
  "هنا الآن كلمة جملة",
  "عربية أخرى هنا الآن",
  "كلمة جملة عربية أخرى",
];
const translation = words.join("\\n").replace(/\\n(?=[^\\n]*$)/, "\\f"); // last gap -> \f, rest -> \n
console.log("translation:", JSON.stringify(translation));

const whole = prepareInazumaLine("x", translation, undefined).encoded!;
const perSeg = words.map((w) => prepareInazumaLine("x", w, undefined).encoded!);

// split whole on \n / \f boundaries (3 \n would be wrong; expect 2 \n + 1 \f in THIS particular construction... actually translation has 3 gaps: n,n,f)
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
console.log("wholeSegs count:", wholeSegs.length);
wholeSegs.forEach((s, i) => console.log(` ${i}: len=${s.length} eqToPerSeg=${i % 2 === 0 ? s === perSeg[i/2] : s === (i===5 ? "\\f" : "\\n")}`));
