/**
 * Golden Sun's control codes: every byte under 0x20 that shows up inside a
 * message (box-end, line break, the hero's name, colour changes...), plus
 * how many extra raw bytes -- not character codes, opaque parameters --
 * each one carries. `AdvanceMsgText`/`Func_8017aa4` skip exactly this many
 * halfwords when scanning past a code, which is where this table comes
 * from (confirmed against the decomp's own comment in `ui.c`).
 */
export function goldensunControlCodeArgBytes(code: number): number {
  if ((code >= 0x08 && code <= 0x0c) || code === 0x11 || code === 0x1d) return 1;
  if (code === 0x0e || code === 0x0f || code === 0x1c) return 2;
  return 0;
}

/** `\xNN` escape, same shape enc.ts / the rest of this project's control-code text uses. */
export const GOLDENSUN_TAG_RE = /\\x[0-9a-f]{2}/gi;

/**
 * Bytes the editor must never show as a plain letter, because the font
 * overlay (goldensun-arabic-font.ts) repurposed their glyph cell for a rare
 * Arabic presentation form: `< > @ [ \ ] ^ \`` (0x3C-0x60) and `{ | } ~ DEL`
 * (0x7B-0x7F), plus 0x8C/0x8D. A translator who typed a literal "<" would
 * otherwise silently get an Arabic glyph instead of the character they see
 * in the editor.
 */
const OVERFLOW_ASCII_BYTES = new Set([0x3c, 0x3e, 0x40, 0x5b, 0x5c, 0x5d, 0x5e, 0x60, 0x7b, 0x7c, 0x7d, 0x7e, 0x7f, 0x8c, 0x8d]);

/** True for a byte the editor can show as its own plain ASCII character (0x20-0x7A minus the overflow punctuation above). */
export function isGoldenSunPlainAscii(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7a && !OVERFLOW_ASCII_BYTES.has(byte);
}

/**
 * Splits a decompressed byte sequence into runs the encoder/decoder agree
 * on: a control code plus its argument bytes, or a maximal run of "other"
 * bytes (plain ASCII or bytes with an Arabic glyph mapping).
 */
export interface GoldenSunToken {
  kind: "code" | "text";
  bytes: number[];
}

export function tokenizeGoldenSunBytes(bytes: number[]): GoldenSunToken[] {
  const tokens: GoldenSunToken[] = [];
  let i = 0;
  let run: number[] = [];
  const flush = () => {
    if (run.length) { tokens.push({ kind: "text", bytes: run }); run = []; }
  };
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x20) {
      flush();
      const argBytes = goldensunControlCodeArgBytes(b);
      tokens.push({ kind: "code", bytes: bytes.slice(i, i + 1 + argBytes) });
      i += 1 + argBytes;
    } else {
      run.push(b);
      i++;
    }
  }
  flush();
  return tokens;
}
