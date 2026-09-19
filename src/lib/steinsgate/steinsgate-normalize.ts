/**
 * Swapping a character the Steins;Gate font cannot draw for one it can.
 *
 * Arabic typing picks up letters and punctuation the game's font never had a
 * slot for: Persian letters that look like Arabic ones (ڤ, گ), Arabic-Indic
 * digits, and a drawerful of dashes that are not the ASCII hyphen. Each of
 * these has an obvious equivalent the font does draw, and replacing them by
 * hand across thousands of lines is not work a translator should be doing.
 *
 * The table only holds swaps where the meaning survives. A character with no
 * honest equivalent is left alone and stays in the report, because guessing one
 * would quietly change the words.
 */

/** Replacements, keyed by the character the font cannot draw. */
const EQUIVALENTS: Record<string, string> = {
  // Persian and Urdu letters that stand in for Arabic ones
  "ڤ": "ف", // ڤ → ف
  "گ": "ك", // گ → ك
  "ک": "ك", // ک → ك  (Persian kaf)
  "پ": "ب", // پ → ب
  "چ": "ج", // چ → ج
  "ژ": "ز", // ژ → ز
  "ی": "ي", // ی → ي  (Persian yeh)
  "ہ": "ه", // ہ → ه
  "ە": "ه", // ە → ه
  "ۀ": "ه", // ۀ → ه
  "ٱ": "ا", // ٱ → ا
  "ٲ": "ا", // ٲ → ا
  "ٳ": "ا", // ٳ → ا
  "ى": "ي", // ى → ي  (only reached when the font lacks alef maqsura)

  // Arabic-Indic digits
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  // Extended (Persian) digits
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",

  // Dashes that are not the ASCII hyphen
  "‐": "-", // ‐ hyphen
  "‑": "-", // ‑ non-breaking hyphen
  "‒": "-", // ‒ figure dash
  "−": "-", // − minus sign
  "﹣": "-", // ﹣ small hyphen-minus
  "﹘": "-", // ﹘ small em dash
  "­": "-", // soft hyphen, invisible until it is not

  // Arabic punctuation and separators with no slot
  "٫": ".", // ٫ decimal separator
  "٬": ",", // ٬ thousands separator
  "٭": "*", // ٭ five-pointed star
  "،": ",", // ، only reached when the font lacks the Arabic comma
  "؛": ";", // ؛ likewise
  "؟": "?", // ؟ likewise
  " ": " ", // non-breaking space

  // Tatweel is not here on purpose: shaping removes it before the font is
  // ever asked, so it never fails a build and never needs replacing.
};

export interface SteinsGateReplacement {
  /** The character with no glyph. */
  from: string;
  /** What it becomes, or an empty string when it is simply dropped. */
  to: string;
  /** How many times it was replaced. */
  count: number;
}

/**
 * `text` with every unsupported character that has an equivalent swapped out.
 *
 * `isSupported` decides what counts as unsupported, so this never touches a
 * character the build would have accepted: the Arabic comma, for one, has a
 * slot in the patched font and must stay Arabic.
 */
export function normalizeSteinsGateText(
  text: string,
  isSupported: (char: string) => boolean,
): { text: string; replacements: SteinsGateReplacement[] } {
  const counts = new Map<string, number>();
  let out = "";
  for (const char of text) {
    const equivalent = EQUIVALENTS[char];
    if (equivalent === undefined || isSupported(char)) {
      out += char;
      continue;
    }
    counts.set(char, (counts.get(char) ?? 0) + 1);
    out += equivalent;
  }
  return {
    text: out,
    replacements: [...counts.entries()]
      .map(([from, count]) => ({ from, to: EQUIVALENTS[from], count }))
      .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from)),
  };
}

/** True when the character is one this module knows how to replace. */
export function hasSteinsGateEquivalent(char: string): boolean {
  return EQUIVALENTS[char] !== undefined;
}
