/**
 * The build made from the pokeemerald source, as this tool sees it.
 *
 * It is a third game here, not a variant of the other two. Its Arabic sits in
 * codes chosen while the ROM was compiled, not in the ones a patcher had to
 * scavenge from a finished binary, so the byte tables below are the build's
 * own charmap.txt and nothing else. All 129 shapes are one byte: the last
 * thirteen came off the two-byte escape when the accented Latin letters the
 * European releases used turned out to be printed exactly once in the whole
 * game.
 *
 * Two things this build does that the others cannot, and both change what the
 * tool must do:
 *
 * The engine draws right to left itself -- every glyph's position is mirrored
 * inside its window -- so a line is stored in logical order. Reversing it here,
 * the way the patched ROMs need, would reverse it twice and put every word
 * back to front.
 *
 * The font is already in the ROM, compiled in, so nothing is injected. What is
 * injected instead is a table of the English each translated line replaced,
 * written into the padding past the end of the ROM behind a signature. That is
 * how the editor can still show the original of a line whose Arabic has long
 * since overwritten it -- and why one file is enough.
 */

import {
  decodeBytesWithTables,
  encodeArabicWithTables,
  type PkmCharTables,
  type PkmEncodeResult,
} from "@/lib/pokemon/pkm-charmap";

/** codepoint -> byte, straight from the build's charmap.txt. */
const ARABIC_TO_CODE = new Map<number, number>([
  [0x060c, 0x0a], [0x061b, 0x01], [0x061f, 0x0f], [0x0621, 0x17], [0xfe80, 0x18],
  [0xfe81, 0x1d], [0xfe82, 0x1f], [0xfe83, 0x25], [0xfe84, 0x2a], [0xfe85, 0x2c],
  [0xfe86, 0x2f], [0xfe87, 0x30], [0xfe88, 0x31], [0xfe89, 0x32], [0xfe8a, 0x33],
  [0xfe8b, 0x34], [0xfe8c, 0x37], [0xfe8d, 0x38], [0xfe8e, 0x39], [0xfe8f, 0x3a],
  [0xfe90, 0x3b], [0xfe91, 0x3c], [0xfe92, 0x3d], [0xfe93, 0x3e], [0xfe94, 0x3f],
  [0xfe95, 0x40], [0xfe96, 0x41], [0xfe97, 0x42], [0xfe98, 0x43], [0xfe99, 0x04],
  [0xfe9a, 0x09], [0xfe9b, 0x14], [0xfe9c, 0x16], [0xfe9d, 0x44], [0xfe9e, 0x45],
  [0xfe9f, 0x46], [0xfea0, 0x47], [0xfea1, 0x48], [0xfea2, 0x49], [0xfea3, 0x4a],
  [0xfea4, 0x4b], [0xfea5, 0x4c], [0xfea6, 0x4d], [0xfea7, 0x4e], [0xfea8, 0x4f],
  [0xfea9, 0x50], [0xfeaa, 0x53], [0xfeab, 0x1a], [0xfeac, 0x1e], [0xfead, 0x54],
  [0xfeae, 0x55], [0xfeaf, 0x21], [0xfeb0, 0x24], [0xfeb1, 0x56], [0xfeb2, 0x57],
  [0xfeb3, 0x58], [0xfeb4, 0x59], [0xfeb5, 0x5e], [0xfeb6, 0x5f], [0xfeb7, 0x60],
  [0xfeb8, 0x61], [0xfeb9, 0x62], [0xfeba, 0x63], [0xfebb, 0x64], [0xfebc, 0x65],
  [0xfebd, 0x66], [0xfebe, 0x67], [0xfebf, 0x69], [0xfec0, 0x6a], [0xfec1, 0x6b],
  [0xfec2, 0x6c], [0xfec3, 0x6d], [0xfec4, 0x6e], [0xfec5, 0x26], [0xfec6, 0x2b],
  [0xfec7, 0x68], [0xfec8, 0xf3], [0xfec9, 0x70], [0xfeca, 0x71], [0xfecb, 0x72],
  [0xfecc, 0x73], [0xfecd, 0x74], [0xfece, 0x75], [0xfecf, 0x76], [0xfed0, 0x77],
  [0xfed1, 0x78], [0xfed2, 0x79], [0xfed3, 0x7a], [0xfed4, 0x7b], [0xfed5, 0x7c],
  [0xfed6, 0x7d], [0xfed7, 0x7e], [0xfed8, 0x7f], [0xfed9, 0x80], [0xfeda, 0x81],
  [0xfedb, 0x82], [0xfedc, 0x83], [0xfedd, 0x84], [0xfede, 0x87], [0xfedf, 0x88],
  [0xfee0, 0x89], [0xfee1, 0x8a], [0xfee2, 0x8b], [0xfee3, 0x8c], [0xfee4, 0x8d],
  [0xfee5, 0x8e], [0xfee6, 0x8f], [0xfee7, 0x90], [0xfee8, 0x91], [0xfee9, 0x92],
  [0xfeea, 0x93], [0xfeeb, 0x94], [0xfeec, 0x95], [0xfeed, 0x96], [0xfeee, 0x97],
  [0xfeef, 0x98], [0xfef0, 0x99], [0xfef1, 0x9a], [0xfef2, 0x9b], [0xfef3, 0x9c],
  [0xfef4, 0x9d], [0xfef5, 0x9e], [0xfef6, 0x9f], [0xfef7, 0xa0], [0xfef8, 0xf1],
  [0xfef9, 0xf2], [0xfefa, 0xf4], [0xfefb, 0xf5], [0xfefc, 0xf6],
]);

