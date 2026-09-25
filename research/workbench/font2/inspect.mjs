import { M3_MAP, M3_WIDTHS, m3Px, IZ_CPS, bounds } from "./lib.mjs";
// Are Mother 3 glyphs flush to column 0, and does the advance cover the ink?
let offLeft = 0, inkPast = 0;
for (const cp of IZ_CPS) {
  const c = M3_MAP.get(cp); if (c === undefined) continue;
  const b = bounds((x, y) => m3Px(c, x, y), 16, 16); if (b.empty) continue;
  if (b.minX !== 0) offLeft++;
  if (b.maxX > M3_WIDTHS[c] - 1) inkPast++;
}
console.log(`glyphs not flush to column 0: ${offLeft};  ink past the advance: ${inkPast}`);

// Print tah/zah, which Mother 3 only has in two of the four forms.
for (const cp of [0xFEC1, 0xFEC2, 0xFEC5, 0xFEC6, 0xFE81, 0xFE82]) {
  const c = M3_MAP.get(cp);
  console.log(`\nU+${cp.toString(16).toUpperCase()}  ${c === undefined ? "absent" : `code 0x${c.toString(16)} width ${M3_WIDTHS[c]}`}`);
  if (c === undefined) continue;
  for (let y = 0; y < 16; y++) {
    let row = "";
    for (let x = 0; x < 16; x++) row += m3Px(c, x, y) ? "#" : (x === M3_WIDTHS[c] ? "|" : ".");
    console.log(`  ${String(y).padStart(2)}${y === 7 ? ">" : " "}${row}`);
  }
}
