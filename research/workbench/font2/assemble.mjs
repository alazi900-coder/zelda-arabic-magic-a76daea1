import { M3_MAP, M3_WIDTHS, IZ_CPS } from "./lib.mjs";
import { fitToCell } from "./build.mjs";
import { DRAWN, drawnGrid } from "./drawn.mjs";

/**
 * Tah and zah, initial and medial. Mother 3's table has no entry for them, but
 * the glyphs are in its font unmapped at 0x94-0x97 -- the same loop-and-bar as
 * its tah final, with the left connector an initial form needs.
 */
export const RECOVERED = new Map([[0xFEC3, 0x96], [0xFEC4, 0x97], [0xFEC7, 0x95], [0xFEC8, 0x94]]);

/** 0xA0 and up is the original game's punctuation, whatever the table claims. */
const PUNCTUATION_BLOCK = 0xA0;

export function assemble() {
  const out = [];
  for (const cp of IZ_CPS) {
    const drawn = DRAWN.get(cp);
    if (drawn) { out.push({ cp, grid: drawnGrid(drawn), w: drawn.w, source: "drawn" }); continue; }
    const code = RECOVERED.get(cp) ?? M3_MAP.get(cp);
    if (code === undefined || code >= PUNCTUATION_BLOCK) { out.push({ cp, grid: null, w: 0, source: "missing" }); continue; }
    const r = fitToCell(code);
    if (!r?.grid) { out.push({ cp, grid: null, w: 0, source: "unfittable" }); continue; }
    out.push({ cp, grid: r.grid, w: Math.min(M3_WIDTHS[code], 11), source: RECOVERED.has(cp) ? "recovered" : "mother3", squeezed: r.notes.length });
  }
  return out;
}
