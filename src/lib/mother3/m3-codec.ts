/**
 * Mother 3 (English Fan Translation v1.1) script byte codec.
 *
 * The fan translation deliberately obfuscates its main script so it can't be
 * read with a plain hex editor. Each stored byte is XOR-scrambled with a key
 * that depends on its ROM address and two key tables that live inside the ROM
 * itself. The exact formulas were recovered from the built `decode_byte`
 * routine at 0x08132BD2 and verified two ways:
 *   - decoding produces real English (e.g. "No problem here.")
 *   - encode∘decode is byte-identical over the whole 0x1370000..0x13F0000
 *     text region (0 mismatches / 512 KB).
 *
 * Deobfuscation (ROM address `a`, stored byte `b`):
 *   odd  a: char = (((b + 0x59) & 0xFF) ^ key1) - 8      & 0xFF
 *   even a: char = (((b -    7) & 0xFF) ^ key2) + 3      & 0xFF
 *     key1 = rom[0x13C5D8  + ((a >> 1) % 0x126)]
 *     key2 = rom[0x1FAC000 + ((a >> 1) % 0x3A20)]
 * Re-obfuscation is the exact inverse (used when writing edited text back).
 *
 * `a` is the *ROM* address (0x08000000-based), matching what the routine sees;
 * callers pass `0x08000000 + fileOffset`.
 */

import { reshapeArabic, hasArabicChars } from "@/lib/arabic-processing";
import { ARABIC_CHAR_TO_CODE } from "./m3-arabic-table";
import { normalizeMother3EditableText } from "./m3-text-normalize";

export const ROM_BASE = 0x08000000;

const KEY1_OFF = 0x13c5d8;
const KEY1_MOD = 0x126;
const KEY2_OFF = 0x1fac000;
const KEY2_MOD = 0x3a20;

/** Deobfuscate one stored byte read at ROM address `romAddr`. */
export function decodeByte(rom: Uint8Array, storedByte: number, romAddr: number): number {
  if (romAddr & 1) {
    const key = rom[KEY1_OFF + (((romAddr >>> 1) % KEY1_MOD) | 0)];
    return (((((storedByte + 0x59) & 0xff) ^ key) - 8) & 0xff) >>> 0;
  }
  const key = rom[KEY2_OFF + (((romAddr >>> 1) % KEY2_MOD) | 0)];
  return (((((storedByte - 7) & 0xff) ^ key) + 3) & 0xff) >>> 0;
}

/** Re-obfuscate one decoded char back to the stored byte for ROM address `romAddr`. */
export function encodeByte(rom: Uint8Array, decoded: number, romAddr: number): number {
  if (romAddr & 1) {
    const key = rom[KEY1_OFF + (((romAddr >>> 1) % KEY1_MOD) | 0)];
    return (((((decoded + 8) & 0xff) ^ key) - 0x59) & 0xff) >>> 0;
  }
  const key = rom[KEY2_OFF + (((romAddr >>> 1) % KEY2_MOD) | 0)];
  return (((((decoded - 3) & 0xff) ^ key) + 7) & 0xff) >>> 0;
}

/**
 * Character map: decoded 8-bit code -> printable string.
 * Verified against runtime RAM and decoded script:
 *   0x21..0x3A = A..Z, 0x41..0x5A = a..z, 0x40 = space, 0x0E = '.', 0x0F = ','.
 * Codes 0x00..0x09 are NOT digits — they are control/formatting bytes (every
 * dialogue line begins with one, e.g. 0x01), so they are intentionally left
 * out of the map and render as `{0X}` tokens. Anything outside the mapped
 * ranges likewise renders as a `{XX}` byte token so it survives an edit
 * round-trip untouched (see codesToText / textToCodes).
 */
const CODE_TO_CHAR = new Map<number, string>();
const CHAR_TO_CODE = new Map<string, number>();
function biMap(code: number, ch: string) {
  CODE_TO_CHAR.set(code, ch);
  CHAR_TO_CODE.set(ch, code);
}
for (let i = 0; i < 26; i++) biMap(0x21 + i, String.fromCharCode(65 + i)); // A-Z
for (let i = 0; i < 26; i++) biMap(0x41 + i, String.fromCharCode(97 + i)); // a-z
biMap(0x40, " ");
biMap(0x0e, ".");
biMap(0x0f, ",");

/** Terminator byte that ends a line. */
export const END_BYTE = 0xff;

export interface LineToken {
  /** "text" = printable run; "byte" = one raw code shown as {XX};
   *  "ctrl" = a two-byte control code shown as [FxYY]. */
  kind: "text" | "byte" | "ctrl";
  /** For "text": the string. For "byte"/"ctrl": empty. */
  text: string;
  /** Raw decoded codes this token represents (1 for text-char/byte, 2 for ctrl). */
  codes: number[];
}

