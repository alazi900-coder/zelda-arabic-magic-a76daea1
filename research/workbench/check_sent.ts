import { readFileSync } from "fs";
import { isTechnicalText } from "/home/user/zelda-arabic-magic-a76daea1/src/components/editor/types";
const rows: { file: string; text: string }[] = JSON.parse(readFileSync("/tmp/plat_strings.json", "utf8"));
// no row that still contains real words may have been swept up
const wrong = rows.filter(r => isTechnicalText(r.text, r.file) && /[A-Za-z]{4,}/.test(r.text.replace(/\{[^}]*\}/g, "")));
console.log("جمل حقيقية أُصيبت خطأً:", wrong.length);
for (const w of wrong.slice(0, 8)) console.log("  ", JSON.stringify(w.text).slice(0, 90));
