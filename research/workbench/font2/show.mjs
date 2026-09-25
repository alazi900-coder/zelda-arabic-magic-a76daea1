import { M3_MAP, M3_WIDTHS, m3Px } from "./lib.mjs";
for (const arg of process.argv.slice(2)) {
  const cp = parseInt(arg, 16), c = M3_MAP.get(cp);
  console.log(`\nU+${arg.toUpperCase()} code 0x${c.toString(16)} width ${M3_WIDTHS[c]}`);
  for (let y = 0; y < 16; y++) {
    let r = "";
    for (let x = 0; x < 16; x++) r += m3Px(c, x, y) ? "#" : (x === M3_WIDTHS[c] ? "|" : ".");
    console.log(`  ${String(y).padStart(2)}${y === 7 ? ">" : " "}${r}`);
  }
}
