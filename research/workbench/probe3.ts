import { readFileSync } from "fs";
import { isTechnicalText } from "/home/user/zelda-arabic-magic-a76daea1/src/components/editor/types";
const rows: { file: string; text: string }[] = JSON.parse(readFileSync("/tmp/plat_strings.json", "utf8"));
// Both clauses describe identifiers, and every example in their own comments
// carries a digit. Requiring one keeps the intent and stops them eating words.
const survives = (t: string) => {
  const hexRule = /^[0-9A-Fa-f\-\._:\/]+$/.test(t);
  const shortRule = /^[a-zA-Z0-9]{1,6}$/.test(t) && !/^[A-Z][a-z]{2,}$/.test(t);
  if ((hexRule || shortRule) && !/\d/.test(t) && /[a-zA-Z]/.test(t)) return false;
  return true;
};
const flagged = rows.filter(r => isTechnicalText(r.text, r.file));
const stay = flagged.filter(r => survives(r.text.trim()));
const freed = flagged.filter(r => !survives(r.text.trim()));
console.log(`مُعلَّم الآن ${flagged.length}  →  يبقى ${stay.length}  ·  يتحرّر ${freed.length}`);
console.log("\n— كل ما سيبقى مُعلَّماً (متمايز):");
console.log([...new Set(stay.map(f => f.text))].slice(0, 45).map(t => JSON.stringify(t)).join("  "));
console.log("\n— عيّنة ممّا يتحرّر:");
console.log([...new Set(freed.map(f => f.text))].slice(0, 32).map(t => JSON.stringify(t)).join("  "));
