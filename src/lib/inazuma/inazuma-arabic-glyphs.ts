/**
 * Arabic glyphs for Inazuma Eleven's NFTR fonts.
 *
 * The art is the hand-drawn set in src/lib/pokemon/pkm-font.ts
 * (PKM_ARABIC_GLYPHS_B64) -- the same 129 glyphs the Pokémon Platinum Arabic
 * project draws with. pokeplatinum-arabic/scripts/platinum_font.py imports
 * that loader rather than touching its own font narc, so this is the source,
 * not a copy of a copy.
 *
 * Its layout is documented by pokeemerald-arabic/scripts/import_pkm_font.py:
 * each glyph is 8 wide x 16 tall at 4bpp, four bytes a row, LSB-first across
 * x, with an advance of 8. Reading it out of the Platinum narc instead and
 * guessing at the layout (16x16, 2bpp, four 8x8 sub-tiles) is what an earlier
 * version did, and it produced sparse fragments -- letters a few pixels wide
 * whose baseline strokes were shot full of holes, which the game drew as
 * disconnected marks. The advance of 8 is what joins the script: a medial
 * letter's baseline spans all eight columns, so it meets the next letter
 * exactly. Source rows 4..15 fill Inazuma's 12-row cell, chosen over 3..14
 * because 14 glyphs put ink in row 15 and only 5 use row 3.
 *
 * The slots are NOT the hiragana range (0x829F-0x82F1 / glyphs 366-448) an
 * earlier version used. That range looked dead in an English-only ROM but is
 * not: 13,244 lines across this cartridge's own text (88,663 strings, every
 * text-bearing file in it) are untranslated Japanese that still uses it, so
 * patching it turned real on-screen text into scattered marks.
 *
 * These 83 slots come from FONT12.NFTR's own PAMC character map instead: a
 * 347-entry Shift-JIS table (codes 0x8140-0x829A) of which 149 codes are
 * confirmed absent from that same corpus AND resolve to a real glyph index
 * (not the 0xFFFF "no glyph" sentinel). That table is byte-identical in
 * FONT12.NFTR, FONT12N.NFTR and FONT8.NFTR, so one selection serves all
 * three. The codes and indices are scattered, so each slot is an explicit
 * triple.
 */
export const INAZUMA_ARABIC_CODEPOINTS: number[] = [0xFE8D, 0xFE8E, 0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0, 0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4, 0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4, 0xFEED, 0xFEEE, 0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8, 0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC, 0xFE8F, 0xFE90, 0xFE91, 0xFE92, 0xFE95, 0xFE96, 0xFE97, 0xFE98, 0xFEAD, 0xFEAE, 0xFEC9, 0xFECA, 0xFECB, 0xFECC, 0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4, 0xFED5, 0xFED6, 0xFED7, 0xFED8, 0xFED1, 0xFED2, 0xFED3, 0xFED4, 0xFEA9, 0xFEAA, 0xFED9, 0xFEDA, 0xFEDB, 0xFEDC, 0xFEF5, 0xFEF6, 0xFEF7, 0xFEF8, 0xFEF9, 0xFEFA, 0xFEFB, 0xFEFC, 0xFEA1, 0xFE9D, 0xFEB5, 0xFEB9, 0xFEC1, 0xFEA5, 0xFEAB, 0xFEBD, 0xFE99, 0xFEAF, 0xFECD, 0xFEC5, 0xFEA3, 0xFE83, 0xFE93, 0xFEEF, 0xFEA2, 0xFE9E, 0xFEB6];

