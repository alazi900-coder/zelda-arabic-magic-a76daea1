import { readFileSync, writeFileSync } from "node:fs";
const REPO = "/home/user/zelda-arabic-magic-a76daea1";
// @ts-ignore
globalThis.fetch = async (u: any) => ({ ok: true, json: async () => JSON.parse(readFileSync(`${REPO}/public/${String(u).replace(/^.*\//, "")}`, "utf8")) } as any);
import { ensurePlatTables, encodePlatMessage } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap";
import { reshapeArabic } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/arabic-processing";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
main();
async function main() {
  await ensurePlatTables();
  const codes = encodePlatMessage(reshapeArabic("بوكيمون"));
  console.log("رموز «بوكيمون»:", codes.join(" "));
  console.log("أرقام الرسمات (الرمز − 1):", codes.map((c) => c - 1).join(" "));
  writeFileSync(`${SCR}/word_glyphs.json`, JSON.stringify(codes.map((c) => c - 1)));
}
