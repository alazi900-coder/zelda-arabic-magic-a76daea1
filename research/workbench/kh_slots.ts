import { readFileSync } from "node:fs";
import { processArabicText } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/arabic-processing";
const UP = "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b";
const tr: Record<string, string> = JSON.parse(readFileSync(`${UP}/803aa87a-_____________.json`, "utf8"));
const TAG = /\{[^}]*\}|[▼▽]/g;
const seen = new Map<string, number>();
let n = 0;
for (const value of Object.values(tr)) {
  if (!value.trim()) continue;
  n++;
  for (const ch of processArabicText(value.replace(TAG, ""), { mirrorPunct: true })) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) continue;          // ASCII يبقى ASCII
    const arabic = (cp >= 0x0600 && cp <= 0x06ff) || (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfeff);
    if (!arabic) continue;            // رموز من محتوى بلاتينيوم لا تخصّ العربية
    seen.set(ch, (seen.get(ch) ?? 0) + 1);
  }
}
const sorted = [...seen.entries()].sort((a, b) => b[1] - a[1]);
console.log(`ترجمات مفحوصة: ${n}`);
console.log(`رموز غير-ASCII مميّزة يحتاجها العربي فعلاً: ${sorted.length}`);
console.log(`الخانات المتاحة ببايت واحد: 128  →  ${sorted.length <= 128 ? "✅ تتّسع" : "❌ ينقص " + (sorted.length - 128)}`);
const rare = sorted.filter(([, c]) => c < 20);
console.log(`\nمنها نادرة (<20 مرّة في ٣٥ ألف سطر): ${rare.length}`);
console.log("الأندر:", rare.slice(-12).map(([c, n]) => `${c}(${n})`).join(" "));
console.log("\nالأكثر شيوعاً:", sorted.slice(0, 10).map(([c, n]) => `${c}=${n}`).join("  "));
