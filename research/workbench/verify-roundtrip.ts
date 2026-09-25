import { readFileSync } from "node:fs";
import { findNdsFile } from "@/lib/nds/nds-rom";
import { readPack } from "@/lib/inazuma/inazuma-pack";
import { decompressLz10, compressLz10 } from "@/lib/fireemblem12/nds-lz";

const romPath = process.argv[2];
const rom = new Uint8Array(readFileSync(romPath));

for (const base of ["data_iz/script/en/evet", "data_iz/script/en/mcht"]) {
  const pkhFile = findNdsFile(rom, base + ".pkh")!;
  const pkbFile = findNdsFile(rom, base + ".pkb")!;
  const pack = readPack(rom.subarray(pkhFile.start, pkhFile.end), rom.subarray(pkbFile.start, pkbFile.end));
  let bad = 0;
  for (const entry of pack.entries) {
    if (entry.compressed.length < 4 || entry.compressed[0] !== 0x10) continue;
    let decoded: Uint8Array;
    try { decoded = decompressLz10(entry.compressed); }
    catch (e) { console.log("DECODE FAIL", base, entry.id, e); bad++; continue; }
    if (decoded.length !== entry.payload.length || !decoded.every((b, i) => b === entry.payload[i])) {
      console.log("MISMATCH", base, entry.id, "decoded", decoded.length, "expected", entry.payload.length);
      bad++;
    }
  }
  console.log(base, "entries:", pack.entries.length, "round-trip failures:", bad);
}
