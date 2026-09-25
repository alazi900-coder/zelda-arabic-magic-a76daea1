import { readFileSync } from "node:fs";
export const REPO = "/home/user/zelda-arabic-magic-a76daea1";

// ---- Mother 3 source font: 16x16, 1bpp, 0x20 bytes per glyph ----
const m3src = readFileSync(`${REPO}/src/lib/mother3/m3-arabic-font.ts`, "utf-8");
export const M3_FONT = Buffer.from(m3src.match(/M3_ARABIC_FONT_B64 = "([^"]+)"/)[1], "base64");
export const M3_WIDTHS = Buffer.from(m3src.match(/M3_ARABIC_WIDTHS_B64 = "([^"]+)"/)[1], "base64");
const tbl = readFileSync(`${REPO}/src/lib/mother3/m3-arabic-table.ts`, "utf-8");
export const M3_MAP = new Map();
for (const m of tbl.matchAll(/"\\u([0-9a-fA-F]{4})":\s*(0x[0-9A-Fa-f]+)/g)) {
  M3_MAP.set(parseInt(m[1], 16), parseInt(m[2], 16));
}
export const m3Px = (code, x, y) =>
  (M3_FONT[code * 0x20 + y * 2 + (x >> 3)] >> (7 - (x & 7))) & 1;

// ---- current Inazuma glyphs ----
const iz = readFileSync(new URL("old-glyphs.ts", import.meta.url), "utf-8");  // the set being replaced, from git
const num = (s) => JSON.parse(s.replace(/0x[0-9A-Fa-f]+/g, (m) => parseInt(m, 16)));
export const IZ_CPS = num(iz.match(/INAZUMA_ARABIC_CODEPOINTS: number\[\] = (\[[^\]]+\])/)[1]);
export const IZ12 = Buffer.from(iz.match(/INAZUMA_FONT12_GLYPHS_B64 = "([^"]+)"/)[1], "base64");
export const IZ12_W = num(iz.match(/INAZUMA_FONT12_WIDTHS: number\[\] = (\[[^\]]+\])/)[1]);
export const IZ8 = Buffer.from(iz.match(/INAZUMA_FONT8_GLYPHS_B64 = "([^"]+)"/)[1], "base64");
export const IZ8_W = num(iz.match(/INAZUMA_FONT8_WIDTHS: number\[\] = (\[[^\]]+\])/)[1]);

/** Bits run continuously across the whole glyph, `cellW` per row, MSB first. */
export const packedPx = (buf, tileBytes, cellW, slot, x, y) => {
  const b = y * cellW + x;
  return (buf[slot * tileBytes + (b >> 3)] >> (7 - (b & 7))) & 1;
};
export const iz12Px = (slot, x, y) => packedPx(IZ12, 17, 11, slot, x, y);
export const iz8Px = (slot, x, y) => packedPx(IZ8, 7, 7, slot, x, y);

/** Which of the four joining forms a presentation-form codepoint is. */
const FOUR_FORM_ISOLATED = [
  0xFE8B - 2, 0xFE8F - 2, 0xFE97 - 2, 0xFE9B - 2, 0xFE9F - 2, 0xFEA3 - 2, 0xFEA7 - 2,
  0xFEB3 - 2, 0xFEB7 - 2, 0xFEBB - 2, 0xFEBF - 2, 0xFEC3 - 2, 0xFEC7 - 2, 0xFECB - 2,
  0xFECF - 2, 0xFED3 - 2, 0xFED7 - 2, 0xFEDB - 2, 0xFEDF - 2, 0xFEE3 - 2, 0xFEE7 - 2,
  0xFEEB - 2, 0xFEF3 - 2,
];
const TWO_FORM_ISOLATED = [
  0xFE80, 0xFE81, 0xFE83, 0xFE85, 0xFE87, 0xFE89, 0xFE8D, 0xFE93, 0xFEA9, 0xFEAB,
  0xFEAD, 0xFEAF, 0xFEB1, 0xFEED, 0xFEEF, 0xFEF1, 0xFEF5, 0xFEF7, 0xFEF9, 0xFEFB,
];
export function formOf(cp) {
  for (const iso of FOUR_FORM_ISOLATED) {
    if (cp === iso) return "isolated";
    if (cp === iso + 1) return "final";
    if (cp === iso + 2) return "initial";
    if (cp === iso + 3) return "medial";
  }
  for (const iso of TWO_FORM_ISOLATED) {
    if (cp === iso) return "isolated";
    if (cp === iso + 1) return "final";
  }
  return "isolated";
}
/** Joins toward the next letter, which is drawn to the LEFT (column 0). */
export const joinsLeft = (cp) => ["initial", "medial"].includes(formOf(cp));
/** Joins toward the previous letter, drawn to the RIGHT (column advance-1). */
export const joinsRight = (cp) => ["final", "medial"].includes(formOf(cp));

export function bounds(px, w, h) {
  let minX = 99, maxX = -1, minY = 99, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!px(x, y)) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1, empty: maxX < 0 };
}
