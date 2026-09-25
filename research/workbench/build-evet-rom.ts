import { readFileSync, writeFileSync } from "node:fs";
import { readInazumaText, writeInazumaText } from "@/lib/inazuma/inazuma-rom";

const [romPath, outPath] = process.argv.slice(2);
const rom = new Uint8Array(readFileSync(romPath));
const rows = readInazumaText(rom);

// Prefix every line that comes out of a pack. Whatever dialogue the game shows
// first then carries the mark, so there is no guessing which line appears when
// -- and prefixing ~56,000 records also makes both packs grow, which exercises
// the path where a rebuilt archive no longer fits where it was.
const edited = rows.map((r) =>
  (r.source === "evet") && /[A-Za-z]/.test(r.text)
    ? { ...r, text: `>>${r.text}` }
    : r,
);
const result = writeInazumaText(rom, edited);
console.log("changed:", result.changed);
console.log("warnings:", result.warnings.length ? result.warnings : "(none)");
writeFileSync(outPath, result.rom);
const back = readInazumaText(new Uint8Array(readFileSync(outPath)));
console.log("rows after:", back.length, "marked:", back.filter((r) => r.text.startsWith(">>")).length);
