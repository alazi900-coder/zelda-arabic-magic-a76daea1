// How much of real Arabic text the N most frequent glyph forms cover, using
// the project's own reshaper, on the Arabic already in the project.
import { readFileSync } from "node:fs";
import { processArabicText } from "@/lib/arabic-processing";
import { INAZUMA_ARABIC_CODEPOINTS } from "@/lib/inazuma/inazuma-arabic-glyphs";
const bundle = JSON.parse(readFileSync("public/bundled-translations.json", "utf8"));
const texts: string[] = [];
const walk = (v: unknown) => { if (typeof v === "string") { if (/[؀-ۿ]/.test(v)) texts.push(v); } else if (v && typeof v === "object") Object.values(v).forEach(walk); };
walk(bundle);
const set = new Set(INAZUMA_ARABIC_CODEPOINTS);
const freq = new Map<number, number>(); let total = 0, other = 0;
for (const t of texts) for (const ch of processArabicText(t)) {
  const cp = ch.codePointAt(0)!;
  if (set.has(cp)) { freq.set(cp, (freq.get(cp) ?? 0) + 1); total++; } else if (cp > 0x7e) other++;
}
const ranked = [...freq.values()].sort((a, b) => b - a);
const cov = (n: number) => (100 * ranked.slice(0, n).reduce((a, b) => a + b, 0) / total).toFixed(2);
console.log(`corpus: ${texts.length} lines, ${total} Arabic glyphs, forms seen ${ranked.length} of ${set.size}`);
for (const n of [60, 86, 100, 112, 125]) console.log(`  top ${n} forms cover ${cov(n)}% of letters`);
