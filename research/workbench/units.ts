import { readFileSync } from "fs";
import { parseGtaIvGxt, decodeGtaIvArabicFontUnits } from "@/lib/gtaiv/gxt-format";
import { GTAIV_RU_UNIT_TO_CODEPOINT } from "@/lib/gtaiv/gtaiv-ru-charmap";

const NAMES: Record<number, string> = {};
// name each presentation form by base letter + form, from the code point block
const BASE: [number, string][] = [
  [0xfe80, "hamza"], [0xfe81, "alef-madda"], [0xfe83, "alef-hamza"], [0xfe85, "waw-hamza"],
  [0xfe87, "alef-hamza-below"], [0xfe89, "yeh-hamza"], [0xfe8d, "alef"], [0xfe8f, "beh"],
  [0xfe93, "teh-marbuta"], [0xfe95, "teh"], [0xfe99, "theh"], [0xfe9d, "jeem"],
  [0xfea1, "hah"], [0xfea5, "khah"], [0xfea9, "dal"], [0xfeab, "thal"], [0xfead, "reh"],
  [0xfeaf, "zain"], [0xfeb1, "seen"], [0xfeb5, "sheen"], [0xfeb9, "sad"], [0xfebd, "dad"],
  [0xfec1, "tah"], [0xfec5, "zah"], [0xfec9, "ain"], [0xfecd, "ghain"], [0xfed1, "feh"],
  [0xfed5, "qaf"], [0xfed9, "kaf"], [0xfedd, "lam"], [0xfee1, "meem"], [0xfee5, "noon"],
  [0xfee9, "heh"], [0xfeed, "waw"], [0xfeef, "alef-maksura"], [0xfef1, "yeh"],
];
const FORMS = ["ISO", "FIN", "INI", "MED"];
function nameOf(cp: number): string {
  if (cp === 0x061f) return "?ar";
  for (let i = BASE.length - 1; i >= 0; i--) {
    if (cp >= BASE[i][0]) {
      const n = cp - BASE[i][0];
      return `${BASE[i][1]}.${FORMS[n] ?? "?" + n}`;
    }
  }
  return "U+" + cp.toString(16);
}

const buf = readFileSync("/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/a5c910b1-russian_3.gxt");
const gxt = parseGtaIvGxt(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

function dump(crcHex: string) {
  for (const t of gxt.tables) {
    for (const e of t.entries) {
      if (e.crc.toString(16) !== crcHex) continue;
      console.log(`\n=== ${t.name}/${crcHex} — ترتيب الملف (يسار←يمين على الشاشة)`);
      const parts: string[] = [];
      for (const u of Array.from(e.textUnits)) {
        if (u === 32) { parts.push("·"); continue; }
        if (u < 128) { parts.push(String.fromCharCode(u)); continue; }
        const cp = GTAIV_RU_UNIT_TO_CODEPOINT.get(u);
        parts.push(cp === undefined ? `?${u}` : `[${u}=${nameOf(cp)}]`);
      }
      console.log(parts.join(" "));
      return;
    }
  }
  console.log("not found", crcHex);
}

// find the clothes line from the screenshot
for (const t of gxt.tables) {
  for (const e of t.entries) {
    const text = decodeGtaIvArabicFontUnits(e.textUnits, true);
    if (text.includes("الملابس") && text.includes("INPUT_PICKUP")) {
      console.log("FOUND", t.name, e.crc.toString(16));
      dump(e.crc.toString(16));
    }
  }
}
