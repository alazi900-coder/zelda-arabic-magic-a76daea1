// Encodes editor-order Arabic lines (with \xNN control codes written out) into Golden Sun bytes,
// as written in strings.txt (\xNN escapes for control codes and for every byte from 0x80).
import { readFileSync, writeFileSync } from "fs";
import { reshapeArabic, stripDiacritics } from "@/lib/arabic-processing";

const codes: Record<string, number> = JSON.parse(readFileSync(process.env.CODES!, "utf8"));
const PUNCT: Record<string, string> = { "،": ",", "؟": "?", "؛": ";" };
const lines: Record<string, string> = JSON.parse(readFileSync(process.env.LINES!, "utf8"));
const BREAK = /^\\x0[23]$/; // end of box, new line: they split printed lines and stay in place
const CODE = /\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2})?/g; // anything else (a name, a value) travels with its words

const out: Record<string, string> = {};
for (const [idx, text] of Object.entries(lines)) {
  let bytes = "";
  for (const seg of text.split(/(\\x0[23])/)) {
    if (BREAK.test(seg)) { bytes += seg; continue; }
    const held: string[] = [];
    const masked = seg.replace(CODE, (m) => { held.push(m); return String.fromCharCode(0xe000 + held.length - 1); });
    for (const ch of reshapeArabic(stripDiacritics(masked))) { // logical order: the engine mirrors
      const cp = ch.codePointAt(0)!;
      if (cp >= 0xe000 && cp < 0xe100) { bytes += held[cp - 0xe000]; continue; }
      const p = PUNCT[ch] ?? ch;
      if (p.charCodeAt(0) < 0x80) { bytes += p; continue; }
      const c = codes[String(cp)];
      if (c === undefined) throw new Error(`no glyph for ${ch} U+${cp.toString(16)}`);
      bytes += "\\x" + c.toString(16).padStart(2, "0");
    }
  }
  out[idx] = bytes;
}
writeFileSync(process.env.OUT!, JSON.stringify(out));
