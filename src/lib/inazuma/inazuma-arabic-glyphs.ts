/**
 * Arabic glyphs for Inazuma Eleven's NFTR fonts, rescaled from the same
 * hand-drawn pixel art already proven in Pokémon Platinum's Arabic patch
 * (src/lib/pokemon/pkm-font.ts, PKM_ARABIC_GLYPHS_B64) rather than drawn fresh.
 *
 * A first working set: the 19 presentation forms one test phrase needs.
 * Slots are Shift-JIS hiragana codes 0x829F-0x82F1 -- 83 of them, all dead in
 * an English-only ROM -- so no CMAP block is touched, only the glyph bitmap
 * and width already stored at that existing index. Extending this list only
 * needs more entries here, up to 83 total.
 */
export const INAZUMA_ARABIC_CODEPOINTS: number[] = [0xFE8D, 0xFE8E, 0xFE91, 0xFE92, 0xFEA3, 0xFEAE, 0xFEAF, 0xFED3, 0xFED4, 0xFEDC, 0xFEDF, 0xFEE2, 0xFEE3, 0xFEE6, 0xFEE8, 0xFEED, 0xFEF2, 0xFEF3, 0xFEF4];

/** 11x12, 1bpp, 17 bytes/glyph -- FONT12.NFTR and FONT12N.NFTR share this shape. */
export const INAZUMA_FONT12_GLYPHS_B64 = "AAAAAAAOAcA4BwDAAAAAAAAAAAAAAA4BwDgH/3/gAAAAAAAAAAAAAAAAA4fg+AMAQAAAAAAAAAAAAAAGB//v4wBAAAAAAAAAAAAA8A+G+PwAAAAAAAAAAAAAAAAAAAD/D+HD4DAAAAAAAAAAADAGAOAOAcPgMAAAAAAADAHA/A+H4PAAAAAAAAAAAAAMAcD8D4f/9+AAAAAAAAAAAAeDwPAHh//94AAAAAAAAAAAAAHAOAcHwOAAAAAAAAAAAAAAAAA8H8f//fwDAAAAAAAAAAAAAAAD5/7/gcAAAAAAAAAAAAAAMD3HP//vAAAAAAAAAAAAAYAwBgf/7+AAAAAAAAAAAAAAADwfw/g/AOPweAAAAAAAAAAAAAH3/+/8+/w/AAAAAAAAAAAAA4fg8A/AIAAAAAAAAAAAAAAGB//v78AAAAA=";
export const INAZUMA_FONT12_WIDTHS: number[] = [3, 11, 7, 11, 8, 11, 7, 7, 11, 11, 6, 11, 10, 11, 11, 8, 11, 7, 11];

/** 7x8, 1bpp, 7 bytes/glyph -- FONT8.NFTR. */
export const INAZUMA_FONT8_GLYPHS_B64 = "AAIGDBAAAAACBgwfwAAAAAABHAgAAAAAAx/IAAAAAweeAAAAAAACB/xgAAABAgY8YAAAg4ccAAAAAIOHH8AAAADjA5/AAAAAgYMYAAAAAAGHn/BAAAAAA9+EAAAAAQ2f2AAAAAEDH8AAAAABh48GcAAAAAf7/zgAAAABHBwAAAAAAx/cAA==";
export const INAZUMA_FONT8_WIDTHS: number[] = [2, 7, 4, 7, 5, 7, 4, 4, 7, 7, 4, 7, 6, 7, 7, 5, 7, 4, 7];
