import { readFileSync } from "fs";
import path from "path";

const PUBLIC_DIR = "/home/user/zelda-arabic-magic-a76daea1/public";
globalThis.fetch = async (url) => {
  const p = path.join(PUBLIC_DIR, url.toString());
  const data = readFileSync(p, "utf-8");
  return { ok: true, json: async () => JSON.parse(data) };
};

const { ensurePlatTables, encodePlatMessage, platCharmap } = await import(
  "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap.ts"
);
const { reshapeArabic } = await import(
  "/home/user/zelda-arabic-magic-a76daea1/src/lib/arabic-processing.ts"
);

await ensurePlatTables();
const cm = platCharmap();

function testChar(label, ch) {
  try {
    const shaped = reshapeArabic("ا" + ch + "ب"); // wrap so joining context applies
    encodePlatMessage(shaped);
    console.log(`OK    ${label}: U+${ch.codePointAt(0).toString(16).toUpperCase()}`);
  } catch (err) {
    console.log(`FAIL  ${label}: U+${ch.codePointAt(0).toString(16).toUpperCase()} -- ${err.message}`);
  }
}

// Tashkeel diacritics
testChar("FATHA", "َ");
testChar("DAMMA", "ُ");
testChar("KASRA", "ِ");
testChar("SHADDA", "ّ");
testChar("SUKUN", "ْ");
testChar("TANWEEN_FATH", "ً");

// Arabic-Indic digits
testChar("ARABIC_ZERO", "٠");
testChar("ARABIC_ONE", "١");

// Typographic punctuation
testChar("EN_DASH", "–");
testChar("EM_DASH", "—");
testChar("ELLIPSIS", "…");
testChar("RIGHT_SINGLE_QUOTE", "’");
testChar("LEFT_DOUBLE_QUOTE", "“");
testChar("RIGHT_DOUBLE_QUOTE", "”");
testChar("ARABIC_COMMA", "،");
testChar("ARABIC_SEMICOLON", "؛");
testChar("ARABIC_QUESTION", "؟");
testChar("NBSP", " ");
testChar("TATWEEL", "ـ");
testChar("ARABIC_PERCENT", "٪");
