import { readFileSync, writeFileSync } from "fs";
import path from "path";

const PUBLIC_DIR = "/home/user/zelda-arabic-magic-a76daea1/public";
globalThis.fetch = async (url) => {
  const p = path.join(PUBLIC_DIR, url.toString());
  return { ok: true, json: async () => JSON.parse(readFileSync(p, "utf-8")) };
};

const { extractPlatEntries, buildPlatRom } = await import(
  "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-editor-bridge.ts"
);
const { ensurePlatTables, encodePlatMessage } = await import(
  "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap.ts"
);
const { reshapeArabic } = await import(
  "/home/user/zelda-arabic-magic-a76daea1/src/lib/arabic-processing.ts"
);

await ensurePlatTables();

const romPath = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/repro.nds";
const rom = new Uint8Array(readFileSync(romPath));
const { entries } = extractPlatEntries(rom);

const control = entries.find(e => e.original === "CONTROL INFO");
const adventure = entries.find(e => e.original === "ADVENTURE INFO");
const noinfo = entries.find(e => e.original === "NO INFO NEEDED");
console.log("control:", control && {file: control.msbtFile, index: control.index});
console.log("adventure:", adventure && {file: adventure.msbtFile, index: adventure.index});
console.log("noinfo:", noinfo && {file: noinfo.msbtFile, index: noinfo.index});

const translations = {};
if (control) translations[`${control.msbtFile}:${control.index}`] = "معلومات التحكم";
if (adventure) translations[`${adventure.msbtFile}:${adventure.index}`] = "معلومات المغامرة";
if (noinfo) translations[`${noinfo.msbtFile}:${noinfo.index}`] = "لا حاجة لمعلومات";

// sanity-check the encode step directly first
for (const [k, v] of Object.entries(translations)) {
  try {
    const enc = encodePlatMessage(reshapeArabic(v));
    console.log(`encode OK ${k}: ${enc.length} codes`);
  } catch (err) {
    console.log(`encode FAIL ${k}:`, err.message);
  }
}

const result = buildPlatRom(rom, translations);
console.log("translatedLines:", result.translatedLines, "brokenTags:", result.brokenTags, "tooLong:", result.tooLong, "unmapped:", result.unmapped);

writeFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/choice_test.nds", result.rom);
console.log("wrote choice_test.nds");
