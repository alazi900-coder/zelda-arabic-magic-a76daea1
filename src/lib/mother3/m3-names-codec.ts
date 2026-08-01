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
import { normalizeMother3EditableText } from "./m3-text-normalize";

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
biMap(0x1f, "?"); // menus1's "??????????" placeholder — every occurrence is this literal run
biMap(0x01, "!"); // "recovered [X] HP!", "maxed out!"
biMap(0x1a, ":"); // "Favorite Food:", "Text Speed:"
biMap(0x0f, "/"); // "Invalid / duplicate name"

/** Decode one code to its display character, or undefined if unmapped. Unlike
 *  the dialogue codec, an unmapped code here is NOT rendered as a `{XX}`
 *  passthrough token — it signals "not real entry text" (table header/padding
 *  bytes), and decodeNamesString below fails so the scanner steps past it.
 *  The one exception is control tokens (see decodeNamesString). */
function codeToChar(code: number): string | undefined {
  return CODE_TO_CHAR.get(code);
}

/**
 * menus1 (and likely other "any length" tables) also contain 2-byte control
 * codes whose high byte is 0xFF or 0xEF — variable-insertion placeholders
 * like "[A0 FF]" = the acting character's name, "[13 EF]" = an item name.
 * The toolkit's own menus1.txt already shows these as raw `[XX YY]` hex-pair
 * tokens (low byte, high byte) rather than translatable text, so this mirrors
 * that convention exactly instead of inventing a new one.
 */
function isControlCode(code: number): boolean {
  const hi = (code >>> 8) & 0xff;
  return hi === 0xff || hi === 0xef;
}
function controlCodeToToken(code: number): string {
  const lo = code & 0xff;
  const hi = (code >>> 8) & 0xff;
  return `[${lo.toString(16).toUpperCase().padStart(2, "0")} ${hi.toString(16).toUpperCase().padStart(2, "0")}]`;
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
    if (isControlCode(code)) {
      out += controlCodeToToken(code);
      a += 2;
      continue;
    }
    const ch = codeToChar(code);
    if (ch === undefined) return null;
    out += ch;
    a += 2;
  }
  return null;
}

/** Characters that swap when a line is laid out visually right-to-left. */
const MIRRORED_CHARS: Record<string, string> = {
  "(": ")",
  ")": "(",
};

type Seg = { rtl: boolean; codes: number[] };

/** Encode a display string (control tokens `{XX}` and `[XX YY]` pass through)
 *  to codes. Arabic runs are reshaped first. Always throws on un-encodable
 *  characters — the `lossy` flag is retained for signature compatibility but
 *  no longer drops characters (force-build handles failures by skipping the
 *  whole edit so nothing gets silently deleted from the translation).
 *
 *  Names/menus/cutscenes render LTR (no RTL hook like dialogue), so when the
 *  line contains Arabic we lay it out visually: segment order is reversed and
 *  Arabic runs are internally flipped, while Latin/digit/tag runs keep their
 *  own order (so "سرعة النص: 2" still shows "2" correctly). Dialogue uses
 *  m3-codec.ts, not this path, and is unaffected. */
export function encodeNamesString(text: string, _lossy = false): number[] {
  const normalizedText = normalizeMother3EditableText(text, "names");
  const segs: Seg[] = [];
  let hasRtl = false;

  const pushCode = (rtl: boolean, code: number) => {
    const last = segs[segs.length - 1];
    if (last && last.rtl === rtl) last.codes.push(code);
    else segs.push({ rtl, codes: [code] });
  };

  let i = 0;
  while (i < normalizedText.length) {
    if (normalizedText[i] === "{") {
      const end = normalizedText.indexOf("}", i);
      if (end > i) {
        const body = normalizedText.slice(i + 1, end);
        if (/^[0-9A-Fa-f]{2}$/.test(body)) {
          pushCode(false, parseInt(body, 16));
          i = end + 1;
          continue;
        }
      }
    }
    if (normalizedText[i] === "[") {
      const end = normalizedText.indexOf("]", i);
      if (end > i) {
        const body = normalizedText.slice(i + 1, end);
        const m = /^([0-9A-Fa-f]{2}) ([0-9A-Fa-f]{2})$/.exec(body);
        if (m) {
          const lo = parseInt(m[1], 16);
          const hi = parseInt(m[2], 16);
          pushCode(false, (hi << 8) | lo);
          i = end + 1;
          continue;
        }
      }
    }
    // Reshape a maximal run of Arabic chars together so joining forms are correct.
    if (hasArabicChars(normalizedText[i])) {
      let j = i;
      while (j < normalizedText.length && normalizedText[j] !== "{" && hasArabicChars(normalizedText[j])) j++;
      const shaped = reshapeArabic(normalizedText.slice(i, j));
      hasRtl = true;
      for (const ch of shaped) {
        if (ch === "\u200f" || ch === "\u200e" || ch === "\u200d" || ch === "\u200c") continue;
        const code = charToCode(ch);
        if (code === undefined) {
          throw new Error(
            `حرف غير قابل للترميز: ${JSON.stringify(ch)} (U+${ch.charCodeAt(0).toString(16).toUpperCase()})`
          );
        }
        pushCode(true, code);
      }
      i = j;
      continue;
    }
    const ch = normalizedText[i];
    const code = charToCode(ch);
    if (code === undefined) {
      throw new Error(
        `حرف غير قابل للترميز: ${JSON.stringify(ch)} (U+${ch.charCodeAt(0).toString(16).toUpperCase()})`
      );
    }
    pushCode(false, code);
    i++;
  }

  if (!hasRtl) return segs.flatMap((s) => s.codes);

  // Visual (RTL) layout: reverse segment order, flip Arabic runs internally,
  // and mirror bracket-like characters.
  const mirrorCode = (code: number): number => {
    const ch = codeToChar(code);
    const m = ch !== undefined ? MIRRORED_CHARS[ch] : undefined;
    if (m === undefined) return code;
    return charToCode(m) ?? code;
  };

  const out: number[] = [];
  for (let s = segs.length - 1; s >= 0; s--) {
    const seg = segs[s];
    const codes = seg.rtl ? [...seg.codes].reverse() : seg.codes;
    for (const c of codes) out.push(mirrorCode(c));
  }
  return out;
}

