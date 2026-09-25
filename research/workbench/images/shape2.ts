import { reshapeArabic, reverseBidi } from "@/lib/arabic-processing";
import { INAZUMA_ARABIC_CODEPOINTS, INAZUMA_FONT12_GLYPHS_B64, INAZUMA_FONT12_WIDTHS } from "@/lib/inazuma/inazuma-arabic-glyphs";
const text = process.argv.slice(2).join(" ");
const codes = [...reverseBidi(reshapeArabic(text))].map((c) => c.codePointAt(0)!);
process.stdout.write(JSON.stringify({
  codes,
  cps: INAZUMA_ARABIC_CODEPOINTS,
  widths: INAZUMA_FONT12_WIDTHS,
  glyphs: INAZUMA_FONT12_GLYPHS_B64,
}));
