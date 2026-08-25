/**
 * What counts as a technical tag, for anything that has to agree with the
 * screen.
 *
 * This is the pattern the entry card already used to draw a tag as a coloured
 * chip. It lives here rather than inside that component because a second
 * feature now depends on it: a line break that sits directly after a tag in
 * the original has to sit directly after that same tag in the translation, and
 * "that same tag" has to mean exactly what the translator sees highlighted —
 * not a second list that can quietly drift away from the first.
 *
 * It covers every shape this tool's games use: `{fb}` and `{FD:01}` (Gen 3
 * Pokémon), `[XENO:n ]` and `[System:PageBreak ]` (Xenoblade), `[TAG:...]`
 * (Metroid Prime), Unity/TMP tags such as `<h>` and `</h>` (LumenTale),
 * `<Exit>` (Risen), the private-use icons, and the bracketed forms with a
 * leading or trailing number.
 */

import { RISEN_TAG_REGEX } from "@/lib/risen-tag-guard";

const SOURCE = [
  "\\[\\s*\\w+\\s*:[^\\]]*?\\](?:\\s*\\([^)]{1,100}\\))?",
  "\\[\\s*\\w+\\s*=\\s*[^\\]]*\\]",
  "\\{\\s*\\w+\\s*:\\s*[^}]*\\}",
  "\\{(?:\\d+(?:\\.[A-Za-z_][\\w.-]*)?|[A-Za-z_][\\w.-]*)\\}",
  "\\d+\\s*\\[[A-Z]{2,10}\\]",
  "\\[[A-Z]{2,10}\\]\\s*\\d+",
  "\\\\?\\[\\s*\\/?\\s*\\w+\\s*:[^\\]]*?\\\\?\\]",
  "\\d+\\s*\\\\?\\[\\s*\\w+\\s*:[^\\]]*?\\\\?\\]",
  "\\\\?\\[\\s*[A-Za-z][A-Za-z0-9_]*(?:[ '\\/-]+[A-Za-z0-9]+)*\\s*\\\\?\\]",
  "#[0-5]",
  "~[^~\\r\\n]+~",
  "[\\uE000-\\uE0FF]+",
  "[\\uFFF9-\\uFFFC]",
  "<\\/?[A-Za-z][^>]*>|<\\/>",
  "\\\\[nrt]",
  "%(?:\\d+\\$)?[\\d.$-]*[sdif]",
  RISEN_TAG_REGEX.source,
].join("|");

/**
 * A fresh regex every call.
 *
 * A `g` regex carries `lastIndex` between calls, and the card's renderer uses
 * both `split` and `test` on the same object — so handing out one shared
 * instance would make the second caller skip matches.
 */
export function editorTagPattern(): RegExp {
  return new RegExp(`(${SOURCE})`, "g");
}
