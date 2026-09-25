import { readFileSync } from "fs";
import { isTechnicalText } from "/home/user/zelda-arabic-magic-a76daea1/src/components/editor/types";
const rows: { file: string; text: string }[] = JSON.parse(readFileSync("/tmp/plat_strings.json", "utf8"));
// the proposed rule: the short-code clause only fires when a digit is present,
// which is what its own comment describes (zY1, yY1, xA3)
const hasDigit = (t: string) => /\d/.test(t);
const nowFlagged = rows.filter(r => isTechnicalText(r.text, r.file));
const stillFlagged = nowFlagged.filter(r => {
  const t = r.text.trim();
  const onlyShortCodeRule = /^[a-zA-Z0-9]{1,6}$/.test(t) && !/^[A-Z][a-z]{2,}$/.test(t);
  return !onlyShortCodeRule || hasDigit(t);
});
const freed = nowFlagged.filter(r => !stillFlagged.includes(r));
console.log("مُعلَّم الآن:", nowFlagged.length);
console.log("سيبقى مُعلَّماً:", stillFlagged.length);
console.log("سيتحرّر:", freed.length);
console.log("\n— عيّنة ممّا سيبقى مُعلَّماً (يجب أن تكون تقنية حقاً):");
console.log([...new Set(stillFlagged.map(f => f.text))].slice(0, 25).map(t => JSON.stringify(t)).join("  "));
console.log("\n— عيّنة ممّا سيتحرّر (يجب أن تكون كلمات حقيقية):");
console.log([...new Set(freed.map(f => f.text))].slice(0, 30).map(t => JSON.stringify(t)).join("  "));
