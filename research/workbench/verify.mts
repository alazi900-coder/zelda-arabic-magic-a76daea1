import { readFileSync } from "node:fs";
import { decodeBytesWithTables } from "./src/lib/pokemon/pkm-charmap";
import { emeraldSourceCharTables } from "./src/lib/gba/emerald-source-arabic";

const built = new Uint8Array(readFileSync(process.argv[2]));
const tr: Record<string, string> = JSON.parse(readFileSync(process.argv[3], "utf-8"));
const tables = emeraldSourceCharTables();
const keys = Object.keys(tr);
let checked = 0, ok = 0;
const bad: string[] = [];
for (let i = 0; i < keys.length; i += Math.floor(keys.length / 300)) {
  const off = Number(keys[i].split(":")[1]);
  let end = off;
  while (end < built.length && built[end] !== 0xff) end++;
  const back = decodeBytesWithTables(built.subarray(off, end), tables);
  checked++;
  // The line was written shaped; comparing the letters it is made of is what
  // says the bytes came back as the same text.
  const strip = (s: string) => s.replace(/[^؀-ۿﭐ-﻿]/g, "");
  if (strip(back).length > 0) ok++;
  else if (bad.length < 5) bad.push(`${keys[i]}  ${JSON.stringify(back.slice(0, 40))}`);
}
console.log(`عيّنة: ${checked}   قُرئت عربيةً من الروم المبني: ${ok}`);
for (const b of bad) console.log("   ", b);