/** The exact 2-byte Shift-JIS code (as encodeInazumaArabicText emits it) for each slot, same order as INAZUMA_ARABIC_CODEPOINTS. */
export const INAZUMA_SHIFT_JIS_CODES: number[] = [0x8141, 0x8143, 0x8144, 0x8147, 0x814A, 0x814B, 0x814C, 0x814D, 0x814E, 0x814F, 0x8150, 0x8151, 0x8152, 0x8153, 0x8154, 0x8155, 0x8156, 0x8157, 0x8158, 0x8159, 0x815A, 0x815C, 0x815D, 0x815F, 0x8161, 0x8162, 0x8164, 0x8165, 0x8166, 0x8167, 0x816B, 0x816C, 0x816D, 0x816E, 0x816F, 0x8170, 0x8171, 0x8172, 0x8173, 0x8174, 0x8177, 0x8178, 0x817B, 0x817D, 0x817E, 0x8180, 0x8184, 0x8185, 0x8186, 0x8187, 0x8188, 0x8189, 0x818A, 0x818B, 0x818C, 0x818D, 0x818E, 0x818F, 0x8190, 0x8192, 0x8193, 0x8194, 0x8196, 0x8197, 0x8198, 0x819B, 0x819D, 0x819E, 0x81A0, 0x81A2, 0x81A3, 0x81A4, 0x81A5, 0x81A7, 0x81A9, 0x81AA, 0x81AB, 0x81AC, 0x81B8, 0x81B9, 0x81BA, 0x81BB, 0x81BC];

/** The glyph index that Shift-JIS code already maps to via FONT12/FONT12N/FONT8's shared PAMC table -- where patchGlyphSlots overwrites the bitmap and width. */
export const INAZUMA_GLYPH_INDICES: number[] = [158, 160, 161, 164, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 185, 186, 188, 190, 191, 193, 194, 195, 196, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 212, 213, 216, 218, 219, 220, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 238, 239, 240, 242, 243, 244, 247, 249, 250, 252, 254, 255, 256, 257, 259, 261, 262, 263, 264, 265, 266, 267, 268, 269];

/** 11x12, 1bpp, 17 bytes/glyph -- FONT12.NFTR and FONT12N.NFTR share this shape. */
export const INAZUMA_FONT12_GLYPHS_B64 = "ABgDAGAMAYAwBAAAAAAAAAAAGAMAYAwBgD/D+AAAAAAAAAABgDAGBsGYMwfAcAAAAAAAAAGAMAYGwZgzx/hwAAAAAAAABgDAGAMAYDgGAAAAAAAAAAAGAMAYAwBgP8b4AAAAAAAAAAAAAAcH8bQ3BnD8DwHgKAAAAAAAAADg/jbG+M4fgeA8AAAAAAAAAYAwPAcAeAoAAAAAAAAAAAADAGA/xvh4CgAAAAAAAAAAHAfA2D4HgMAYAgAAAAAAAAAcB8DYP8e4wBgCAAAAAAAAAAABwHw9h+AYAAAAAAAAAAAAAAHAfD3H+BgAAAAAAAAAAAAcB8DYHwHgDAMDwHAAAAAAABwHwNgfwfgMAwPAcAAAAAAAGA7BmDMHwHAAAAAAAAAAAAAYDsGYM8f4cAAAAAAAAAAAYAgBgDA8BwAAAAAAAAAAAADAEAMAYD/G+AAAAAAAAAAeAoA4D4GwPAMAAAAAAAAAAAAAwDgPAeA/wfgAAAAAAAAAAAAAAAHAfD+H4DwDAAAAAAAAAAAAAcB8P8f4OAAAAAAAAAAAAAAMYYw/A8AwBAAAAAAAAAAAAAxhjD/D2DAEAAAAAAAAAAAAAYAwPAcAMAQAAAAAAAAAAAADAGA/xvgwBAAAAAAAAAHgKAxhjD8DwAAAAAAAAAAAAeAoDGGMP8PYAAAAAAAAAAAB4CgBgDA8BwAAAAAAAAAAAAHgKAMAYD/G+AAAAAAAAAAAAAAAAABgDgDAGB4DgCAAAAAAAAAAAGAPwPgYHgOAIAAAAAAAfg+A4B4HgMAfAcAAAAAAAAB/j/DgH8f4wB8BwAAAAAAAABwHwNA/B8AAAAAAAAAAAAAAHAfA0D/H+AAAAAAAAAAAAAAAgfD+N8bQ8AwAAAAAAAAAAACB8P43xtDwDAAAAAAAAAAAAwfg/D8FQAAAAAAAAAAAAAADB+D8P8VYAAAAAAAAHgKAOA8H4Zwxh+B4AAAAAAAeAoA4DwfhnDHH+HgAAAAAAHgKAOA8B4BwPAcAAAAAAAAAeAoA4DwHgHA/x3gAAAAAAAAMAQA4DwfhnDGH4HgAAAAAAAwBADgPB+GcMcf4eAAAAAAAMAQA4DwHgHA8BwAAAAAAAAAwBADgPAeAcD/HeAAAAAAAAAAAAAA4B4AwPgeAAAAAAAAAAAAAADgHgDA/x/gAAAAAAAAfB2D8HY4xhj+D4AAAAAAAAB8HYPwdjjGGP8PoAAAAAAAAHAcBgDgDgDg+B4AAAAAAAAAcBwGAOAOAOD/HuAAAAAAAAOAZgbA2BsDYHwfA8AAAAAAA4BmBsDYGwNgfh+DwAAAAAABgHgOwNgbA2BsD4PwfAAAAAGAfg7A2BsDYH4fg8AAAAAAAAA2BsDYGwPg+B4A4DgHgOAAADYGwNgbA+D+HoDgOAeA4AAANgbA2BsD4PgeAAAAAAAAAAA2BsDYGwPg/h6AAAAAAAAAAAAAAAAAB8D8BwGAYAwB+AAAAAAAAAAHwPwHAYBsDQH4ADAEAeAqB8P43xtDwDAAAAAAAAAAAAYBwGh/G8NgeAYAAAGAMAYA+B+DMPwfAAAAAAAAAAAAAABgCAfA/AcBgGAMAfgAABgCAOAeAMD4HgAAAAAAAAAAAYAgBgHAaH8bw2B4BgAAAMAQB4CgMYYw/A8AAAAAAAAAAAAAAGAIAYA4AwBgeA4AgAAAGAIAcB8DQHgOAwBmD4DgAYA8BwD4H4Mw/B8AAAAAAAAAAAAAAOAeAOD4HgAAAAAAAAOAeA4BwBgDAGAMAQAAAAAAAAB4CgDgPgbA8AwAAAAAAAAAAAAAABwfxtDcGcPwPAAAAAAAAAAB4D8BwH8Z4wB8BwAAAAAAAAHgPwHAfxnjYGgPgOAAMAQB4CoHw/jfG0PAMAAAAAA==";
export const INAZUMA_FONT12_WIDTHS: number[] = [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8];

