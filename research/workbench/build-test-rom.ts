import { readFileSync, writeFileSync } from "node:fs";
import { readInazumaText, writeInazumaText } from "@/lib/inazuma/inazuma-rom";

const [romPath, outPath] = process.argv.slice(2);
const rom = new Uint8Array(readFileSync(romPath));
const rows = readInazumaText(rom);

const edits: { find: (t: string) => boolean; source: string; to: (t: string) => string }[] = [
  { source: "unitbase", find: (t) => t.startsWith("No one has more love for football"),
    to: () => "[TEST 1] The build pipeline works.\nThis text came from the editor." },
  { source: "mcht", find: (t) => t === "The game starts now!",
    to: () => "[TEST 2] The game starts now!" },
  { source: "evet", find: (t) => t === "%s\\njoined you!",
    to: () => "%s\\n[TEST 3] joined you!" },
];

let hits = 0;
const edited = rows.map((row) => {
  const edit = edits.find((e) => e.source === row.source && e.find(row.text));
  if (!edit) return row;
  hits++;
  return { ...row, text: edit.to(row.text) };
});
console.log("rows matched:", hits);

const result = writeInazumaText(rom, edited);
console.log("changed:", result.changed, "warnings:", result.warnings);
writeFileSync(outPath, result.rom);

// Prove it by reading the built ROM back, not by trusting the writer.
const back = readInazumaText(new Uint8Array(readFileSync(outPath)));
console.log("rows after:", back.length, "(before:", rows.length, ")");
const diff = back.filter((r, i) => r.text !== rows[i].text);
console.log("rows that differ:", diff.length);
for (const r of diff.slice(0, 5)) console.log("   ", r.source, r.entry, r.key, JSON.stringify(r.text));
