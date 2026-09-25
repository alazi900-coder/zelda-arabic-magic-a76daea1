import { readFileSync } from "node:fs";
import { extractPkmEntries, buildPkmRom } from "./src/lib/pokemon/pkm-editor-bridge";

const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeemerald-en/pokeemerald.gba"));
const { entries } = extractPkmEntries(rom, "emerald-source");
console.log("=== JYNX ===");
for (const e of entries.filter((x) => x.original.includes("JYNX")))
  console.log(`  ${e.msbtFile}  offset ${e.index}  max ${e.maxBytes}  ${JSON.stringify(e.original)}`);
console.log("\n=== a few species, for comparison ===");
for (const n of ["BULBASAUR", "PIKACHU", "MEW", "PINECO"])
  for (const e of entries.filter((x) => x.original === n))
    console.log(`  ${e.msbtFile}  offset ${e.index}  max ${e.maxBytes}  ${n}`);

const tr: Record<string, string> = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const r = buildPkmRom(rom, tr, { game: "emerald-source", relocate: true });
if ("error" in r) throw new Error(r.error);
const byFile: Record<string, number> = {};
for (const t of r.tooLong) {
  const e = entries.find((x) => x.index === t.offset);
  const f = e?.msbtFile ?? "?";
  byFile[f] = (byFile[f] ?? 0) + 1;
}
console.log("\n=== 168 المتجاوزة: أين هي ===", byFile);
const over = r.tooLong.map((t) => t.needed - t.capacity).sort((a, b) => a - b);
console.log("الزيادة بالبايت: أقلّها", over[0], " وسطها", over[Math.floor(over.length / 2)], " أكثرها", over[over.length - 1]);
console.log("متجاوزة ببايت أو بايتين فقط:", over.filter((n) => n <= 2).length);
