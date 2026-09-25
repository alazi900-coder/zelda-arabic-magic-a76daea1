import { readFileSync } from "fs";
import { ensurePlatTables } from "@/lib/nds/plat-charmap";
import { extractPlatEntries } from "@/lib/nds/plat-editor-bridge";
import { categorizePlatEntry, PLATINUM_CATEGORIES } from "@/lib/nds/plat-categories";
import { PLAT_TAG_RE } from "@/lib/nds/plat-tag-mask";
import { editorTagPattern } from "@/lib/editor-tag-pattern";
const PUB = "/home/user/zelda-arabic-magic-a76daea1/public/";
(globalThis as any).fetch = async (u: string) => ({ ok: true, json: async () => JSON.parse(readFileSync(PUB + u.replace(/^\//, ""), "utf8")) });

async function main() {
  await ensurePlatTables();
  const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds"));
  const { entries } = extractPlatEntries(rom);
  console.log("أسطر المحرر:", entries.length);
  for (const junk of ["seq_names", "species_pokedex_entry_jp", "greetings_jp"])
    console.log(`  ${junk} موجود؟`, entries.some((e) => e.msbtFile === "platinum/" + junk));

  const counts = new Map<string, number>();
  for (const e of entries) counts.set(categorizePlatEntry(e), (counts.get(categorizePlatEntry(e)) ?? 0) + 1);
  console.log("\nالتصنيفات:");
  for (const c of PLATINUM_CATEGORIES) console.log(`  ${c.label.padEnd(28)} ${String(counts.get(c.id) ?? 0).padStart(6)}`);

  const misc = new Map<string, number>();
  for (const e of entries) if (categorizePlatEntry(e) === "plat-misc") misc.set(e.msbtFile, (misc.get(e.msbtFile) ?? 0) + 1);
  console.log("\nأكبر ما وقع في «متفرقات»:");
  for (const [f, n] of [...misc].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`  ${f.padEnd(46)} ${n}`);
  console.log("  ... عدد أرشيفاتها:", misc.size);
}
main().catch((e) => { console.error(e); process.exit(1); });
