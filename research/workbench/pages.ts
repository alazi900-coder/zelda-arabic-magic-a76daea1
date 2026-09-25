import { readFileSync, writeFileSync } from "node:fs";
const REPO = "/home/user/zelda-arabic-magic-a76daea1";
// @ts-ignore
globalThis.fetch = async (u: any) => ({ ok: true, json: async () => JSON.parse(readFileSync(`${REPO}/public/${String(u).replace(/^.*\//, "")}`, "utf8")) } as any);
import { ensurePlatTables } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap";
import { extractPlatEntries } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-editor-bridge";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
main();
async function main() {
await ensurePlatTables();
const { entries } = extractPlatEntries(new Uint8Array(readFileSync(`${SCR}/base_font3.nds`)));
const orig = new Map<string, string>();
for (const e of entries) orig.set(`${e.msbtFile}:${e.index}`, e.original);
const tr: Record<string,string> = JSON.parse(readFileSync(`${SCR}/translated.json`, "utf8"));

// أسطر كل صفحة: نقسم على ▼/▽ ثم نعدّ الأسطر غير الفارغة
const pages = (s: string) => s.split(/[▼▽]\n?/).map((p) => p.split("\n").filter((l) => l.trim() !== "").length);
const worse: string[] = [];
let over = 0;
for (const [k, v] of Object.entries(tr)) {
  const a = pages(orig.get(k)!), b = pages(v);
  const maxA = Math.max(...a), maxB = Math.max(...b);
  if (maxB > maxA) { worse.push(`${k}: الأصل حتى ${maxA} سطر/صفحة → الترجمة ${maxB}`); }
  if (maxB > 3) over++;
}
console.log("مدخلات صفحاتها صارت أطول من الأصل:", worse.length);
worse.slice(0, 60).forEach((w) => console.log("  - " + w));
console.log("مدخلات فيها صفحة > 3 أسطر:", over);
writeFileSync(`${SCR}/pages.json`, JSON.stringify(worse, null, 2));
}
