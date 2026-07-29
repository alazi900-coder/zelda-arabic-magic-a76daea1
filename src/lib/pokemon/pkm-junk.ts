/**
 * Warning the translator about lines that may not be text at all.
 *
 * The scanner recognises a line by its bytes: a run the game's character set
 * can draw, ending in the terminator. Graphics and code contain such runs by
 * accident, and a few hundred of them reach the editor looking like «QQh
 * VSRRiiRRViiR kii» or «lzz lzz». Translating one writes Arabic over whatever
 * those bytes really were.
 *
 * They are not hidden, and this is not a filter. Three ways of telling them
 * apart were measured against the ROM and each one threw away real text:
 *
 *   - Case and spelling shape («WALLY'S HOUSE», «I... I only wanted...» went).
 *   - Letter-pair frequency, the classic test: it drops «Pika pika!», «Gau
 *     gau!» and «Oops!», which the game really does print.
 *   - Reachability — no pointer, no list — which loses 1403 lines of real
 *     dialogue whose pointers this tool cannot find.
 *
 * So the honest thing left is to say "this may not be text" and let the
 * translator decide, rather than to decide for them and be wrong a few hundred
 * times either way. The threshold is deliberately low: it fires on the runs
 * that carry no vowel-bearing word at all, which is where the accidents sit
 * and where even a Pokémon cry does not.
 */

/** Letters that make a syllable — `é` included, since POKéMON is a word here. */
const VOWELS = /[aeiouyéAEIOUYÉ]/;

/**
 * True when nothing in the line reads like a spoken word.
 *
 * A cry like «Pika pika!» passes (its words carry vowels) and so does any
 * ordinary sentence; «lzz lzz», «STVYZ» and «QQh» do not. A line of digits or
 * punctuation says nothing either way and is left alone.
 */
export function pkmLooksNonLinguistic(text: string): boolean {
  const words = text
    .replace(/\{[^}]*\}/g, " ")
    .split(/[\s\n]+/)
    .map((w) => w.replace(/[^A-Za-zé]/g, ""))
    .filter((w) => w.length >= 3);
  if (words.length === 0) return false;
  return words.every((w) => !VOWELS.test(w));
}
