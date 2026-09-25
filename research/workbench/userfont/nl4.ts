import { prepareInazumaLine } from "@/lib/inazuma/inazuma-editor-bridge";
import { readFileSync, writeFileSync } from "node:fs";
import { patchInazumaFonts } from "@/lib/inazuma/inazuma-editor-bridge";
import { findNdsFile, writeNdsFile, ndsFileIdByPath } from "@/lib/nds/nds-rom";
import { readInazumaText, writeInazumaText } from "@/lib/inazuma/inazuma-rom";

const original = "I've heard rumours that Miss Natsumi's fallen in love with someone...\\fIt's a lie! Tell me it's not true";
const translation = "سمعت شائعات أن النادي\nسيحل على أي حال. لا\nفائدة من الحماس الآن...\\fإنها كذبة! قل لي إنها غير صحيحة!";
const r = prepareInazumaLine(original, translation, undefined, false);
console.log("box0 line order (should be: النادي, حال, الآن):");
r.encoded!.split("\\f")[0].split("\\n").forEach((line, i) => {
  // strip to just show it's non-empty / roughly which Arabic run -- can't easily render Shift-JIS bytes here,
  // but line COUNT and boundary positions are what matter
  console.log(` line ${i}: ${line.length} bytes`);
});

// Now build a tiny test ROM: patch this single evet string and boot in emulator? Too heavy here;
// instead just do a full round trip through the actual ROM build path to be sure nothing throws.
const S = process.argv[2];
let rom = new Uint8Array(readFileSync(S));
const rows = readInazumaText(rom);
const row = rows.find(r => r.text.includes("Natsumi") && r.text.includes("\\f"));
if (!row) { console.log("NO MATCHING ROW FOUND IN ROM"); process.exit(0); }
console.log("found row, original:", JSON.stringify(row.text));
const key = `inazuma/${row.source}:${row.key < 0 ? row.entry : row.entry * 100000 + row.key}`;
console.log("key:", key);
