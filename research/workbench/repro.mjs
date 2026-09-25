import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Polyfill fetch() for plat-charmap.ts's ensurePlatTables(), which does
// fetch(CHARMAP_URL)/fetch(ARCHIVES_URL) against "/pokeplatinum-charmap.json"
// etc. In the browser that's relative to the site root; here we serve the
// real files straight off disk.
const PUBLIC_DIR = "/home/user/zelda-arabic-magic-a76daea1/public";
globalThis.fetch = async (url) => {
  const p = path.join(PUBLIC_DIR, url.toString());
  const data = readFileSync(p, "utf-8");
  return { ok: true, json: async () => JSON.parse(data) };
};

const { extractPlatEntries, buildPlatRom, restorePlatTranslations } = await import(
  "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-editor-bridge.ts"
);
const { ensurePlatTables, decodePlatMessage, encodePlatMessage, platCharmap } = await import(
  "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap.ts"
);
const { reshapeArabic } = await import(
  "/home/user/zelda-arabic-magic-a76daea1/src/lib/arabic-processing.ts"
);

await ensurePlatTables();

const rom = new Uint8Array(readFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/repro.nds"));

const { entries } = extractPlatEntries(rom);
const rowan = entries.find((e) => e.original.includes("If you need advice"));
console.log("Found entry:", rowan ? { file: rowan.msbtFile, index: rowan.index, maxBytes: rowan.maxBytes } : "NOT FOUND");
console.log("Original text:", JSON.stringify(rowan?.original));

// A realistic Arabic translation, same shape (no tags, similar length).
const arabicTranslation = "إذا احتجت إلى نصيحة، فأنا بالتأكيد\nقادر على تقديمها.\r";

const key = `${rowan.msbtFile}:${rowan.index}`;
const translations = { [key]: arabicTranslation };

console.log("\n--- Testing encodePlatMessage directly ---");
try {
  const shaped = reshapeArabic(arabicTranslation);
  const encoded = encodePlatMessage(shaped);
  console.log("Encoded OK, length:", encoded.length, "vs limit:", rowan.maxBytes);
} catch (err) {
  console.log("encodePlatMessage THREW:", err.constructor.name, err.message);
}

console.log("\n--- Testing full buildPlatRom ---");
const result = buildPlatRom(rom, translations);
console.log("translatedLines:", result.translatedLines);
console.log("brokenTags:", result.brokenTags);
console.log("tooLong:", result.tooLong);
console.log("unmapped:", result.unmapped);

// Now decode what actually landed in the rebuilt ROM's archive, to see what
// buildPlatRom() truly wrote for this exact message.
const { entries: entriesAfter } = extractPlatEntries(result.rom);
const rowanAfter = entriesAfter.find((e) => e.msbtFile === rowan.msbtFile && e.index === rowan.index);
console.log("\nText in rebuilt ROM at same slot:", JSON.stringify(rowanAfter?.original));
