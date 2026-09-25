import { readFileSync } from "node:fs";
import { M3_MAP, M3_WIDTHS, m3Px, IZ_CPS, bounds, formOf } from "./lib.mjs";

const M3_BASE = 7;
let asc = 0, desc = 0;
const tallAbove = [], tallBelow = [];
for (const cp of IZ_CPS) {
  const c = M3_MAP.get(cp);
  if (c === undefined) continue;
  const b = bounds((x, y) => m3Px(c, x, y), 16, 16);
  if (b.empty) continue;
  const a = M3_BASE - b.minY, d = b.maxY - M3_BASE;
  if (a > asc) asc = a;
  if (d > desc) desc = d;
  if (a >= 7) tallAbove.push(`U+${cp.toString(16).toUpperCase()}(${formOf(cp)}) ${a} above`);
  if (d >= 5) tallBelow.push(`U+${cp.toString(16).toUpperCase()}(${formOf(cp)}) ${d} below`);
}
console.log(`Mother 3 relative to its baseline (row ${M3_BASE}): max ${asc} rows above, max ${desc} rows below`);
console.log(`  total band = ${asc + desc + 1} rows, Inazuma cell = 12`);
console.log("  tallest above:", tallAbove.join(", ") || "none");
console.log("  deepest below:", tallBelow.join(", ") || "none");

// Where does this cartridge's own Latin sit? Read FONT12.NFTR straight from disk.
const nftr = readFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/fontfiles/FONT12.NFTR");
let p = 0x10, plgc = -1, cmapInfo = [];
while (p < nftr.length - 8) {
  const k = nftr.toString("ascii", p, p + 4), sz = nftr.readUInt32LE(p + 4);
  if (!sz) break;
  if (k === "PLGC") plgc = p + 16;
  if (k === "CMAP") cmapInfo.push({ p, sz, first: nftr.readUInt16LE(p + 8), last: nftr.readUInt16LE(p + 10), type: nftr.readUInt16LE(p + 12) });
  p += sz;
}
const latPx = (slot, x, y) => { const b = y * 11 + x; return (nftr[plgc + slot * 17 + (b >> 3)] >> (7 - (b & 7))) & 1; };
// Find the direct CMAP that covers ASCII, then read 'A','x','g','0' out of it.
const direct = cmapInfo.find((c) => c.type === 0 && c.first <= 0x41 && c.last >= 0x7a);
console.log("\nASCII CMAP:", direct ? `0x${direct.first.toString(16)}..0x${direct.last.toString(16)} direct` : "not a direct map");
if (direct) {
  const base = nftr.readUInt16LE(direct.p + 16);
  for (const ch of ["A", "x", "g", "0", "T"]) {
    const slot = base + (ch.charCodeAt(0) - direct.first);
    const b = bounds((x, y) => latPx(slot, x, y), 11, 12);
    console.log(`  '${ch}' slot ${slot}: rows ${b.minY}..${b.maxY}`);
  }
}
