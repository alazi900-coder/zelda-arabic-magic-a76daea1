/**
 * Inazuma Eleven's page break, in a shape that survives being edited.
 *
 * The cartridge writes a page break -- "tap to read the next box" -- as the
 * two plain characters `\` and `f`. In the editor that is the worst possible
 * shape for it: it reads as a stray backslash glued to the next word, a
 * translation model has no reason to keep it, and a translator retyping the
 * line has no reason to notice it went missing. It is the same problem
 * Platinum had with its pause codes (see nds/plat-break-tokens.ts), and the
 * same fix: the editor never holds `\f` at all. It holds `▼`, a single
 * printable character no normalisation or model treats as special, and it is
 * turned back into `\f` on the way to the ROM.
 *
 * The token carries a real newline after it, because the next box starts on
 * its own fresh line: without it, the line counters and the line balancer
 * read the last line of one box and the first line of the next as one line,
 * and "fix" a message that was never too long. A token at the very end gets
 * no newline -- though measured against the cartridge, none sits there.
 *
 * The round trip is exact. Across all 35,183 translatable lines of the
 * cartridge, no `\f` is followed by `\n`, none is adjacent to another, and
 * none starts a line -- so `▼` plus one newline reads back as one `\f` with
 * nothing to disambiguate. And no line contains `▼` of its own: every
 * translatable line is plain ASCII.
 */

/** The editor's stand-in for the cartridge's two-character `\f`. */
export const INAZUMA_PAGE_BREAK_TOKEN = "▼";

/** What the cartridge (and `row.text`) holds → what the editor shows and stores. */
export function toInazumaBreakTokens(text: string): string {
  return text.replace(/\\f/g, (_m, at: number) =>
    INAZUMA_PAGE_BREAK_TOKEN + (at === text.length - 2 ? "" : "\n")
  );
}

/**
 * What the editor stores → the cartridge's `\f`.
 *
 * The newline the token was given for display is swallowed with it, so a
 * break does not come back as a new box *and* a line break. A token the
 * translator typed without one still works, and so does a literal `\f`
 * saved before this existed -- it is already in the cartridge's shape.
 */
export function fromInazumaBreakTokens(text: string): string {
  return text.replace(/▼\n?/g, "\\f");
}
