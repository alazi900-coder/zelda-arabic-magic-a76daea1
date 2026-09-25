import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const REPO = "/home/user/zelda-arabic-magic-a76daea1";
// @ts-ignore
globalThis.fetch = async (u: any) => ({ ok: true, json: async () => JSON.parse(readFileSync(`${REPO}/public/${String(u).replace(/^.*\//, "")}`, "utf8")) } as any);
import { findNdsFile } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/nds-rom";
import { parseNarc } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/narc";
import { ensurePlatTables } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap";
import { extractPlatEntries } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-editor-bridge";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
const h = (b: Uint8Array) => createHash("sha1").update(b).digest("hex").slice(0, 12);
main();
async function main() {
await ensurePlatTables();
const a = new Uint8Array(readFileSync(`${SCR}/base_font3.nds`));
const b = new Uint8Array(readFileSync(`${SCR}/PokemonPlatinum_base_fonts_v4.nds`));
console.log("الحجم:", a.length, "→", b.length, a.length === b.length ? "✅ لم يتغيّر" : "❌");

const slot = findNdsFile(a, "graphic/pl_font.narc")!;
let first = -1, last = -1, n = 0;
for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { if (first < 0) first = i; last = i; n++; }
console.log(`بايتات مختلفة: ${n}`);
console.log(`مداها: ${first} … ${last}`);
console.log(`ملف الخط في الروم: ${slot.start} … ${slot.end}`);
console.log("كل الفروق داخل ملف الخط؟", first >= slot.start && last < slot.end ? "✅ نعم" : "❌ لا");
console.log("الترويسة (أول 0x200 بايت) سليمة؟", h(a.subarray(0, 0x200)) === h(b.subarray(0, 0x200)) ? "✅ نعم" : "❌ لا");

const fa = parseNarc(a.subarray(slot.start, slot.end)).files;
const fb = parseNarc(b.subarray(slot.start, slot.end)).files;
const N = ["font_system", "font_message", "font_subscreen", "font_unown", "m4", "m5", "m6", "m7"];
console.log("\nأعضاء الأرشيف:");
fb.forEach((m, i) => {
  const same = h(fa[i]) === h(m);
  console.log(`  [${i}] ${N[i].padEnd(15)} ${same ? "بلا تغيير" : "تغيّر ←"} ${same ? "" : h(m)}`);
});
console.log("\nfont_system == font_message الآن؟", h(fb[0]) === h(fb[1]) ? "✅ نعم" : "❌ لا");

const ea = extractPlatEntries(a).entries, eb = extractPlatEntries(b).entries;
console.log("\nالنصوص: قبل", ea.length, "مدخلة / بعد", eb.length);
let txtSame = ea.length === eb.length;
for (let i = 0; txtSame && i < ea.length; i++) if (ea[i].original !== eb[i].original) txtSame = false;
console.log("كل النصوص متطابقة (وإنجليزية)؟", txtSame ? "✅ نعم" : "❌ لا");
const arabic = eb.filter((e) => /[؀-ۿﭐ-﻿]/.test(e.original)).length;
console.log("مدخلات فيها حروف عربية:", arabic, arabic === 0 ? "✅ الروم إنجليزي بالكامل" : "❌");
}
