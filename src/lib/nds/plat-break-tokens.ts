/**
 * Platinum's two pause markers, in a shape that survives being edited.
 *
 * The game has three break codes. `CHAR_CR` (0xE000) is an ordinary line break
 * inside the box. The other two stop and wait for the player: `0x25BC`
 * (`CHAR_CONTROL_CLEAR`) blanks the box and starts a fresh page, `0x25BD`
 * (`CHAR_CONTROL_SCROLL`) scrolls the box up instead. The charmap decodes them
 * to the real control characters `\r` and `\f`, and that is where a translation
 * quietly dies:
 *
 *   - a `<textarea>` rewrites every `\r` it is given to `\n` — the HTML spec
 *     says so, and no code can switch it off;
 *   - `\f` draws nothing at all, so a translator cannot see it to keep it and
 *     a translation model has no reason to return it;
 *   - `.trim()` on a saved value eats a break that sits at the very end, and
 *     5,046 of the game's page breaks sit exactly there.
 *
 * Measured against the English ROM, 12,425 page breaks and 963 scroll breaks
 * were lost this way across 6,981 messages. A message that loses its pause does
 * not lose a pause only: everything after it keeps printing into a two-line box
 * that cannot hold it, so whole conversations never appear on screen.
 *
 * So the editor never holds the control characters at all. It holds `▼` and
 * `▽` — the same triangles the codes are named after, ordinary printable
 * characters that no normalisation, no `trim` and no model treats as special —
 * and they are turned back into `\r` and `\f` on the way to the ROM.
 *
 * Each token carries a real newline after it so the message still reads as
 * separate lines in the box. That is not only cosmetic: `countEffectiveLines`
 * counts newlines, and a message whose breaks were all `\r` used to count as a
 * single line and get flattened to one by `autoSyncLines`. The trailing newline
 * makes that arithmetic right again without touching the shared counter every
 * other game depends on.
 *
 * The exception is a token at the very end, which gets no newline: the 5,046
 * "press the button to close" markers would otherwise read as a second line and
 * invite the line balancer to split a one-line message in half.
 *
 * The round trip is exact rather than nearly so. Across all 46,053 messages of
 * the English ROM there is no `0x25BC` or `0x25BD` followed by `0xE000`, none
 * adjacent to each other, and none at the start of a message — so `▼\n` can be
 * read back as one code with nothing to disambiguate.
 */

/** `0x25BC` — wait for the player, then clear the box. */
export const PAGE_BREAK_TOKEN = "▼";
/** `0x25BD` — wait for the player, then scroll the box up. */
export const SCROLL_BREAK_TOKEN = "▽";

/** Both tokens, for anything that needs to spot one. */
export const PLAT_BREAK_TOKEN_RE = /[▼▽]/g;

const TO_TOKEN: Record<string, string> = { "\r": PAGE_BREAK_TOKEN, "\f": SCROLL_BREAK_TOKEN };
const FROM_TOKEN: Record<string, string> = { [PAGE_BREAK_TOKEN]: "\r", [SCROLL_BREAK_TOKEN]: "\f" };

/**
 * Decoded message → what the editor shows and stores.
 *
 * `\n` is deliberately untouched: it is the one break the editor never lost.
 */
export function toBreakTokens(text: string): string {
  return text.replace(/[\r\f]/g, (ch, at: number) =>
    TO_TOKEN[ch] + (at === text.length - 1 ? "" : "\n")
  );
}

/**
 * What the editor stores → what the encoder writes.
 *
 * The newline the token was given for display is swallowed with it, so a break
 * does not come back as a pause *and* a line break. A token the translator
 * typed without one still works.
 */
export function fromBreakTokens(text: string): string {
  return text.replace(/[▼▽]\n?/g, (m) => FROM_TOKEN[m[0]]);
}

/** How many pauses a message asks for — the number that must not shrink. */
export function countBreakTokens(text: string): number {
  return (text.match(PLAT_BREAK_TOKEN_RE) || []).length;
}
