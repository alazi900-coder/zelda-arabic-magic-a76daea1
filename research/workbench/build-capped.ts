import { readFileSync, writeFileSync } from "node:fs";
import { findNdsFile, writeNdsFile } from "@/lib/nds/nds-rom";
import { INAZUMA_TEXT_KIND, readPack, writePack } from "@/lib/inazuma/inazuma-pack";

const [romPath, outPath] = process.argv.slice(2);
let rom = new Uint8Array(readFileSync(romPath));

for (const base of ["data_iz/script/en/evet", "data_iz/script/en/mcht"]) {
  const pkhFile = findNdsFile(rom, base + ".pkh")!;
  const pkbFile = findNdsFile(rom, base + ".pkb")!;
  const pack = readPack(rom.subarray(pkhFile.start, pkhFile.end), rom.subarray(pkbFile.start, pkbFile.end));
  const cap = Math.max(...pack.entries.map((e) => e.payload.length));
  console.log(base, "largest payload the game shipped with:", cap);

  // Mark every line, then drop the mark on any entry that would push its
  // decompressed payload past the biggest one the ROM already contains.
  let marked = 0, skipped = 0;
  for (const entry of pack.entries) {
    const before = entry.strings.map((s) => s.text);
    for (const s of entry.strings) if (s.kind === INAZUMA_TEXT_KIND && /[A-Za-z]/.test(s.text)) s.text = `>>${s.text}`;
    const grown = entry.strings.reduce((n, s) => n + 8 + Math.ceil((s.text.length + 1) / 4) * 4, 4);
    if (grown > cap) {
      entry.strings.forEach((s, i) => { s.text = before[i]; });
      skipped++;
    } else marked += entry.strings.filter((s, i) => s.text !== before[i]).length;
  }
  const built = writePack(pack);
  const newCap = Math.max(...pack.entries.map((e) => e.strings.reduce((n, s) => n + 8 + Math.ceil((s.text.length + 1) / 4) * 4, 4)));
  console.log("   marked:", marked, " entries left alone:", skipped, " new largest payload:", newCap, " (cap", cap, ")");
  rom = writeNdsFile(rom, pkbFile, built.pkb);
  rom = writeNdsFile(rom, findNdsFile(rom, base + ".pkh")!, built.pkh);
}
writeFileSync(outPath, rom);
console.log("written");
