import { readFileSync } from "fs";
import { isTechnicalText } from "/home/user/zelda-arabic-magic-a76daea1/src/components/editor/types";
import { editorTagPattern } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/editor-tag-pattern";
const rows: { file: string; text: string }[] = JSON.parse(readFileSync("/tmp/plat_strings.json", "utf8"));
let gap = 0; const samples: string[] = [];
for (const r of rows) {
  const bare = r.text.replace(editorTagPattern(r.file), "").replace(/[\s‎‏]/g, "");
  const tagOnly = bare.length === 0 && r.text.trim().length > 0;
  if (tagOnly && !isTechnicalText(r.text, r.file)) {
    gap++;
    if (samples.length < 14) samples.push(JSON.stringify(r.text));
  }
}
console.log("نصوص وسومٌ بحتة لا يلتقطها الفحص الحالي:", gap);
console.log(samples.join("\n"));
