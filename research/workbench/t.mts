import { readFileSync, writeFileSync } from "node:fs";
import { extractPkmEntries, buildPkmRom, isBuiltPkmRom } from "./src/lib/pokemon/pkm-editor-bridge";
import { pkmCodecFor } from "./src/lib/pokemon/pkm-codec";

const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeemerald-en/pokeemerald.gba"));
const ar = new Uint8Array(readFileSync("/home/user/decomps/pokeemerald/pokeemerald.gba"));
const codec = pkmCodecFor(rom);
console.log("codec(en):", codec.game, " codec(ar):", pkmCodecFor(ar).game);
console.log("refuse en?", isBuiltPkmRom(rom, "emerald-source"), " refuse ar?", isBuiltPkmRom(ar, "emerald-source"));

const { entries, textBytes } = extractPkmEntries(rom, codec.game);
console.log("lines:", entries.length, " text:", Math.round(textBytes / 1024), "KB");
const byFile: Record<string, number> = {};
for (const e of entries) byFile[e.msbtFile] = (byFile[e.msbtFile] ?? 0) + 1;
console.log("categories:", byFile);
console.log("\nsamples:");
for (const f of Object.keys(byFile)) {
  const e = entries.find((x) => x.msbtFile === f)!;
  console.log(`  ${f}:  ${JSON.stringify(e.original.slice(0, 50))}`);
}
const hit = entries.find((e) => e.original.startsWith("PROF. BIRCH is in trouble"))!;
console.log("\ndialogue sample:", JSON.stringify(hit.original.slice(0, 80)));
const key = `${hit.msbtFile}:${hit.index}`;
const built = buildPkmRom(rom, { [key]: "مرحباً بك في عالم البوكيمون!\nهذا سطرٌ ثانٍ." }, { game: codec.game, relocate: true });
console.log("build:", "error" in built ? built.error : `wrote ${built.translatedLines}, free ${Math.round(built.freeSpaceLeft/1024)}KB, font=${built.fontApplied}`);
if (!("error" in built)) {
  writeFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/edited.gba", built.rom);
  console.log("stamped as translated?", isBuiltPkmRom(built.rom, "emerald-source"));
}
