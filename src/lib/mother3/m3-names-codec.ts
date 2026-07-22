/**
 * Codec for Mother 3's non-script text tables (item names, and — pending
 * verification — menus/statuses/PSI names/descriptions). Unlike the main
 * dialogue script (m3-codec.ts), these tables are NOT obfuscated: each
 * character is a plain, unscrambled 16-bit little-endian code, terminated by
 * 0xFFFF, packed back-to-back with zero padding between entries.
 *
 * Recovered and verified by known-plaintext comparison against the official
 * translation's itemnames.txt: brute-force-scanning the ROM region
 * 0x1F8C400..0x1F8F004 for valid decodable 16-bit-char runs reproduces all
 * 256 item names in itemnames.txt byte-for-byte and in the same order
 * (0 mismatches). Character codes below 0x21 that aren't otherwise mapped
 * (space/period/comma/apostrophe/hyphen/digits) were identified the same way
 * — e.g. code 0x0D only ever appears mid-word next to hyphenated real words
 * ("Easy-Grip Stick", "Non-Slip Shoes", "Anti-Paralysis").
 */

import { reshapeArabic, hasArabicChars } from "@/lib/arabic-processing";
import { ARABIC_CHAR_TO_CODE } from "./m3-arabic-table";

/** Terminator code that ends a string in these tables. */
export const NAMES_END_CODE = 0xffff;

const CODE_TO_CHAR = new Map<number, string>();
const CHAR_TO_CODE = new Map<string, number>();
function biMap(code: number, ch: string) {
  CODE_TO_CHAR.set(code, ch);
  CHAR_TO_CODE.set(ch, code);
}
for (let i = 0; i < 26; i++) biMap(0x21 + i, String.fromCharCode(65 + i)); // A-Z
for (let i = 0; i < 26; i++) biMap(0x41 + i, String.fromCharCode(97 + i)); // a-z
for (let i = 0; i < 10; i++) biMap(0x10 + i, String.fromCharCode(48 + i)); // 0-9
biMap(0x40, " ");
biMap(0x0e, ".");
biMap(0x0c, ","); // verified via "Stopped, Frozen" in statuses — NOT 0x0f (never exercised by real data, wrong)
biMap(0x07, "'");
biMap(0x0d, "-");
biMap(0x08, "(");
biMap(0x09, ")");
biMap(0x3b, "α"); // PSI tier suffixes: PK Fire α/β/γ/Ω
biMap(0x3c, "β");
biMap(0x3d, "γ");
biMap(0x3e, "Ω");

/** Decode one code to its display character, or undefined if unmapped. Unlike
 *  the dialogue codec, an unmapped code here is NOT rendered as a `{XX}`
 *  passthrough token — it signals "not real entry text" (table header/padding
 *  bytes), and decodeNamesString below fails so the scanner steps past it. */
function codeToChar(code: number): string | undefined {
  return CODE_TO_CHAR.get(code);
}

/** Map one display character to a code, trying Arabic presentation forms first. */
function charToCode(ch: string): number | undefined {
  const a = ARABIC_CHAR_TO_CODE[ch];
  if (a !== undefined) return a;
  return CHAR_TO_CODE.get(ch);
}

/**
 * Decode one string starting at `offset` (u16 units, LE) in `rom`, stopping at
 * NAMES_END_CODE. Returns null (not a real entry) as soon as an unmapped code
 * is hit, or if `offset` runs past `limit` before a terminator is found —
 * callers scan forward on null rather than treat it as entry text, which is
 * how the table's small non-text header gets stepped over.
 */
export function decodeNamesString(
  rom: Uint8Array,
  offset: number,
  limit: number
): { text: string; nextOffset: number } | null {
  let a = offset;
  let out = "";
  while (a + 2 <= limit) {
    const code = rom[a] | (rom[a + 1] << 8);
    if (code === NAMES_END_CODE) return { text: out, nextOffset: a + 2 };
    const ch = codeToChar(code);
    if (ch === undefined) return null;
    out += ch;
    a += 2;
  }
  return null;
}

/** Encode a display string (control tokens `{XX}` pass through) to codes. Arabic
 *  runs are reshaped first. Throws on characters with no font code. */
export function encodeNamesString(text: string): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "{") {
      const end = text.indexOf("}", i);
      if (end > i) {
        const body = text.slice(i + 1, end);
        if (/^[0-9A-Fa-f]{2}$/.test(body)) {
          out.push(parseInt(body, 16));
          i = end + 1;
          continue;
        }
      }
    }
    // Reshape a maximal run of Arabic chars together so joining forms are correct.
    if (hasArabicChars(text[i])) {
      let j = i;
      while (j < text.length && text[j] !== "{" && hasArabicChars(text[j])) j++;
      const shaped = reshapeArabic(text.slice(i, j));
      for (const ch of shaped) {
        if (ch === "‏" || ch === "‎" || ch === "‍" || ch === "‌") continue;
        const code = charToCode(ch);
        if (code === undefined) {
          throw new Error(
            `حرف غير قابل للترميز: ${JSON.stringify(ch)} (U+${ch.charCodeAt(0).toString(16).toUpperCase()})`
          );
        }
        out.push(code);
      }
      i = j;
      continue;
    }
    const ch = text[i];
    const code = charToCode(ch);
    if (code === undefined) {
      throw new Error(
        `حرف غير قابل للترميز: ${JSON.stringify(ch)} (U+${ch.charCodeAt(0).toString(16).toUpperCase()})`
      );
    }
    out.push(code);
    i++;
  }
  return out;
}
