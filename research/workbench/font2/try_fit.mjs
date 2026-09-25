import { M3_MAP, M3_WIDTHS, IZ_CPS, bounds } from "./lib.mjs";
import { fitToCell } from "./build.mjs";
let ok = 0, squeezed = 0, failed = [];
for (const cp of IZ_CPS) {
  const c = M3_MAP.get(cp);
  if (c === undefined) continue;
  const r = fitToCell(c);
  if (!r || !r.grid) { failed.push(`U+${cp.toString(16).toUpperCase()} ${r ? r.notes.join("; ") : "empty"}`); continue; }
  ok++;
  if (r.notes.length) squeezed++;
  const b = bounds((x, y) => r.grid[y][x], 11, 12);
  if (!b.empty && b.maxX > M3_WIDTHS[c] - 1) failed.push(`U+${cp.toString(16).toUpperCase()} ink past advance`);
}
console.log(`fitted into 11x12: ${ok}   (of which ${squeezed} needed a row squeezed out)`);
console.log(`failures: ${failed.length}`);
failed.forEach((f) => console.log("  " + f));
