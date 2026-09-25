import { readFileSync } from "node:fs";
import { ndsFileIdByPath, ndsFiles, looksLikeNdsRom } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/nds-rom";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const rom = new Uint8Array(readFileSync(`${SCR}/kh358/kh358.nds`));
console.log("روم NDS صالح؟", looksLikeNdsRom(rom));
console.log("العنوان:", new TextDecoder().decode(rom.subarray(0, 12)).replace(/\0/g, ""));
console.log("الرمز  :", new TextDecoder().decode(rom.subarray(12, 16)));
const byPath = ndsFileIdByPath(rom);
const files = ndsFiles(rom);
console.log("عدد الملفات:", byPath.size);
const exts = new Map<string, { n: number; bytes: number }>();
for (const [path, id] of byPath) {
  const ext = (path.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? "(بلا امتداد)").toLowerCase();
  const f = files[id];
  const size = f ? f.end - f.start : 0;
  const prev = exts.get(ext) ?? { n: 0, bytes: 0 };
  exts.set(ext, { n: prev.n + 1, bytes: prev.bytes + size });
}
console.log("\nالامتدادات:");
for (const [ext, v] of [...exts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 25)) {
  console.log(`  ${ext.padEnd(12)} ${String(v.n).padStart(5)} ملف   ${(v.bytes / 1048576).toFixed(1)} م.ب`);
}
console.log("\nمجلدات الجذر:");
const roots = new Map<string, number>();
for (const path of byPath.keys()) {
  const root = path.split("/")[0];
  roots.set(root, (roots.get(root) ?? 0) + 1);
}
for (const [r, n] of [...roots.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${r.padEnd(24)} ${n}`);
