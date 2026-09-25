import { readFileSync } from "fs";
import { parseBmg, buildBmg } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/ph/ph-bmg.ts";

const path = process.argv[2];
const buf = readFileSync(path);
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

const bmg = parseBmg(data);
console.log("messages:", bmg.messages.length);
console.log("with control codes:", bmg.messages.filter(m => m.hasControlCode).length);
console.log("sample messages:");
bmg.messages.slice(0, 5).forEach((m, i) => console.log(`  [${i}] offset=${m.offset} ctrl=${m.hasControlCode} text=${JSON.stringify(m.text.slice(0,60))}`));

// round-trip with no changes
const rebuilt = buildBmg(bmg, new Map());
console.log("\noriginal size:", data.length, "rebuilt size:", rebuilt.length);
const reparsed = parseBmg(rebuilt);
console.log("reparsed message count:", reparsed.messages.length, "vs original:", bmg.messages.length);
let allMatch = true;
for (let i = 0; i < bmg.messages.length; i++) {
  if (bmg.messages[i].text !== reparsed.messages[i].text) {
    allMatch = false;
    console.log(`MISMATCH at [${i}]: orig=${JSON.stringify(bmg.messages[i].text)} rebuilt=${JSON.stringify(reparsed.messages[i].text)}`);
  }
}
console.log("all messages match after round-trip (no edits):", allMatch);

// now translate a couple of entries (skip control-code ones) and verify
const replacements = new Map<number, string>();
let translatedCount = 0;
for (let i = 0; i < bmg.messages.length && translatedCount < 3; i++) {
  if (!bmg.messages[i].hasControlCode && bmg.messages[i].text.length > 0) {
    replacements.set(i, "مرحباً بالعربية");
    translatedCount++;
  }
}
const rebuilt2 = buildBmg(bmg, replacements);
const reparsed2 = parseBmg(rebuilt2);
console.log("\nafter translating", translatedCount, "entries:");
for (const [idx, text] of replacements) {
  console.log(`  [${idx}] expected=${JSON.stringify(text)} got=${JSON.stringify(reparsed2.messages[idx].text)} match=${reparsed2.messages[idx].text === text}`);
}
// verify untouched entries still match original
let untouchedOk = true;
for (let i = 0; i < bmg.messages.length; i++) {
  if (!replacements.has(i) && bmg.messages[i].text !== reparsed2.messages[i].text) {
    untouchedOk = false;
    console.log(`UNTOUCHED MISMATCH at [${i}]`);
  }
}
console.log("untouched entries preserved:", untouchedOk);
