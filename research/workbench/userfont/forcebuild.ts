// A real build over the cartridge: overlong descriptions, a dropped token and an
// undrawable letter, built normally and forced, then read back from the ROM.
import { readFileSync } from "node:fs";
import { extractInazumaEntries, buildInazumaRom } from "@/lib/inazuma/inazuma-editor-bridge";
import { readInazumaText } from "@/lib/inazuma/inazuma-rom";
const rom = new Uint8Array(readFileSync(process.argv[2]));
const { entries } = extractInazumaEntries(rom);
const slotted = entries.filter((e) => e.maxBytes !== undefined).slice(0, 5);
const tagged = entries.find((e) => e.maxBytes === undefined && /%d/.test(e.original))!;
const tr: Record<string, string> = {};
const longAr = "هذا وصف عربي طويل جدا كتبناه عمدا ليتجاوز حجم الخانة المحددة في ملف اللعبة ونرى كيف يقص البناء الاجباري الكلمات من آخره فقط";
for (const e of slotted) tr[`${e.msbtFile}:${e.index}`] = longAr;
tr[`${tagged.msbtFile}:${tagged.index}`] = "حصلت على نقاط كثيرة ڤ";
for (const force of [false, true]) {
  const r = buildInazumaRom(rom, tr, { force });
  console.log(`force=${force}: written ${r.translatedLines}, refused tooLong ${r.tooLong.length}, refused tags ${r.brokenTags.length}, forcedTags ${r.forcedTags.length}, cut ${r.cut.length}, warnings ${r.warnings.length}`);
  if (force) {
    const rows = readInazumaText(r.rom);
    const byKey = new Map(rows.map((x) => [`inazuma/${x.source}:${x.key < 0 ? x.entry : x.entry * 100000 + x.key}`, x]));
    for (const e of slotted) {
      const row = byKey.get(`${e.msbtFile}:${e.index}`)!;
      console.log(`   slot ${e.index}: ${row.text.length} bytes (limit ${e.maxBytes}) changed=${row.text !== e.original}`);
    }
    const t = byKey.get(`${tagged.msbtFile}:${tagged.index}`)!;
    console.log(`   tagged line written=${t.text !== tagged.original.replace(/\n/g, "\\n")}, bytes>0xFF: ${[...t.text].filter((c) => c.charCodeAt(0) > 0xff).length}`);
  }
}
