import { readFileSync, writeFileSync } from "node:fs";
import { ensurePlatTables } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap";
import { extractPlatEntries } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-editor-bridge";
import { fromBreakTokens } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-break-tokens";
import { encodePlatMessage } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap";
import { reshapeArabic } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/arabic-processing";

const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";

const REPO = "/home/user/zelda-arabic-magic-a76daea1";
// @ts-ignore
globalThis.fetch = async (u: any) => {
  const p = String(u).replace(/^.*\//, "");
  const body = readFileSync(`${REPO}/public/${p}`, "utf8");
  return { ok: true, json: async () => JSON.parse(body) } as any;
};

main();
async function main() {
await ensurePlatTables();


const rom = new Uint8Array(readFileSync(`${SCR}/base_font3.nds`));
const { entries } = extractPlatEntries(rom);
const orig = new Map<string, { original: string; maxBytes: number }>();
for (const e of entries) orig.set(`${e.msbtFile}:${e.index}`, { original: e.original, maxBytes: e.maxBytes });

const tr: Record<string, string> = JSON.parse(readFileSync(`${SCR}/translated_fixed.json`, "utf8"));

const seq = (s: string) => (s.match(/[▼▽]/g) ?? []).join("");
const TAG = /\{[^}]*\}/g;
const tags = (s: string) => s.match(TAG) ?? [];

const missingKey: string[] = [];
const breakDiff: string[] = [];
const tagDiff: string[] = [];
const encodeFail: string[] = [];
const tooLong: string[] = [];
const latin: string[] = [];
const trailingSpace: string[] = [];
const untranslated: string[] = [];

for (const [key, val] of Object.entries(tr)) {
  const o = orig.get(key);
  if (!o) { missingKey.push(key); continue; }

  if (seq(val) !== seq(o.original)) breakDiff.push(`${key}\n    الأصل : ${seq(o.original) || "(لا شيء)"}\n    الترجمة: ${seq(val) || "(لا شيء)"}`);

  const a = tags(o.original).join("|"), b = tags(val).join("|");
  if (a !== b) tagDiff.push(`${key}\n    الأصل : ${a || "(لا شيء)"}\n    الترجمة: ${b || "(لا شيء)"}`);

  let bytes = -1;
  try {
    bytes = encodePlatMessage(reshapeArabic(fromBreakTokens(val))).length * 2;
  } catch (err) {
    encodeFail.push(`${key}: ${(err as Error).message}`);
  }
  if (bytes > 0 && o.maxBytes > 0 && bytes > o.maxBytes) tooLong.push(`${key}: ${bytes} > ${o.maxBytes}`);

  // حروف لاتينية داخل النص (خارج الوسوم)
  const bare = val.replace(TAG, "");
  const words = bare.match(/[A-Za-z]{2,}/g);
  if (words) latin.push(`${key}: ${words.join(", ")}`);
  const stray = bare.match(/(?:^|[\s\n])[A-Za-z](?=[؀-ۿ])/g);
  if (stray) latin.push(`${key}: حرف لاتيني ملتصق → ${JSON.stringify(stray)}`);

  if (/[ \t]+(\n|$)/.test(val)) trailingSpace.push(key);
  if (!/[؀-ۿ]/.test(val)) untranslated.push(key);
}

const report = (title: string, list: string[]) => {
  console.log(`\n### ${title}: ${list.length}`);
  list.slice(0, 40).forEach((l) => console.log("  - " + l));
  if (list.length > 40) console.log(`  … و${list.length - 40} أخرى`);
};

console.log(`مدخلات الملف: ${Object.keys(tr).length}`);
console.log(`مدخلات الروم الإنجليزي: ${orig.size}`);
report("مفاتيح غير موجودة في الروم", missingKey);
report("تسلسل الفواصل ▼▽ مختلف عن الأصل", breakDiff);
report("الوسوم {} مختلفة عن الأصل", tagDiff);
report("فشل الترميز (حروف بلا خانة في الخط)", encodeFail);
report("أطول من المساحة المتاحة", tooLong);
report("كلمات/حروف لاتينية متبقية", latin);
report("مسافات زائدة قبل نهاية السطر", trailingSpace);
report("لا يحتوي أي حرف عربي", untranslated);

writeFileSync(`${SCR}/validation_report_fixed.json`, JSON.stringify({ missingKey, breakDiff, tagDiff, encodeFail, tooLong, latin, trailingSpace, untranslated }, null, 2));

}
