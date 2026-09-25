import { readFileSync, writeFileSync } from "node:fs";
const REPO = "/home/user/zelda-arabic-magic-a76daea1";
// @ts-ignore
globalThis.fetch = async (u: any) => {
  const p = String(u).replace(/^.*\//, "");
  return { ok: true, json: async () => JSON.parse(readFileSync(`${REPO}/public/${p}`, "utf8")) } as any;
};
import { ensurePlatTables, encodePlatMessage, platCharmap } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap";
import { extractPlatEntries } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-editor-bridge";
import { fromBreakTokens } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-break-tokens";
import { reshapeArabic } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/arabic-processing";

const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";

main();
async function main() {
await ensurePlatTables();
const { entries } = extractPlatEntries(new Uint8Array(readFileSync(`${SCR}/base_font3.nds`)));
const orig = new Map<string, string>();
for (const e of entries) orig.set(`${e.msbtFile}:${e.index}`, e.original);
const tr: Record<string, string> = JSON.parse(readFileSync(`${SCR}/translated.json`, "utf8"));

const TAG = /\{[^}]*\}/g;
const bag = (s: string) => (s.match(TAG) ?? []).slice().sort().join("|");
const tagLost: string[] = [];
const tagReordered: string[] = [];
const badChars = new Map<string, string[]>();

for (const [key, val] of Object.entries(tr)) {
  const o = orig.get(key)!;
  if (bag(val) !== bag(o)) {
    tagLost.push(`${key}\n    الأصل : ${(o.match(TAG) ?? []).join("|") || "(لا شيء)"}\n    الترجمة: ${(val.match(TAG) ?? []).join("|") || "(لا شيء)"}`);
  } else if ((o.match(TAG) ?? []).join("|") !== (val.match(TAG) ?? []).join("|")) {
    tagReordered.push(key);
  }
  const shaped = reshapeArabic(fromBreakTokens(val));
  const cm = platCharmap();
  for (const ch of shaped) {
    if (!cm.toCode.has(ch) && !/[\r\n\f{}]/.test(ch)) {
      if (!badChars.has(ch)) badChars.set(ch, []);
      badChars.get(ch)!.push(key);
    }
  }
}
console.log("وسوم مفقودة/زائدة فعلاً :", tagLost.length);
tagLost.forEach((t) => console.log("  - " + t));
console.log("\nوسوم أُعيد ترتيبها فقط (مقبول للعربية):", tagReordered.length);
console.log("\nحروف بلا خانة في الخط:");
const rows = [...badChars.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [ch, keys] of rows) {
  console.log(`  U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")} «${ch}»  ${keys.length} مرة، في ${new Set(keys).size} مدخلة`);
}
writeFileSync(`${SCR}/analyze2.json`, JSON.stringify({ tagLost, tagReordered, badChars: Object.fromEntries([...badChars].map(([c, k]) => [c, [...new Set(k)]])) }, null, 2));
}
