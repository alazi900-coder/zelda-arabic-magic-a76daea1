import { readFileSync } from "fs";
import { parseGtaIvGxt } from "@/lib/gtaiv/gxt-format";
import { GTAIV_RU_UNIT_TO_CODEPOINT } from "@/lib/gtaiv/gtaiv-ru-charmap";
const buf = readFileSync("/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/a5c910b1-russian_3.gxt");
const gxt = parseGtaIvGxt(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const counts = new Map<number, number>();
for (const t of gxt.tables) for (const e of t.entries)
  for (const u of Array.from(e.textUnits)) if (u > 127) counts.set(u, (counts.get(u) ?? 0) + 1);
const sorted = [...counts].sort((a, b) => b[1] - a[1]);
const unmapped = sorted.filter(([u]) => !GTAIV_RU_UNIT_TO_CODEPOINT.has(u));
console.log("distinct units >127:", sorted.length, "| unmapped by our table:", unmapped.length);
console.log("unmapped (top 20):", unmapped.slice(0, 20).map(([u, n]) => `${u}:${n}`).join(" "));
const H: Record<number, string> = { 180: "yeh.INI", 185: "yeh.MED", 186: "yeh.ISO", 471: "yeh.FIN", 191: "maksura.ISO", 171: "maksura.FIN" };
console.log("\nrank  unit  count   note");
sorted.slice(0, 25).forEach(([u, n], i) => {
  const cp = GTAIV_RU_UNIT_TO_CODEPOINT.get(u);
  console.log(`${(i + 1).toString().padStart(4)}  ${u.toString().padStart(4)}  ${n.toString().padStart(6)}   ${H[u] ?? (cp ? "U+" + cp.toString(16) : "UNMAPPED")}`);
});
console.log("\nyeh-family ranks:");
for (const u of [180, 185, 186, 471, 191, 171]) {
  const r = sorted.findIndex(([x]) => x === u);
  console.log(`  unit ${u} (${H[u]}): rank ${r + 1}, count ${counts.get(u) ?? 0}`);
}
