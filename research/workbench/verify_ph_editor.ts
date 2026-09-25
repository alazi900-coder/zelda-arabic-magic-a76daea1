import { readFileSync, writeFileSync } from "fs";
import { extractPhEntries, buildPhRom } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/ph/ph-editor-bridge.ts";
import { looksLikeNdsRom, findNdsFile } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/nds-rom.ts";
import { parseBmg } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/ph/ph-bmg.ts";

const buf = readFileSync("/home/user/decomps/ph/ph_usa.nds");
const rom = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
console.log("looksLikeNdsRom:", looksLikeNdsRom(rom));

console.time("extract");
const imported = extractPhEntries(rom.buffer as ArrayBuffer);
console.timeEnd("extract");
console.log("fileCount:", imported.fileCount);
console.log("translatableMessageCount:", imported.translatableMessageCount);
console.log("excludedControlCodeCount:", imported.excludedControlCodeCount);
console.log("sample entries:", imported.entries.slice(0, 5).map(e => ({ label: e.label, original: e.original.slice(0, 40) })));

// translate first 5 entries
const translations: Record<string, string> = {};
for (const entry of imported.entries.slice(0, 5)) {
  translations[`${entry.msbtFile}:${entry.index}`] = "مرحباً بالعربية";
}

console.time("build");
const result = buildPhRom(rom.buffer as ArrayBuffer, imported.entries, translations);
console.timeEnd("build");
console.log("translatedLines:", result.translatedLines);
console.log("output rom size:", result.buffer.byteLength, "vs original:", rom.length);

// verify the translated files actually contain the Arabic text
const newRom = new Uint8Array(result.buffer);
for (const entry of imported.entries.slice(0, 5)) {
  const path = entry.msbtFile.slice("ph/".length);
  const ndsFile = findNdsFile(newRom, path);
  if (!ndsFile) { console.log("FILE NOT FOUND:", path); continue; }
  const bmg = parseBmg(newRom.subarray(ndsFile.start, ndsFile.end));
  const msg = bmg.messages[entry.index];
  console.log(`${path} #${entry.index}: "${msg.text}" (expected "مرحباً بالعربية")`);
}

writeFileSync("/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/ph_usa_translated_test.nds", newRom);
console.log("wrote test rom");
