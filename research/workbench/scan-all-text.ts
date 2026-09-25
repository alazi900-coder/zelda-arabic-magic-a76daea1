import { readFileSync, writeFileSync } from "node:fs";
import { findNdsFile } from "@/lib/nds/nds-rom";
import { readPack } from "@/lib/inazuma/inazuma-pack";

const romPath = process.argv[2];
const rom = new Uint8Array(readFileSync(romPath));

function bytesOf(path: string): Uint8Array {
  const f = findNdsFile(rom, path);
  if (!f) throw new Error("missing " + path);
  return rom.subarray(f.start, f.end);
}

const allStrings: string[] = [];

// 1. evet + mcht packs -- ALL records regardless of kind, to be maximally safe.
for (const [pkh, pkb] of [
  ["data_iz/script/en/evet.pkh", "data_iz/script/en/evet.pkb"],
  ["data_iz/script/en/mcht.pkh", "data_iz/script/en/mcht.pkb"],
  ["data_iz/logic/en/team.pkh", "data_iz/logic/en/team.pkb"],
  ["data_iz/logic/fmt.pkh", "data_iz/logic/fmt.pkb"],
]) {
  const parsed = readPack(bytesOf(pkh), bytesOf(pkb));
  for (const entry of parsed.entries) {
    for (const s of entry.strings) allStrings.push(s.text);
  }
}
console.log("after packs:", allStrings.length);

// 2. Flat fixed-slot STR files: NUL-terminated strings, raw byte-per-char, slot size unknown so scan the whole blob as one run of NUL-separated chunks.
for (const path of [
  "data_iz/logic/en/unitbase.STR",
  "data_iz/logic/en/item.STR",
  "data_iz/logic/en/command.STR",
  "data_iz/logic/en/games.STR",
  "data_iz/logic/en/rpgtitle.STR",
]) {
  const data = bytesOf(path);
  let cur = "";
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0) {
      if (cur.length) allStrings.push(cur);
      cur = "";
    } else {
      cur += String.fromCharCode(data[i]);
    }
  }
  if (cur.length) allStrings.push(cur);
}
console.log("after flat files:", allStrings.length);

writeFileSync(
  "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/inazuma/all_strings_full.json",
  JSON.stringify(allStrings)
);
console.log("done");
