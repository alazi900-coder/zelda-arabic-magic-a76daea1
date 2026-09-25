import { readFileSync, writeFileSync } from "node:fs";
import { readInazumaText, writeInazumaText } from "@/lib/inazuma/inazuma-rom";

const [romPath, outPath, pctArg] = process.argv.slice(2);
const pct = Number(pctArg);
const rom = new Uint8Array(readFileSync(romPath));
const rows = readInazumaText(rom);

// Mark every Nth eligible pack line so the marked set is spread evenly across
// both evet and mcht, rather than concentrated at the front (which is what
// the earlier 962-line test happened to do).
const eligible = rows.filter((r) => (r.source === "evet" || r.source === "mcht") && /[A-Za-z]/.test(r.text));
const step = Math.max(1, Math.round(100 / pct));
const marked = new Set<number>();
for (let i = 0; i < eligible.length; i += step) marked.add(i);

let n = 0;
const edited = rows.map((r) => {
  if (!((r.source === "evet" || r.source === "mcht") && /[A-Za-z]/.test(r.text))) return r;
  const idx = n++;
  return marked.has(idx) ? { ...r, text: `>>${r.text}` } : r;
});
const result = writeInazumaText(rom, edited);
console.log(`pct=${pct} eligible=${eligible.length} target_marked=${marked.size} changed=${result.changed}`);
console.log("warnings:", result.warnings.length ? result.warnings : "(none)");
writeFileSync(outPath, result.rom);
