import { readFileSync, writeFileSync } from "node:fs";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";

const romPath = process.argv[2];
const out = process.argv[3];
const rom = new Uint8Array(readFileSync(romPath));
const rows = readInazumaText(rom);
writeFileSync(out, JSON.stringify({ format: "inazuma-arabic-editable-v1", game: "Inazuma Eleven (Europe) YEEP", entry_count: rows.length, rows }, null, 1));
const by: Record<string, number> = {};
for (const r of rows) by[r.source] = (by[r.source] ?? 0) + 1;
console.log("rows:", rows.length, by);
console.log("chars:", rows.reduce((n, r) => n + r.text.length, 0));
// a few menu strings to pick a visible target from
for (const r of rows.filter((r) => r.source === "mcht").slice(0, 400)) {
  if (r.text.length >= 4 && r.text.length <= 24 && /^[A-Z][A-Za-z !?'.]+$/.test(r.text)) console.log("  mcht", r.entry, r.key, JSON.stringify(r.text));
}
