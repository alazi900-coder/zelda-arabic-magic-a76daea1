import { readFileSync, writeFileSync } from "node:fs";
import { ndsFileIdByPath, ndsFiles } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/nds-rom";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const rom = new Uint8Array(readFileSync(`${SCR}/kh358/kh358.nds`));
const byPath = ndsFileIdByPath(rom);
const files = ndsFiles(rom);
const f = files[byPath.get("ev/EV_TT.p2")!];
const buf = rom.subarray(f.start, f.end);
writeFileSync(`${SCR}/kh358/EV_TT.p2`, buf);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
console.log("الحجم:", buf.length);
console.log("أول 64 بايت:");
for (let r = 0; r < 4; r++) {
  const row = [...buf.subarray(r * 16, r * 16 + 16)].map(b => b.toString(16).padStart(2, "0")).join(" ");
  const asc = [...buf.subarray(r * 16, r * 16 + 16)].map(b => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".")).join("");
  console.log(`  ${(r * 16).toString(16).padStart(4, "0")}  ${row}  ${asc}`);
}
console.log("\nأول 8 قيم 32-bit:", Array.from({ length: 8 }, (_, i) => dv.getUint32(i * 4, true)).join(", "));
// ابحث عن أول نصّ إنجليزي وموضعه
const latin = new TextDecoder("latin1").decode(buf);
const at = latin.indexOf("Roxas");
console.log("\nأول \"Roxas\" عند:", at);
console.log("حوله:", JSON.stringify(latin.slice(at - 120, at + 120).replace(/[\x00-\x1f]/g, "·")));
