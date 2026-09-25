import { readFileSync } from "fs";
import { ensurePlatTables } from "@/lib/nds/plat-charmap";
import { extractPlatEntries, buildPlatRom } from "@/lib/nds/plat-editor-bridge";

const PUB = "/home/user/zelda-arabic-magic-a76daea1/public/";
(globalThis as any).fetch = async (u: string) => ({ ok: true, json: async () => JSON.parse(readFileSync(PUB + u.replace(/^\//, ""), "utf8")) });

async function main() {
  await ensurePlatTables();
  const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds"));
  const { entries } = extractPlatEntries(rom);
  console.log("total entries:", entries.length);

  // Show what's in options_menu / start_menu-ish archives to pick realistic targets.
  for (const f of ["platinum/options_menu", "platinum/start_menu", "platinum/main_menu_options"]) {
    const es = entries.filter((e) => e.msbtFile === f);
    console.log(`\n${f}: ${es.length} entries`);
    for (const e of es.slice(0, 8)) console.log("  ", e.index, JSON.stringify(e.original));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
