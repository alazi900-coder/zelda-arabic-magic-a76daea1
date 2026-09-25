import { M3_MAP, M3_WIDTHS, m3Px, IZ_CPS } from "./lib.mjs";
import { fitToCell } from "./build.mjs";
for (const cp of IZ_CPS) {
  const c = M3_MAP.get(cp); if (c === undefined) continue;
  const r = fitToCell(c);
  if (!r.notes.length) continue;
  const w = M3_WIDTHS[c];
  console.log(`\nU+${cp.toString(16).toUpperCase()}  ${r.notes.length} row(s) dropped   (before | after, advance ${w})`);
  for (let y = 0; y < 16; y++) {
    let a = "";
    for (let x = 0; x < 11; x++) a += m3Px(c, x, y) ? "#" : ".";
    let b = "";
    if (y < 12) for (let x = 0; x < 11; x++) b += r.grid[y][x] ? "#" : ".";
    console.log(`  ${String(y).padStart(2)} ${a}   ${y < 12 ? (y === 6 ? ">" : " ") + b : ""}`);
  }
}
