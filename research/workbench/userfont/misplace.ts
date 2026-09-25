import { readFileSync } from "node:fs";
import { extractInazumaEntries } from "@/lib/inazuma/inazuma-editor-bridge";
import { findMisplacedInazumaBreak, repairInazumaTags } from "@/lib/inazuma/inazuma-tags";
import { detectIssues } from "@/lib/diagnostic-detect";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const rows = extractInazumaEntries(rom).entries.filter((e) => e.original.includes("▼"));
const shape = (t: string) => t.replace(/▼/g, " ▼ ").split(/\s+/).filter(Boolean).join(" ");

// 1. correctly placed lines must never be flagged
let falsePos = 0;
for (const e of rows) if (findMisplacedInazumaBreak(e.original, e.original) !== null) falsePos++;

// 2. move the first ▼ by k words, then ask the fix
const res: Record<string, { flagged: number; right: number; wrong: number; total: number }> = {};
for (const k of [-2, -1, 1, 2]) {
  const r = { flagged: 0, right: 0, wrong: 0, total: 0 };
  for (const e of rows) {
    const words = e.original.replace(/▼\n?/, " ▼ ").split(/\s+/).filter(Boolean);
    const at = words.indexOf("▼");
    const to = at + k;
    if (to < 1 || to >= words.length) continue;
    words.splice(at, 1);
    words.splice(to, 0, "▼");
    const damaged = words.join(" ").replace(/ ▼ ?/, "▼\n");
    r.total++;
    const issue = detectIssues(e, damaged).some((i) => i.category === "inazuma_break_misplaced");
    if (!issue) continue;
    r.flagged++;
    const fixed = repairInazumaTags(e.original, damaged).text;
    shape(fixed) === shape(e.original) ? r.right++ : r.wrong++;
  }
  res[`move ${k > 0 ? "+" : ""}${k}`] = r;
}
console.log({ lines: rows.length, falsePositives: falsePos });
console.table(res);
