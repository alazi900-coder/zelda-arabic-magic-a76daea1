import { readFileSync } from "node:fs";
import { ndsFileIdByPath, ndsFiles } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/nds-rom";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const rom = new Uint8Array(readFileSync(`${SCR}/kh358/kh358.nds`));
const byPath = ndsFileIdByPath(rom);
const files = ndsFiles(rom);
const magic = (p: string) => {
  const f = files[byPath.get(p)!];
  const head = rom.subarray(f.start, f.start + 8);
  return { size: f.end - f.start, magic: String.fromCharCode(...head.subarray(0, 4)).replace(/[^\x20-\x7e]/g, "."), hex: [...head].map(b => b.toString(16).padStart(2, "0")).join(" ") };
};
console.log("=== مجلد text/ ===");
for (const p of [...byPath.keys()].filter((p) => p.startsWith("text/")).sort()) {
  const m = magic(p);
  console.log(`  ${p.padEnd(28)} ${String(m.size).padStart(9)} بايت  magic="${m.magic}"  ${m.hex}`);
}
console.log("\n=== خطوط NFTR ===");
for (const p of [...byPath.keys()].filter((p) => p.toLowerCase().endsWith(".nftr")).sort()) {
  const m = magic(p);
  console.log(`  ${p.padEnd(34)} ${String(m.size).padStart(7)} بايت  magic="${m.magic}"`);
}
