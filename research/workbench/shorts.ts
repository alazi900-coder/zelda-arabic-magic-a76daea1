import { readFileSync } from "fs";
import { isTechnicalText } from "/home/user/zelda-arabic-magic-a76daea1/src/components/editor/types";
const rows: { file: string; text: string }[] = JSON.parse(readFileSync("/tmp/plat_strings.json", "utf8"));
const shorts = new Map<string, number>();
for (const r of rows) {
  const t = r.text.trim();
  if (t.length <= 4 && /[a-zA-Z]/.test(t) && !isTechnicalText(t, r.file)) {
    shorts.set(t, (shorts.get(t) || 0) + 1);
  }
}
console.log("نصوص ≤4 أحرف تدخل الترجمة الآن:", shorts.size, "شكلاً متمايزاً\n");
console.log([...shorts].sort((a,b)=>b[1]-a[1]).map(([t,n])=>`${JSON.stringify(t)}×${n}`).join("  "));