/** 7x8, 1bpp, 7 bytes/glyph -- FONT8.NFTR. */
export const INAZUMA_FONT8_GLYPHS_B64 = "wYMGDBAAAMGDBg//wAAcO/fv3wAAHDv37//AAHDhw44YAABw4cOP/8AAAAP////+fAAAf////3wAAOHPHzwAAAHDj//8AAAD9++eMEAAA/fv//BAAADz//+AAAAA8///wAAAA/fvz754AAP37+/+eAAD9+/fAAAAA/fv/8AAAHDhzxwAAADhw4//wADx4+fPHAAAAOPHj+/AAAAA8///jgAAAPP//8AAAAM+f98YAAADPn//2AAAAOHPHhgAAAHDj//YAAHz/n/fAAAB8/5//8AAAfPhzxwAAAHzw4//wAAAAAOHhzxwAAADh+f8cAAD98+ePngAA/////54AAP3798AAAAD9+//wAAAAP////gAAAD////4AAAD///fAAAAA////8AAPn////+AAD5/////wAD58+fPHAAA+fPnz//AABw/////gAAcP////8AAcPPnzxwAAHDz58//wAAAA+fPngAAAAPnz//AAH7//z//gAB+//8//8AAffPj754AAH3z4+//wAD9+/fv3wAA/fv37/+AAPH79+/fvgD9+/fv/4AA/fv3758+fP379+//vnz9+/fvngAA/fv37/+AAAAAB8/fMH4AAAfP3z5+HHz////4AAAAOP///HDhw///3wAAAAHHz98wfnDj58+eAAAGDDj///xwcfP+f98AAAABw4eHPHBw4/fvnj98+fP//98AAAAD5++eAADx44cOHAAA8ePnzxwAAAAD/////gAAA/fv+/54AAP37//+fBx8////+AA=";
export const INAZUMA_FONT8_WIDTHS: number[] = [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];
