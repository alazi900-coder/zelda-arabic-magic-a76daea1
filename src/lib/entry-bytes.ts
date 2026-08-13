/**
 * How long a translation is, in the bytes the game it belongs to will store.
 *
 * The editor measured every translation with `TextEncoder`, i.e. in UTF-8. For
 * the games whose files hold UTF-8 that is the right answer. Pokémon Ruby
 * Destiny stores one byte per drawn character, so UTF-8 counts every Arabic
 * letter twice: «بلباصور» was reported as 14 bytes against a limit of 9 and
 * flagged as five bytes too long, when the ROM stores it in 7 and it fits with
 * room to spare. The translator was told to shorten a name that was already as
 * short as it goes.
 *
 * So the measurement asks the game. Anything without its own encoder keeps the
 * UTF-8 answer, which is what it was getting before.
 */

import { encodeArabicForPkm } from "@/lib/pokemon/pkm-charmap";
import { PKM_FILE_RE } from "@/lib/pokemon/pkm-categories";
import { RESHEF_ENTRY_FILE, measureReshefTextBytes } from "@/lib/yugioh/reshef-editor-bridge";

/**
 * Bytes this text will occupy in `msbtFile`'s game, excluding any terminator.
 *
 * A character with no slot in the font is counted as one byte: it will not be
 * written, but counting it as nothing would quietly promise room that the
 * translator cannot actually use.
 */
export function measureEntryBytes(msbtFile: string | undefined, text: string): number {
  if (!text) return 0;
  if (msbtFile && PKM_FILE_RE.test(msbtFile)) {
    const encoded = encodeArabicForPkm(text);
    return encoded.bytes.length + encoded.unmapped.length;
  }
  if (msbtFile === RESHEF_ENTRY_FILE) return measureReshefTextBytes(text);
  return new TextEncoder().encode(text).length;
}
