import { readFileSync, writeFileSync } from "fs";
import { ensurePlatTables } from "@/lib/nds/plat-charmap";
import { extractPlatEntries, buildPlatRom } from "@/lib/nds/plat-editor-bridge";

const PUB = "/home/user/zelda-arabic-magic-a76daea1/public/";
(globalThis as any).fetch = async (u: string) => ({ ok: true, json: async () => JSON.parse(readFileSync(PUB + u.replace(/^\//, ""), "utf8")) });

async function main() {
  await ensurePlatTables();
  const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds"));
  const { entries } = extractPlatEntries(rom);

  const menu = entries.filter((e) => e.msbtFile === "platinum/start_menu");
  for (const e of menu) console.log(e.index, JSON.stringify(e.original));

  // Realistic per-item Arabic labels, exactly as a translator typing menu words
  // would write them -- short, plain, no tags except the one that already has one.
  const t: Record<string, string> = {
    "platinum/start_menu:0": "بوكيديكس",
    "platinum/start_menu:1": "بوكيمون",
    "platinum/start_menu:2": "الحقيبة",
    "platinum/start_menu:3": "{STRVAR_1 3, 0, 0}",
    "platinum/start_menu:4": "حفظ",
    "platinum/start_menu:5": "خيارات",
    "platinum/start_menu:6": "خروج",
    "platinum/start_menu:7": "دردشة",
    "platinum/rowan_intro:0": "مرحبا بك في عالم بوكيمون\r",
    "platinum/rowan_intro:1": "اسمي أوكيدو، وأنا باحث بوكيمون\r",
  };

  const result = buildPlatRom(rom, t);
  console.log("translated:", result.translatedLines, "broken:", result.brokenTags.length, "tooLong:", result.tooLong.length, "unmapped:", result.unmapped);
  writeFileSync("/tmp/repro.nds", result.rom);
  console.log("wrote /tmp/repro.nds", result.rom.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
