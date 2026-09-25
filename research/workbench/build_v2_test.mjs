import { readFileSync, writeFileSync } from "fs";
import path from "path";
const PUBLIC_DIR = "/home/user/zelda-arabic-magic-a76daea1/public";
globalThis.fetch = async (url) => {
  const p = path.join(PUBLIC_DIR, url.toString());
  return { ok: true, json: async () => JSON.parse(readFileSync(p, "utf-8")) };
};
const { extractPlatEntries, buildPlatRom } = await import("/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-editor-bridge.ts");
const { ensurePlatTables } = await import("/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap.ts");
await ensurePlatTables();

const romPath = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/repro_v2.nds";
const rom = new Uint8Array(readFileSync(romPath));
const { entries } = extractPlatEntries(rom);
const control = entries.find(e => e.original === "CONTROL INFO");
const adventure = entries.find(e => e.original === "ADVENTURE INFO");
const noinfo = entries.find(e => e.original === "NO INFO NEEDED");

const translations = {};
translations[`${control.msbtFile}:${control.index}`] = "معلومات التحكم";
translations[`${adventure.msbtFile}:${adventure.index}`] = "معلومات المغامرة";
translations[`${noinfo.msbtFile}:${noinfo.index}`] = "لا حاجة لمعلومات";

const result = buildPlatRom(rom, translations);
console.log("translatedLines:", result.translatedLines, "unmapped:", result.unmapped);
writeFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/v2_test.nds", result.rom);
