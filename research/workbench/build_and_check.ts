import { readFileSync, writeFileSync } from "node:fs";
const REPO = "/home/user/zelda-arabic-magic-a76daea1";
// @ts-ignore
globalThis.fetch = async (u: any) => ({ ok: true, json: async () => JSON.parse(readFileSync(`${REPO}/public/${String(u).replace(/^.*\//, "")}`, "utf8")) } as any);
import { ensurePlatTables } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap";
import { buildPlatRom, extractPlatEntries } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-editor-bridge";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const UP = "/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b";
main();
async function main() {
  await ensurePlatTables();
  const rom = new Uint8Array(readFileSync(`${SCR}/v4.nds`));
  const translations: Record<string, string> = JSON.parse(readFileSync(`${UP}/803aa87a-_____________.json`, "utf8"));
  const r = buildPlatRom(rom, translations);
  console.log("أسطر كُتبت:", r.translatedLines);
  console.log("وسوم مكسورة:", r.brokenTags.length, r.brokenTags.slice(0, 5));
  console.log("أطول من الحدّ:", r.tooLong.length);
  console.log("حروف بلا خانة:", r.unmapped.join(" ") || "لا شيء");
  console.log("فواصل ناقصة:", r.lostBreaks.length);
  writeFileSync(`${SCR}/built_from_v4.nds`, r.rom);

  // الآن أعِد استخراج المدخل 937 من الروم المبني فعلياً وقارنه بالأصل
  const { entries } = extractPlatEntries(r.rom);
  const e937 = entries.find((e) => e.msbtFile === "platinum/battle_strings" && e.index === 937);
  console.log("\nplatinum/battle_strings:937 في الروم المبني =", JSON.stringify(e937?.original ?? "(غير موجودة كمدخل قابل للترجمة — فُحصت مباشرة أدناه)"));
}
