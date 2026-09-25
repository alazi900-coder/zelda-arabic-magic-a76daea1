import { readFileSync, writeFileSync } from "node:fs";
import { extractPkmEntries } from "./src/lib/pokemon/pkm-editor-bridge";
import { toLogicalArabic } from "./src/lib/gba/emerald-source-arabic";

const pairs: Record<string, string> = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeemerald-en/pokeemerald.gba"));
const { entries } = extractPkmEntries(rom, "emerald-source");

/** The same key pair_src.py builds: what is left once layout is gone. */
const key = (s: string) =>
  s.replace(/\{[^}]*\}/g, "").replace(/[^0-9A-Za-zÀ-ÿ]/g, "").toUpperCase();

const out: Record<string, string> = {};
let hit = 0, miss = 0;
const missed: string[] = [];
for (const e of entries) {
  // The exact English first. The stripped key is a fallback for lines whose
  // layout the merge changed, and it is only trusted when there is enough of
  // it left to be one line and not another.
  const k = key(e.original);
  const v = pairs["=" + e.original] ?? (k.length >= 4 ? pairs[k] : undefined);
  if (v === undefined) { miss++; if (missed.length < 25) missed.push(e.original.slice(0, 60)); continue; }
  out[`${e.msbtFile}:${e.index}`] = toLogicalArabic(v);
  hit++;
}
console.log(`lines: ${entries.length}  translated: ${hit}  left English: ${miss}`);
console.log(`pairs unused: ${Object.keys(pairs).length - new Set(Object.values(out)).size}`);
console.log("\nsample of what stays English:");
for (const m of missed.slice(0, 12)) console.log("   ", JSON.stringify(m));
console.log("\nsample translations:");
let n = 0;
for (const [k2, v] of Object.entries(out)) {
  if (n++ > 5) break;
  const e = entries.find((x) => `${x.msbtFile}:${x.index}` === k2)!;
  console.log(`   ${JSON.stringify(e.original.slice(0, 45))}\n   -> ${JSON.stringify(v.slice(0, 45))}`);
}
writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