/** The Latin the build can still print. A byte handed to Arabic is not here. */
const LATIN_TO_BYTE = new Map<string, number>([
  [" ", 0x00], ["!", 0xab], ["%", 0x5b], ["&", 0x2d], ["'", 0xb4], ["(", 0x5c],
  [")", 0x5d], ["+", 0x2e], [",", 0xb8], ["-", 0xae], [".", 0xad], ["/", 0xba],
  ["0", 0xa1], ["1", 0xa2], ["2", 0xa3], ["3", 0xa4], ["4", 0xa5], ["5", 0xa6],
  ["6", 0xa7], ["7", 0xa8], ["8", 0xa9], ["9", 0xaa], [":", 0xf0], [";", 0x36],
  ["<", 0x85], ["=", 0x35], [">", 0x86], ["?", 0xac], ["A", 0xbb], ["B", 0xbc],
  ["C", 0xbd], ["D", 0xbe], ["E", 0xbf], ["F", 0xc0], ["G", 0xc1], ["H", 0xc2],
  ["I", 0xc3], ["J", 0xc4], ["K", 0xc5], ["L", 0xc6], ["M", 0xc7], ["N", 0xc8],
  ["O", 0xc9], ["P", 0xca], ["Q", 0xcb], ["R", 0xcc], ["S", 0xcd], ["T", 0xce],
  ["U", 0xcf], ["V", 0xd0], ["W", 0xd1], ["X", 0xd2], ["Y", 0xd3], ["Z", 0xd4],
  ["a", 0xd5], ["b", 0xd6], ["c", 0xd7], ["d", 0xd8], ["e", 0xd9], ["f", 0xda],
  ["g", 0xdb], ["h", 0xdc], ["i", 0xdd], ["j", 0xde], ["k", 0xdf], ["l", 0xe0],
  ["m", 0xe1], ["n", 0xe2], ["o", 0xe3], ["p", 0xe4], ["q", 0xe5], ["r", 0xe6],
  ["s", 0xe7], ["t", 0xe8], ["u", 0xe9], ["v", 0xea], ["w", 0xeb], ["x", 0xec],
  ["y", 0xed], ["z", 0xee], ["\u00c9", 0x06], ["\u00d7", 0xb9], ["\u00e9", 0x1b],
  ["\u2018", 0xb3], ["\u2019", 0xb4], ["\u201c", 0xb1], ["\u201d", 0xb2], ["\u2026", 0xb0],
  ["\u2640", 0xb6], ["\u2642", 0xb5],
]);

