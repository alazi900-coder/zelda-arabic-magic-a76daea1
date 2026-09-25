import { readFileSync } from "node:fs";
import { extractInazumaEntries, buildInazumaRom, restoreInazumaTranslations } from "@/lib/inazuma/inazuma-editor-bridge";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
import { detectIssues } from "@/lib/diagnostic-detect";
import { editorTagPattern } from "@/lib/editor-tag-pattern";
import { repairInazumaTags } from "@/lib/inazuma/inazuma-tags";

const rom = new Uint8Array(readFileSync(process.argv[2]));
const { entries } = extractInazumaEntries(rom);
const e = entries.find((x) => x.original.startsWith("Your speed will drop if you lose"))!;
const key = `${e.msbtFile}:${e.index}`;
console.log("1. editor original:", JSON.stringify(e.original));

// the translation from the screenshot: two lines, no break at all
const screenshot = "ستنخفض سرعتك إذا فقدت الكثير من نقاط اللياقة.\nسترى ذلك عندما يبدأ أحد لاعبيك بالتعرق.";
const issues = detectIssues(e, screenshot).map((i) => i.category);
console.log("2. deep scan on screenshot translation:", issues.filter((c) => c.startsWith("inazuma")));
const fixed = repairInazumaTags(e.original, screenshot);
console.log("3. ⚡ repair:", fixed.changed, JSON.stringify(fixed.text));
console.log("   deep scan after repair:", detectIssues(e, fixed.text).map((i) => i.category).filter((c) => c.startsWith("inazuma")));
console.log("4. ▼ highlighted as a token:", JSON.stringify(fixed.text.match(editorTagPattern(e.msbtFile))));

// an old save with the literal \f is carried over as ▼
const old = restoreInazumaTranslations([e], { [key]: "ستنخفض سرعتك.\\fسترى ذلك." })[key];
console.log("5. old save restored:", JSON.stringify(old));

const r = buildInazumaRom(rom, { [key]: fixed.text });
const row = readInazumaText(r.rom).find((x) => `inazuma/${x.source}:${x.key < 0 ? x.entry : x.entry * 100000 + x.key}` === key)!;
console.log("6. build:", r.translatedLines, "written; in ROM \\f count:", (row.text.match(/\\f/g) ?? []).length,
  " ▼ bytes:", row.text.includes("▼"), " n\\ or f\\:", row.text.includes("n\\") || row.text.includes("f\\"),
  " \\n count:", (row.text.match(/\\n/g) ?? []).length);
