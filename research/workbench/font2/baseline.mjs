import { M3_MAP, M3_WIDTHS, m3Px, IZ_CPS, IZ12_W, iz12Px, IZ8_W, iz8Px, formOf, joinsLeft, joinsRight, bounds } from "./lib.mjs";

/**
 * The joining stroke sits exactly on the baseline, so the rows carrying ink in
 * the connecting column give the baseline directly -- no guessing from the
 * NFTR header, which describes Latin, not Arabic.
 */
function baselineFrom(cps, pxFor, widthFor, cellW, cellH, label) {
  const tally = new Map();
  for (const cp of cps) {
    if (!joinsLeft(cp)) continue;
    const px = pxFor(cp);
    if (!px) continue;
    const rows = [];
    for (let y = 0; y < cellH; y++) if (px(0, y)) rows.push(y);
    if (rows.length === 0 || rows.length > 3) continue; // a thick or absent stroke tells us nothing
    const row = rows[rows.length - 1];
    tally.set(row, (tally.get(row) || 0) + 1);
  }
  const sorted = [...tally].sort((a, b) => b[1] - a[1]);
  console.log(`${label}: left-join stroke rows ->`, sorted.map(([r, n]) => `row ${r} x${n}`).join(", "));
  return sorted[0][0];
}

const m3Base = baselineFrom([...M3_MAP.keys()],
  (cp) => { const c = M3_MAP.get(cp); return c === undefined ? null : (x, y) => m3Px(c, x, y); },
  (cp) => M3_WIDTHS[M3_MAP.get(cp)], 16, 16, "Mother 3 (16x16)");

const izBase = baselineFrom(IZ_CPS,
  (cp) => { const s = IZ_CPS.indexOf(cp); return s < 0 ? null : (x, y) => iz12Px(s, x, y); },
  (cp) => IZ12_W[IZ_CPS.indexOf(cp)], 11, 12, "Inazuma FONT12 (11x12)");

const iz8Base = baselineFrom(IZ_CPS,
  (cp) => { const s = IZ_CPS.indexOf(cp); return s < 0 ? null : (x, y) => iz8Px(s, x, y); },
  (cp) => IZ8_W[IZ_CPS.indexOf(cp)], 7, 8, "Inazuma FONT8 (7x8)");

console.log(`\nbaselines: m3=${m3Base}  font12=${izBase}  font8=${iz8Base}`);
console.log(`vertical shift for a straight copy: ${izBase - m3Base}`);

// Does Mother 3 use the same joining sides as Inazuma?
let lOk = 0, lBad = 0, rOk = 0, rBad = 0;
for (const [cp, code] of M3_MAP) {
  const w = M3_WIDTHS[code];
  let l = false, r = false;
  for (let y = 0; y < 16; y++) { if (m3Px(code, 0, y)) l = true; if (m3Px(code, w - 1, y)) r = true; }
  if (joinsLeft(cp)) (l ? lOk++ : lBad++);
  if (joinsRight(cp)) (r ? rOk++ : rBad++);
}
console.log(`Mother 3 joining columns: left ${lOk} ok / ${lBad} missing,  right ${rOk} ok / ${rBad} missing`);