const CODE_TO_ARABIC = new Map([...ARABIC_TO_CODE].map(([cp, b]) => [b, cp]));
const BYTE_TO_LATIN = new Map([...LATIN_TO_BYTE].map(([ch, b]) => [b, ch]));

export function emeraldSourceCharTables(): PkmCharTables {
  return {
    arabicToByte: ARABIC_TO_CODE,
    byteToArabic: CODE_TO_ARABIC,
    latinToByte: LATIN_TO_BYTE,
    byteToLatin: BYTE_TO_LATIN,
  };
}

/**
 * One line of ordinary Arabic into this build's bytes.
 *
 * Never reversed: this engine mirrors where it draws each glyph, so the bytes
 * stay in reading order. The shaping into presentation forms is still done
 * here, and the engine reshapes what it draws anyway, so a seam the tool could
 * not see -- a name substituted into a sentence at run time -- still joins.
 */
export function encodeArabicForEmeraldSource(text: string): PkmEncodeResult {
  return encodeArabicWithTables(text, emeraldSourceCharTables(), { reverse: false });
}

export function decodeEmeraldSourceBytes(bytes: Uint8Array): string {
  return decodeBytesWithTables(bytes, emeraldSourceCharTables());
}

/**
 * A drawn form back to the letter it is.
 *
 * The ROM holds presentation forms — a letter already bent into its joining
 * shape — while the editor holds ordinary Arabic. Read back as-is, a line
 * would come into the editor as characters no one types and every edit would
 * have to fight them. A lam-alef ligature is two letters and comes back as
 * two.
 */
const FORM_TO_LETTER = new Map<number, string>([
  [0xfe80, "ء"], [0xfe80, "ء"], [0xfe81, "آ"], [0xfe82, "آ"], [0xfe83, "أ"], [0xfe84, "أ"],
  [0xfe85, "ؤ"], [0xfe86, "ؤ"], [0xfe87, "إ"], [0xfe88, "إ"], [0xfe89, "ئ"], [0xfe8a, "ئ"],
  [0xfe8b, "ئ"], [0xfe8c, "ئ"], [0xfe8d, "ا"], [0xfe8e, "ا"], [0xfe8f, "ب"], [0xfe90, "ب"],
  [0xfe91, "ب"], [0xfe92, "ب"], [0xfe93, "ة"], [0xfe94, "ة"], [0xfe95, "ت"], [0xfe96, "ت"],
  [0xfe97, "ت"], [0xfe98, "ت"], [0xfe99, "ث"], [0xfe9a, "ث"], [0xfe9b, "ث"], [0xfe9c, "ث"],
  [0xfe9d, "ج"], [0xfe9e, "ج"], [0xfe9f, "ج"], [0xfea0, "ج"], [0xfea1, "ح"], [0xfea2, "ح"],
  [0xfea3, "ح"], [0xfea4, "ح"], [0xfea5, "خ"], [0xfea6, "خ"], [0xfea7, "خ"], [0xfea8, "خ"],
  [0xfea9, "د"], [0xfeaa, "د"], [0xfeab, "ذ"], [0xfeac, "ذ"], [0xfead, "ر"], [0xfeae, "ر"],
  [0xfeaf, "ز"], [0xfeb0, "ز"], [0xfeb1, "س"], [0xfeb2, "س"], [0xfeb3, "س"], [0xfeb4, "س"],
  [0xfeb5, "ش"], [0xfeb6, "ش"], [0xfeb7, "ش"], [0xfeb8, "ش"], [0xfeb9, "ص"], [0xfeba, "ص"],
  [0xfebb, "ص"], [0xfebc, "ص"], [0xfebd, "ض"], [0xfebe, "ض"], [0xfebf, "ض"], [0xfec0, "ض"],
  [0xfec1, "ط"], [0xfec2, "ط"], [0xfec3, "ط"], [0xfec4, "ط"], [0xfec5, "ظ"], [0xfec6, "ظ"],
  [0xfec7, "ظ"], [0xfec8, "ظ"], [0xfec9, "ع"], [0xfeca, "ع"], [0xfecb, "ع"], [0xfecc, "ع"],
  [0xfecd, "غ"], [0xfece, "غ"], [0xfecf, "غ"], [0xfed0, "غ"], [0xfed1, "ف"], [0xfed2, "ف"],
  [0xfed3, "ف"], [0xfed4, "ف"], [0xfed5, "ق"], [0xfed6, "ق"], [0xfed7, "ق"], [0xfed8, "ق"],
  [0xfed9, "ك"], [0xfeda, "ك"], [0xfedb, "ك"], [0xfedc, "ك"], [0xfedd, "ل"], [0xfede, "ل"],
  [0xfedf, "ل"], [0xfee0, "ل"], [0xfee1, "م"], [0xfee2, "م"], [0xfee3, "م"], [0xfee4, "م"],
  [0xfee5, "ن"], [0xfee6, "ن"], [0xfee7, "ن"], [0xfee8, "ن"], [0xfee9, "ه"], [0xfeea, "ه"],
  [0xfeeb, "ه"], [0xfeec, "ه"], [0xfeed, "و"], [0xfeee, "و"], [0xfeef, "ى"], [0xfef0, "ى"],
  [0xfef1, "ي"], [0xfef2, "ي"], [0xfef3, "ي"], [0xfef4, "ي"], [0xfef5, "لآ"],
  [0xfef6, "لآ"], [0xfef7, "لأ"], [0xfef8, "لأ"], [0xfef9, "لإ"], [0xfefa, "لإ"],
  [0xfefb, "لا"], [0xfefc, "لا"],
]);

