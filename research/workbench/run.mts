import { readFileSync, writeFileSync } from "node:fs";
import { extractPkmEntries, buildPkmRom } from "./src/lib/pokemon/pkm-editor-bridge";
import { ensureEmeraldSourceSlots } from "./src/lib/gba/emerald-source-slots";
import { toLogicalArabic } from "./src/lib/gba/emerald-source-arabic";

// The page fetches the table over HTTP; here it is read off disk.
const slotsJson = readFileSync("public/pokeemerald-slots.json", "utf-8");
globalThis.fetch = (async () => ({ ok: true, json: async () => JSON.parse(slotsJson) })) as never;

const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeemerald-en/pokeemerald.gba"));
console.log("جدول الخانات مطابق للروم:", await ensureEmeraldSourceSlots(rom));

const { entries, textBytes } = extractPkmEntries(rom, "emerald-source");
const byFile: Record<string, number> = {};
for (const e of entries) byFile[e.msbtFile] = (byFile[e.msbtFile] ?? 0) + 1;
console.log(`أسطر: ${entries.length}   نصّ: ${Math.round(textBytes / 1024)} ك.ب`);
console.log("الأقسام:", byFile);
console.log("\nJYNX:");
for (const e of entries.filter((x) => x.original === "JYNX"))
  console.log(`   ${e.msbtFile}  حدّ=${e.maxBytes}`);
console.log("نفاية باقية؟", entries.filter((e) => /^[a-z]{6,}$/.test(e.original.replace(/[^a-z]/g, "")) && !/[aeiou]/.test(e.original)).length);

const pairs: Record<string, string> = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const key = (s: string) => s.replace(/\{[^}]*\}/g, "").replace(/[^0-9A-Za-zÀ-ÿ]/g, "").toUpperCase();
const tr: Record<string, string> = {};
for (const e of entries) {
  const k = key(e.original);
  const v = pairs["=" + e.original] ?? (k.length >= 4 ? pairs[k] : undefined);
  if (v !== undefined) tr[`${e.msbtFile}:${e.index}`] = toLogicalArabic(v);
}
console.log(`\nترجمات مطابَقة: ${Object.keys(tr).length} من ${entries.length}`);
writeFileSync(process.argv[3], JSON.stringify(tr, null, 1));

const r = buildPkmRom(rom, tr, { game: "emerald-source", relocate: true });
if ("error" in r) throw new Error(r.error);
console.log(`بناء: كُتب ${r.translatedLines}  متجاوز ${r.tooLong.length}  منقول ${r.relocated}  حرّ ${Math.round(r.freeSpaceLeft/1024)} ك.ب`);
writeFileSync(process.argv[4], r.rom);