/**
 * Turn a run of decoded codes (NOT including the 0xFF terminator) into a
 * human-editable string. Printable chars pass through; control codes 0xF0..0xFE
 * consume the following byte and render as `[FxYY]`; 0xEF renders as `[EF]`;
 * anything else renders as `{XX}`. This is lossless — detokenize inverts it.
 */
export function codesToText(codes: number[]): string {
  let out = "";
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    if (c >= 0xf0 && c <= 0xfe) {
      const nxt = i + 1 < codes.length ? codes[i + 1] : 0;
      out += `[${c.toString(16).toUpperCase().padStart(2, "0")}${nxt
        .toString(16)
        .toUpperCase()
        .padStart(2, "0")}]`;
      i++;
      continue;
    }
    if (c === 0xef) {
      out += "[EF]";
      continue;
    }
    const ch = CODE_TO_CHAR.get(c);
    if (ch !== undefined) out += ch;
    else out += `{${c.toString(16).toUpperCase().padStart(2, "0")}}`;
  }
  return out;
}

/**
 * Presentation forms the friend's Arabic font never drew a glyph for. The
 * reshaper still produces them for real words (e.g. a ط in the middle of a
 * word → medial form U+FEC4), so without these fallbacks the build fails with
 * "حرف غير قابل للترميز". Each maps to the nearest form the font *does* have —
 * for ط/ظ the four forms are near-identical, so the word stays readable.
 */
const ARABIC_FALLBACK_CHAR_TO_CODE: Record<string, number> = {
  "ﻃ": 0x08, // ط initial  → ط isolated (U+FEC1)
  "ﻄ": 0x09, // ط medial   → ط final    (U+FEC2)
  "ﻇ": 0x0c, // ظ initial  → ظ isolated (U+FEC5)
  "ﻈ": 0x92, // ظ medial   → ظ final    (U+FEC6)
  "ﺁ": 0x90, // آ isolated → آ final    (U+FE82)
  "?": 0x1f, //      Latin ?     → ؟          (U+061F)
};

/** Map one already-shaped display character to a font code, trying the Arabic
 *  presentation-form table first, then the missing-glyph fallback, then the
 *  Latin/punctuation fallback. */
function charToCode(ch: string): number | undefined {
  const a = ARABIC_CHAR_TO_CODE[ch];
  if (a !== undefined) return a;
  const f = ARABIC_FALLBACK_CHAR_TO_CODE[ch];
  if (f !== undefined) return f;
  return CHAR_TO_CODE.get(ch);
}

/** Encode one run of plain text (no control tokens) to codes. Arabic runs are
 *  reshaped to presentation forms first so they match the font/table; the RTL
 *  render patch handles visual right-to-left order, so text stays in logical
 *  order here. */
function encodeTextRun(run: string): number[] {
  const normalized = normalizeMother3EditableText(run, "script");
  const shaped = hasArabicChars(normalized) ? reshapeArabic(normalized) : normalized;
  const out: number[] = [];
  for (const ch of shaped) {
    if (ch === "‏" || ch === "‎" || ch === "‍" || ch === "‌") continue; // bidi/joiners
    const code = charToCode(ch);
    if (code === undefined) {
      throw new Error(
        `حرف غير قابل للترميز في نص Mother 3: ${JSON.stringify(ch)} (U+${ch
          .codePointAt(0)
          .toString(16)
          .toUpperCase()}) — غير موجود في جدول خط اللعبة`
      );
    }
    out.push(code);
  }
  return out;
}

/**
 * Invert codesToText: parse an edited string back into decoded codes
 * (NOT including terminator). Control tokens ([FxYY], [XX], {XX}) pass through
 * verbatim; plain text between them is reshaped (Arabic) and mapped via the
 * font table. Un-encodable characters throw so the caller can reject the edit
 * rather than silently corrupt the script.
 */
export function textToCodes(text: string): number[] {
  const out: number[] = [];
  let run = "";
  const flush = () => {
    if (run) {
      out.push(...encodeTextRun(run));
      run = "";
    }
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "[") {
      const end = text.indexOf("]", i);
      if (end > i) {
        const body = text.slice(i + 1, end);
        if (/^[0-9A-Fa-f]{2}$/.test(body)) {
          flush();
          out.push(parseInt(body, 16));
          i = end + 1;
          continue;
        }
        if (/^[0-9A-Fa-f]{4}$/.test(body)) {
          flush();
          out.push(parseInt(body.slice(0, 2), 16), parseInt(body.slice(2), 16));
          i = end + 1;
          continue;
        }
      }
    }
    if (ch === "{") {
      const end = text.indexOf("}", i);
      if (end > i) {
        const body = text.slice(i + 1, end);
        if (/^[0-9A-Fa-f]{2}$/.test(body)) {
          flush();
          out.push(parseInt(body, 16));
          i = end + 1;
          continue;
        }
      }
    }
    run += ch;
    i++;
  }
  flush();
  return out;
}