export function toLogicalArabic(text: string): string {
  let out = "";
  for (const ch of text) {
    out += FORM_TO_LETTER.get(ch.codePointAt(0)!) ?? ch;
  }
  return out;
}

/** Written by the build's emit_reference.py, at the head of the table. */
const REFERENCE_MAGIC = "PKMARABICREF1";

function findReference(rom: Uint8Array): number {
  const magic = [...REFERENCE_MAGIC].map((c) => c.charCodeAt(0));
  // The table lives in the padding past the ROM's own data, so the search
  // starts where that padding can begin rather than scanning the whole file.
  for (let i = 0; i + magic.length < rom.length; i++) {
    let hit = true;
    for (let k = 0; k < magic.length; k++) {
      if (rom[i + k] !== magic[k]) { hit = false; break; }
    }
    if (hit) return i;
  }
  return -1;
}

/** True when this ROM came out of the pokeemerald build -- it carries the table. */
export function isEmeraldSourceRom(rom: Uint8Array): boolean {
  return findReference(rom) >= 0;
}

export interface EmeraldSourceReference {
  /** Where the table sits, so a relocated line is never written over it. */
  region: { start: number; length: number };
  /** line offset in this ROM -> the English it replaced */
  english: Map<number, string>;
}

/**
 * Reads the table back. A line missing from it was never translated, and its
 * own bytes are still the English -- so nothing is lost by it being absent.
 */
export function readEmeraldSourceReference(rom: Uint8Array): EmeraldSourceReference | null {
  const at = findReference(rom);
  if (at < 0) return null;
  const view = new DataView(rom.buffer, rom.byteOffset, rom.byteLength);
  const count = view.getUint32(at + 16, true);
  const english = new Map<number, string>();
  let p = at + 20;
  for (let i = 0; i < count && p + 8 <= rom.length; i++) {
    const offset = view.getUint32(p, true);
    const length = view.getUint32(p + 4, true);
    p += 8;
    if (p + length > rom.length) break;
    english.set(offset, decodeEmeraldSourceBytes(rom.subarray(p, p + length)));
    p += length;
  }
  return { region: { start: at, length: p - at }, english };
}
