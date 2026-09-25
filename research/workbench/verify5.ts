import { readFileSync } from "node:fs";
const REPO = "/home/user/zelda-arabic-magic-a76daea1";
// @ts-ignore
globalThis.fetch = async (u: any) => ({ ok: true, json: async () => JSON.parse(readFileSync(`${REPO}/public/${String(u).replace(/^.*\//, "")}`, "utf8")) } as any);
import { ensurePlatTables } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap";
import { extractPlatEntries, buildPlatRom } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-editor-bridge";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
main();
async function main() {
await ensurePlatTables();
const rom = new Uint8Array(readFileSync(`${SCR}/base_font3.nds`));
const { entries } = extractPlatEntries(rom);
const orig = new Map<string, string>();
for (const e of entries) orig.set(`${e.msbtFile}:${e.index}`, e.original);

const base: Record<string,string> = JSON.parse(readFileSync(`${SCR}/translated_fixed.json`, "utf8"));
const fix: Record<string,string> = JSON.parse(readFileSync(`${SCR}/plat-breaks-final5.json`, "utf8"));
const seq = (s: string) => (s.match(/[▼▽]/g) ?? []).join("");
const bare = (s: string) => s.replace(/[▼▽]/g, "").replace(/\s+/g, " ").trim();
const pages = (s: string) => s.split(/[▼▽]\n?/).map((p) => p.split("\n").filter((l) => l.trim() !== "").length);

for (const [k, v] of Object.entries(fix)) {
  const o = orig.get(k)!;
  const okSeq = seq(v) === seq(o);
  const okWords = bare(v) === bare(base[k]);
  const pe = pages(o), pv = pages(v);
  const okPages = pv.length === pe.length && pv.every((n, i) => n <= pe[i]);
  console.log(`${okSeq && okWords && okPages ? "✅" : "❌"} ${k}`);
  console.log(`   الفواصل : ${seq(v)}  ${okSeq ? "= الأصل" : "≠ الأصل " + seq(o)}`);
  console.log(`   الكلمات : ${okWords ? "لم تتغيّر ولا كلمة" : "❌ تغيّرت"}`);
  console.log(`   الأسطر/صفحة: الترجمة [${pv}] / الأصل [${pe}] ${okPages ? "" : "❌"}`);
}

// بناء كامل: الملف المستورد + التصحيحات الخمس
const all = { ...base, ...fix };
const r = buildPlatRom(rom, all);
console.log(`\n=== بناء الروم بـ ${Object.keys(all).length} مدخلة ===`);
console.log("  أسطر كُتبت    :", r.translatedLines);
console.log("  وسوم مكسورة  :", r.brokenTags.length);
console.log("  أطول من الحدّ :", r.tooLong.length);
console.log("  حروف بلا خانة:", r.unmapped.join(" ") || "(لا شيء)");
console.log("  فواصل ناقصة  :", r.lostBreaks.length, r.lostBreaks.join(", ") || "");
}
