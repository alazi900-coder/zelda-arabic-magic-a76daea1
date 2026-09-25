import { M3_MAP, m3Px, IZ_CPS, IZ12_W, iz12Px, bounds } from "./lib.mjs";
const M3_BASE = 7;

const glyphs = [];
for (const cp of IZ_CPS) {
  const c = M3_MAP.get(cp);
  if (c === undefined) continue;
  const b = bounds((x, y) => m3Px(c, x, y), 16, 16);
  if (b.empty) continue;
  glyphs.push({ cp, above: M3_BASE - b.minY, below: b.maxY - M3_BASE });
}
console.log(`candidate baselines for a 12-row cell, over ${glyphs.length} Mother 3 glyphs:\n`);
for (let B = 5; B <= 11; B++) {
  let clippedGlyphs = 0, rowsLost = 0;
  for (const g of glyphs) {
    const top = B - g.above, bot = B + g.below;
    const lost = Math.max(0, -top) + Math.max(0, bot - 11);
    if (lost) { clippedGlyphs++; rowsLost += lost; }
  }
  console.log(`  baseline row ${B}: ${clippedGlyphs} glyphs clipped, ${rowsLost} rows lost total`);
}

// What the cartridge's existing Arabic does, for comparison.
const izRows = new Map();
for (let i = 0; i < IZ_CPS.length; i++) {
  const b = bounds((x, y) => iz12Px(i, x, y), 11, 12);
  if (!b.empty) izRows.set(b.maxY, (izRows.get(b.maxY) || 0) + 1);
}
console.log("\ncurrent Inazuma Arabic, bottom-most ink row:", [...izRows].sort((a,b)=>a[0]-b[0]).map(([r,n])=>`row ${r}:${n}`).join(" "));
