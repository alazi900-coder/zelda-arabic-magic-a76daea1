import { readFileSync, writeFileSync } from "fs";
import { ensurePlatTables } from "@/lib/nds/plat-charmap";
import { extractPlatEntries, buildPlatRom, measurePlatChars } from "@/lib/nds/plat-editor-bridge";

const PUB = "/home/user/zelda-arabic-magic-a76daea1/public/";
(globalThis as any).fetch = async (url: string) => ({
  ok: true, json: async () => JSON.parse(readFileSync(PUB + url.replace(/^\//, ""), "utf8")),
});

async function main() {
  await ensurePlatTables();
  const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds"));
  const { entries, packed, archives } = extractPlatEntries(rom);
  console.log(`archives=${archives} entries=${entries.length} packed=${packed}`);

  const rowan = entries.filter((e) => e.msbtFile === "platinum/rowan_intro").slice(0, 3);
  for (const e of rowan) console.log(`  ${e.msbtFile}:${e.index} limit=${e.maxBytes} | ${e.label}`);

  const names = entries.filter((e) => e.msbtFile === "platinum/species_names").slice(0, 2);
  for (const e of names) console.log(`  ${e.msbtFile}:${e.index} limit=${e.maxBytes} | ${e.label}`);

  const t: Record<string, string> = {
    "platinum/rowan_intro:0": "مرحبا بك في عالم بوكيمون\nاسمي أوكيدو، وأنا باحث\r",
  };
  console.log("chars of that line:", measurePlatChars(t["platinum/rowan_intro:0"]));

  const built = buildPlatRom(rom, t);
  console.log(`translated=${built.translatedLines} broken=${built.brokenTags.length} tooLong=${built.tooLong.length} unmapped=${JSON.stringify(built.unmapped)}`);
  console.log("rom size", built.rom.length);
  writeFileSync("/tmp/plat_built.nds", built.rom);

  // untouched build must reproduce the input exactly
  const same = buildPlatRom(rom, {});
  console.log("no-op build identical:", same.rom.length === rom.length && same.rom.every((v, i) => v === rom[i]));
}
main().catch((e) => { console.error(e); process.exit(1); });
