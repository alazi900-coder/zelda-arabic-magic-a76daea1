// Shapes every Arabic string in one go and hands back the cartridge's glyph
// table with it, so the drawing step needs nothing from the repo at run time.
import { readFileSync } from "node:fs";
import { reshapeArabic, reverseBidi } from "@/lib/arabic-processing";
import { INAZUMA_ARABIC_CODEPOINTS, INAZUMA_FONT12_GLYPHS_B64, INAZUMA_FONT12_WIDTHS } from "@/lib/inazuma/inazuma-arabic-glyphs";
const words: string[] = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const shaped: Record<string, number[]> = {};
for (const w of words) shaped[w] = [...reverseBidi(reshapeArabic(w))].map((c) => c.codePointAt(0)!);
process.stdout.write(JSON.stringify({
  shaped,
  cps: INAZUMA_ARABIC_CODEPOINTS,
  widths: INAZUMA_FONT12_WIDTHS,
  glyphs: INAZUMA_FONT12_GLYPHS_B64,
}));
