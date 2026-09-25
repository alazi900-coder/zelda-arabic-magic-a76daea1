import { readFileSync } from "fs";
import path from "path";

const PUBLIC_DIR = "/home/user/zelda-arabic-magic-a76daei/public".replace("zelda-arabic-magic-a76daei","zelda-arabic-magic-a76daea1");
globalThis.fetch = async (url) => {
  const p = path.join(PUBLIC_DIR, url.toString());
  const data = readFileSync(p, "utf-8");
  return { ok: true, json: async () => JSON.parse(data) };
};

const { extractPlatEntries } = await import(
  "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-editor-bridge.ts"
);
const { ensurePlatTables } = await import(
  "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap.ts"
);
const { hasArabicChars } = await import(
  "/home/user/zelda-arabic-magic-a76daea1/src/lib/arabic-processing.ts"
);

await ensurePlatTables();

const rom = new Uint8Array(readFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/output_rom.nds"));
const { entries } = extractPlatEntries(rom);

const rowan = entries.find((e) => e.original.includes("If you need advice") || e.original.includes("قادر") || e.original.includes("نصيحة"));
console.log("Rowan-ish entry:", rowan ? { file: rowan.msbtFile, index: rowan.index } : "not found by english text");
console.log(JSON.stringify(rowan?.original));

// Also find by exact original english (in case not translated) at rowan_intro:1
const rowanExact = entries.find((e) => e.msbtFile === "platinum/rowan_intro" && e.index === 1);
console.log("\nrowan_intro:1 exact:", JSON.stringify(rowanExact?.original));

let arabicCount = 0, englishCount = 0;
for (const e of entries) {
  if (hasArabicChars(e.original)) arabicCount++;
  else englishCount++;
}
console.log(`\nTotals: ${arabicCount} entries with Arabic chars, ${englishCount} without (out of ${entries.length})`);
