import { readFileSync } from "fs";
import { parseGtaIvGxt, gtaIvRawUnitsToString } from "@/lib/gtaiv/gxt-format";
const buf = readFileSync("/root/.claude/uploads/30195602-0f97-5db6-98d0-4ccab372886b/a5c910b1-russian_3.gxt");
const gxt = parseGtaIvGxt(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const counts = new Map<string, number>();
let withTag = 0, total = 0, multiTag = 0;
for (const t of gxt.tables) for (const e of t.entries) {
  const raw = gtaIvRawUnitsToString(e.textUnits);
  total++;
  const m = raw.match(/~[^~]*~/g);
  if (!m) continue;
  withTag++;
  const nonNewline = m.filter((x) => x !== "~n~");
  if (nonNewline.length > 0) multiTag++;
  for (const tok of m) counts.set(tok, (counts.get(tok) ?? 0) + 1);
}
console.log(`entries=${total} withAnyTag=${withTag} withNonNewlineTag=${multiTag}`);
const sorted = [...counts].sort((a, b) => b[1] - a[1]);
console.log("distinct tokens:", sorted.length);
console.log("top 30:");
for (const [tok, n] of sorted.slice(0, 30)) console.log(`  ${n.toString().padStart(6)}  ${tok}`);
// how many distinct token shapes are single-letter (style) vs word (content)?
const style = sorted.filter(([t]) => /^~[a-z]~$/.test(t));
console.log("single-letter tokens:", style.map(([t, n]) => `${t}:${n}`).join(" "));
