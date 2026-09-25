import { readFileSync } from "node:fs";
import { ndsFileIdByPath, ndsFiles } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/nds-rom";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const rom = new Uint8Array(readFileSync(`${SCR}/kh358/kh358.nds`));
const byPath = ndsFileIdByPath(rom); const files = ndsFiles(rom);
const zs = [...byPath.keys()].filter((p) => p.endsWith(".z")).slice(0, 6);
for (const p of zs) {
  const f = files[byPath.get(p)!];
  const h = rom.subarray(f.start, f.start + 8);
  console.log(`${p.padEnd(18)} ${String(f.end - f.start).padStart(7)} بايت  ترويسة=${[...h].map(b => b.toString(16).padStart(2,"0")).join(" ")}`);
}
// إحصاء أنواع الترويسات لكل ملفات .z
const kinds = new Map<number, number>();
for (const [p, id] of byPath) {
  if (!p.endsWith(".z")) continue;
  const f = files[id];
  kinds.set(rom[f.start], (kinds.get(rom[f.start]) ?? 0) + 1);
}
console.log("\nأول بايت في ملفات .z:", [...kinds.entries()].map(([k, n]) => `0x${k.toString(16)}=${n}`).join("  "));
