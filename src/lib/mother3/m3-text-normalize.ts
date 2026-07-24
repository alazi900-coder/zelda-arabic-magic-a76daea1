/**
 * Mother 3 can only encode the glyphs present in its custom 8-bit/16-bit
 * tables. AI output often includes harmless Unicode that the GBA font will
 * never contain (real newlines, Arabic diacritics, smart quotes, Persian letter
 * variants, Arabic-Indic digits…). Normalize those automatically before ROM
 * build so users do not have to delete one unsupported character after another.
 */

export type Mother3TextTable = "script" | "names";

function isArabicMark(cp: number): boolean {
  return (
    (cp >= 0x0610 && cp <= 0x061a) ||
    (cp >= 0x064b && cp <= 0x065f) ||
    cp === 0x0670 ||
    (cp >= 0x06d6 && cp <= 0x06ed) ||
    (cp >= 0x08d3 && cp <= 0x08ff)
  );
}

function isInvisibleFormatting(cp: number): boolean {
  return (
    cp === 0x00ad ||
    cp === 0x034f ||
    cp === 0x061c ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x206f) ||
    cp === 0xfeff
  );
}

function asciiFallback(ch: string): string | null {
  const decomposed = ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  if (decomposed !== ch && /^[\x20-\x7e]+$/.test(decomposed)) return decomposed;
  return null;
}

function appendMappedPunctuation(ch: string, table: Mother3TextTable): string | null {
  switch (ch) {
    case "\r":
    case "\n":
    case "\t":
    case "\v":
    case "\f":
      return " ";
    case "\u00a0":
    case "\u1680":
    case "\u2000":
    case "\u2001":
    case "\u2002":
    case "\u2003":
    case "\u2004":
    case "\u2005":
    case "\u2006":
    case "\u2007":
    case "\u2008":
    case "\u2009":
    case "\u200a":
    case "\u202f":
    case "\u205f":
    case "\u3000":
      return " ";
    case "…":
      return "...";
    case "؛":
      return "،";
    case "٫":
      return ".";
    case "٬":
      return ",";
    case "–":
    case "—":
    case "−":
    case "‐":
    case "‑":
      return "-";
    case "“":
    case "”":
    case "„":
    case "«":
    case "»":
      return "\"";
    case "‘":
    case "’":
    case "‚":
    case "`":
    case "´":
      return table === "names" ? "'" : "\"";
    case "٪":
    case "%":
    case "°":
      return "";
    case "(":
    case ")":
    case "/":
    case "\\":
      return table === "names" ? ch : " ";
    case "+":
    case "=":
    case "&":
    case "|":
    case "<":
    case ">":
      return " ";
    default:
      return null;
  }
}

function mapArabicVariant(ch: string): string | null {
  switch (ch) {
    case "٠": return "0";
    case "١": return "1";
    case "٢": return "2";
    case "٣": return "3";
    case "٤": return "4";
    case "٥": return "5";
    case "٦": return "6";
    case "٧": return "7";
    case "٨": return "8";
    case "٩": return "9";
    case "۰": return "0";
    case "۱": return "1";
    case "۲": return "2";
    case "۳": return "3";
    case "۴": return "4";
    case "۵": return "5";
    case "۶": return "6";
    case "۷": return "7";
    case "۸": return "8";
    case "۹": return "9";
    case "ٱ":
    case "ٲ":
    case "ٳ":
    case "ٵ":
      return "ا";
    case "ک":
    case "ك":
    case "ڪ":
    case "ګ":
    case "گ":
      return "ك";
    case "ی":
    case "ي":
    case "ے":
    case "ۍ":
    case "ێ":
      return "ي";
    case "ۀ":
    case "ە":
    case "ہ":
    case "ھ":
      return "ه";
    case "پ": return "ب";
    case "چ": return "ج";
    case "ژ": return "ز";
    case "ڤ": return "ف";
    case "ڨ": return "ق";
    case "٭": return "*";
    default:
      return null;
  }
}

export function normalizeMother3EditableText(text: string, table: Mother3TextTable = "script"): string {
  let out = "";
  for (const ch of text.normalize("NFKC")) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    if (isArabicMark(cp) || isInvisibleFormatting(cp) || cp === 0x0640) continue;

    const punctuation = appendMappedPunctuation(ch, table);
    if (punctuation != null) {
      out += punctuation;
      continue;
    }

    const arabic = mapArabicVariant(ch);
    if (arabic != null) {
      out += arabic;
      continue;
    }

    const ascii = asciiFallback(ch);
    out += ascii ?? ch;
  }
  return out.replace(/ {2,}/g, " ");
}