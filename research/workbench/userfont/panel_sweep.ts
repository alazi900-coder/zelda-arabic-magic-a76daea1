// The panel's own scan, run over the cartridge's lines with their breaks
// lost (as a line break, or as a space) or moved one word.
import { readFileSync } from "node:fs";
import { extractInazumaEntries } from "@/lib/inazuma/inazuma-editor-bridge";
import { findMisplacedInazumaBreak, hasBreakMidSentence, repairInazumaTags, validateInazumaTags } from "@/lib/inazuma/inazuma-tags";
import { fromInazumaBreakTokens } from "@/lib/inazuma/inazuma-break-tokens";
const breakCount = (t: string) => (fromInazumaBreakTokens(t).match(/\\f/g) ?? []).length;
const bare = (t: string) => fromInazumaBreakTokens(t).replace(/\\f/g, " ").replace(/\s+/g, " ").trim();
const shape = (t: string) => t.replace(/▼/g, " ▼ ").split(/\s+/).filter(Boolean).join(" ");
const rom = new Uint8Array(readFileSync(process.argv[2]));
const rows = extractInazumaEntries(rom).entries.filter((e) => e.original.includes("▼"));
const damage: Record<string, (o: string) => string> = {
  "lost as line": (o) => o.replace(/▼\n?/g, "\n"),
  "lost as space": (o) => o.replace(/▼\n?/g, " "),
  "moved +1 word": (o) => { const w = o.replace(/▼\n?/, " ▼ ").split(/\s+/).filter(Boolean); const i = w.indexOf("▼"); if (i + 1 >= w.length) return o; [w[i], w[i + 1]] = [w[i + 1], w[i]]; return w.join(" ").replace(/ ▼ ?/, "▼\n"); },
};
for (const [name, fn] of Object.entries(damage)) {
  let found = 0, right = 0, wrong = 0, review = 0;
  for (const e of rows) {
    const t = fn(e.original);
    if (t === e.original) continue;
    if (!(breakCount(t) < breakCount(e.original) || findMisplacedInazumaBreak(e.original, t) !== null)) continue;
    found++;
    const got = repairInazumaTags(e.original, t).text;
    const ok = got !== t && bare(got) === bare(t) && breakCount(got) === breakCount(e.original) && validateInazumaTags(e.original, got).valid && !(hasBreakMidSentence(got) && !hasBreakMidSentence(e.original));
    if (!ok) { review++; continue; }
    shape(got) === shape(e.original) ? right++ : wrong++;
  }
  console.log(`${name.padEnd(14)} found ${found}  fixed right ${right}  fixed wrong ${wrong}  left for review ${review}`);
}
