/**
 * Arabic glyphs for Inazuma Eleven's NFTR fonts, rescaled from the real
 * hand-drawn dialogue-font art (font_message, sub-file 1) in the Pokémon
 * Platinum Arabic project's own font narc -- the font the user's friend
 * drew for that project, not the Emerald/Ruby-Destiny-shared placeholder
 * previously used here. Extracted at glyph_index = charmap_code - 1 against
 * pokeplatinum's own tools/msgenc/charmap.txt Arabic presentation-form
 * section, then rescaled to Inazuma's cell shapes.
 *
 * A first working set: the 19 presentation forms one test phrase needs.
 * Slots are Shift-JIS hiragana codes 0x829F-0x82F1 -- 83 of them, all dead in
 * an English-only ROM -- so no CMAP block is touched, only the glyph bitmap
 * and width already stored at that existing index. Extending this list only
 * needs more entries here, up to 83 total.
 */
export const INAZUMA_ARABIC_CODEPOINTS: number[] = [0xFE8D, 0xFE8E, 0xFE91, 0xFE92, 0xFEA3, 0xFEAE, 0xFEAF, 0xFED3, 0xFED4, 0xFEDC, 0xFEDF, 0xFEE2, 0xFEE3, 0xFEE6, 0xFEE8, 0xFEED, 0xFEF2, 0xFEF3, 0xFEF4];

/** 11x12, 1bpp, 17 bytes/glyph -- FONT12.NFTR and FONT12N.NFTR share this shape. */
export const INAZUMA_FONT12_GLYPHS_B64 = "AAAAAAQAgBACAEAAAAAAAAAAAAAABACAEA4BwAAAAAAAAAAAAAAAAAAwBwBgCAAAAAAAAAAAAAAAADAPAeAYAAAAAAAAAAAAAAAAMA8B4AAAAAAAAAAAAAAAAAAADgGAMAOAIAAAAAAAAAABgDAOAYAwA4AgAAAAAABgHAOAcA8A4AAAAAAAAAAAAGAcA4BwDwHgAAAAAAAAAAABwAwBgHA/B+AAAAAAAAAAAAAADAGAMAcAYAAAAAAAAAAAAAAAAABwCgPgfAGAMAAAAAAAAAAAAHALAeA4AAAAAAAAAAAAAAGAeBsD4DgAAAAAAAAAAAAMAYAwDwHgAAAAAAAAAAAAAAADgHAOAcAgB4BwAAAAAAAAAAAAwD8H4GwHAOAcAAAAAAAAAAAwBwBgHAAAAAAAAAAAAAAAADAPAeA4AAAAAAA=";
export const INAZUMA_FONT12_WIDTHS: number[] = [6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];

/** 7x8, 1bpp, 7 bytes/glyph -- FONT8.NFTR. */
export const INAZUMA_FONT8_GLYPHS_B64 = "AADBgwAAAAAAwYcAAAAAAAEDBgAAAAABBwQAAAAAAYcAAAAAAAAGDAwAAAABBgwMAABBg4cAAAAAQYOHAAAAAcDDDwAAAAAAgQMAAAAAAAMHHgQAAAADBwwAAAAAA40OAAAAAIEHAAAAAAADhwgcAAAABg8aHDgAAAEDBgAAAAABBw4AAA==";
export const INAZUMA_FONT8_WIDTHS: number[] = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
