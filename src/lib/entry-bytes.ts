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
import { reshapeArabic, reverseBidi } from "@/lib/arabic-processing";
import { ARABIC_GLYPH_RASTERS } from "@/lib/fireemblem12/fe12-arabic-charmap";

/**
 * Bytes Fire Emblem 12 will actually spend on `text`: 1 for each ASCII
 * character (passed through as-is), 2 for each Arabic character that has a
 * slot in the game's patched font (`fe12-arabic-charmap.ts`; every mapped
 * codepoint is addressed by a 2-byte Shift-JIS-style code), 0 for a
 * character with no slot at all — it will not be written, matching what
 * `buildFireEmblem12Rom`'s `encodeFe12Arabic` actually does (drops it,
 * reports it as unsupported) rather than promising room it cannot use.
 */
function measureFe12Bytes(text: string): number {
  const visual = reverseBidi(reshapeArabic(text));
  let bytes = 0;
  for (const ch of visual) {
    const codepoint = ch.codePointAt(0)!;
    if (codepoint < 0x80) bytes += 1;
    else if (ARABIC_GLYPH_RASTERS.has(codepoint)) bytes += 2;
  }
  return bytes;
}

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
  if (msbtFile && msbtFile.startsWith("fe12/")) {
    return measureFe12Bytes(text);
  }
  return new TextEncoder().encode(text).length;
}
