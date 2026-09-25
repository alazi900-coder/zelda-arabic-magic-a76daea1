import { readFileSync, writeFileSync } from "node:fs";
import { buildPkmRom, isBuiltPkmRom } from "./src/lib/pokemon/pkm-editor-bridge";

const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeemerald-en/pokeemerald.gba"));
const tr: Record<string, string> = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const r = buildPkmRom(rom, tr, { game: "emerald-source", relocate: true });
if ("error" in r) { console.log("ERROR:", r.error); process.exit(1); }
console.log(`wrote ${r.translatedLines} lines; too long ${r.tooLong.length}; relocated ${r.relocated}; free ${Math.round(r.freeSpaceLeft/1024)}KB; unmapped ${r.unmapped.length ? r.unmapped.join(" ") : "none"}`);
console.log("broken tags:", r.brokenTags.length);
console.log("stamped:", isBuiltPkmRom(r.rom, "emerald-source"));
for (const t of r.tooLong.slice(0, 8)) console.log("  too long:", JSON.stringify(t));
writeFileSync(process.argv[3], r.rom);
