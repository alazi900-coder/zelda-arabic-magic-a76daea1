/**
 * How wide each code draws, and which code each Arabic form should live in.
 *
 * The codes Arabic borrowed are kana codes, and every one of them came with a
 * width the game already had for it. They are not all the same: measured, they
 * run from 4 pixels to 8. That is why a line cannot be judged by counting
 * characters, and it is also why the font looked wrong.
 *
 * The glyphs are drawn 8 pixels wide, on the pitch Mother 3 used. Put one in a
 * code that advances 6 and its last two columns disappear under the next
 * letter; put a narrow one in a code that advances 8 and a two-pixel gap opens
 * where the letters should join. Both were happening: with the codes handed out
 * in codepoint order, 37 forms were being clipped and 42 left a gap.
 *
 * So the codes are handed out by width instead. Sorting the forms by how much
 * ink they carry and the codes by how far they advance, then pairing them in
 * order, is the assignment that makes the two agree as often as possible — 95
 * of 129 forms land on a code exactly as wide as they are, 14 are clipped by a
 * single column and 20 leave a single column of gap.
 *
 * Both tables below are measurements, not choices, and a test re-derives the
 * ink widths from the glyphs so they cannot drift apart.
 */

/**
 * The pen's advance for each Arabic code, in slot order.
 *
 * Read out of the emulator: every Arabic glyph was temporarily replaced by a
 * one-pixel bar down the left of its cell, so the ink on screen sits exactly
 * where the pen was, and a line of the codes gives every advance at once as the
 * distance between neighbouring bars. Both runs returned the same 129 numbers.
 */
export const PKM_SLOT_ADVANCES =
  "666666666866666666666668666648666666666666666888888888888888888888888888888888764888788466448888888888678778847888887877877777777";

/**
 * How many columns of the cell each glyph actually inks, in codepoint order.
 *
 * Derived from the shipped glyphs — `pkm-font.test.ts` recomputes it from the
 * bitmap and fails if this string no longer matches.
 */
export const PKM_GLYPH_INK_WIDTHS =
  "345643848684888582878585878587858686868686868585858588878887888888888787878786868686878587858886868486878685858786888885867676767";

function digits(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0) - 48);
}

/**
 * Which code each glyph should live in: `result[i]` is the byte that draws the
 * `i`-th codepoint.
 *
 * `slots` is the list of free codes in ascending order — the caller owns that
 * list, which keeps this module from having to know which codes the game still
 * prints itself.
 */
export function pkmSlotsByWidth(slots: number[]): number[] {
  const ink = digits(PKM_GLYPH_INK_WIDTHS);
  const advances = digits(PKM_SLOT_ADVANCES);
  if (slots.length !== ink.length || slots.length !== advances.length) {
    throw new Error(`قياسات الخط ${ink.length}/${advances.length} لا تطابق ${slots.length} خانة`);
  }
  // Narrowest glyph to narrowest code, and so on up. Ties keep their original
  // order, so the assignment is the same on every run.
  const byInk = ink.map((width, i) => ({ width, i })).sort((a, b) => a.width - b.width || a.i - b.i);
  const byAdvance = advances.map((width, i) => ({ width, i })).sort((a, b) => a.width - b.width || a.i - b.i);
  const out = new Array<number>(slots.length);
  byInk.forEach((glyph, n) => {
    out[glyph.i] = slots[byAdvance[n].i];
  });
  return out;
}

/** The advance of one code, for measuring a line. */
export function pkmAdvanceOfSlot(slots: number[], slot: number): number | undefined {
  const at = slots.indexOf(slot);
  return at < 0 ? undefined : PKM_SLOT_ADVANCES.charCodeAt(at) - 48;
}
