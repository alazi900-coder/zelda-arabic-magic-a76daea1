import { readFileSync } from "node:fs";
import { toBreakTokens, fromBreakTokens } from "./src/lib/nds/plat-break-tokens";

const texts: string[] = JSON.parse(readFileSync(process.argv[2], "utf8"));
let bad = 0, withBreak = 0, tokenised = 0;
const samples: string[] = [];
for (const t of texts) {
  const hasBreak = /[\r\f]/.test(t);
  if (hasBreak) withBreak++;
  const round = toBreakTokens(t);
  if (round !== t) tokenised++;
  const back = fromBreakTokens(round);
  if (back !== t) { bad++; if (samples.length < 3) samples.push(JSON.stringify(t.slice(0, 90))); }
}
console.log(`رسائل مفحوصة        : ${texts.length}`);
console.log(`منها فيها فاصل توقّف : ${withBreak}`);
console.log(`تغيّر شكلها بالترميز : ${tokenised}`);
console.log(`❌ فشل الذهاب والإياب : ${bad}`);
if (samples.length) console.log("أمثلة:", samples.join("\n"));
