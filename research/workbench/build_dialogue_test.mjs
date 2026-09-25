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

const romPath = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/repro.nds";
const rom = new Uint8Array(readFileSync(romPath));
const { entries } = extractPlatEntries(rom);

const hello = entries.find(e => e.msbtFile === "platinum/rowan_intro" && e.index === 0);
console.log("hello:", hello && {file: hello.msbtFile, index: hello.index, original: hello.original});

const translations = {};
if (hello) translations[`${hello.msbtFile}:${hello.index}`] = "مرحبا!\nمن دواعي سروري مقابلتك!\rاهلا بك في عالم بوكيمون!\r";

const result = buildPlatRom(rom, translations);
console.log("translatedLines:", result.translatedLines, "brokenTags:", result.brokenTags, "tooLong:", result.tooLong, "unmapped:", result.unmapped);
writeFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/dialogue_test.nds", result.rom);
console.log("wrote dialogue_test.nds");
