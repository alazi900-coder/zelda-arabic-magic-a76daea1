import { readFileSync, writeFileSync } from "node:fs";
import { buildInazumaRom } from "@/lib/inazuma/inazuma-editor-bridge";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";

const rom = new Uint8Array(readFileSync(process.argv[2]));
const key = "inazuma/evet:8100001000225";
const translation = "سمعت شائعات أن النادي\nسيحل على أي حال. لا\nفائدة من الحماس الآن...\\fإنها كذبة! قل لي إنها غير صحيحة!";
const r = buildInazumaRom(rom, { [key]: translation });
console.log("translatedLines", r.translatedLines, "brokenTags", r.brokenTags, "tooLong", r.tooLong, "warnings", r.warnings);

const rows = readInazumaText(r.rom);
const row = rows.find((x) => `inazuma/${x.source}:${x.key < 0 ? x.entry : x.entry * 100000 + x.key}` === key)!;
const skeleton = row.text.replace(/[^\x00-\x7f]/g, "·");
console.log("in ROM:", JSON.stringify(skeleton));
console.log("n\\\\ present (bad):", row.text.includes("n\\"));
console.log("f\\\\ present (bad):", row.text.includes("f\\"));
console.log("\\\\n count:", (row.text.match(/\\n/g) ?? []).length, "\\\\f count:", (row.text.match(/\\f/g) ?? []).length);

writeFileSync(process.argv[3], r.rom);
