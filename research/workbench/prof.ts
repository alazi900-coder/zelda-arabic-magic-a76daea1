import { readFileSync } from "fs";
import { ensurePlatTables } from "@/lib/nds/plat-charmap";
import { extractPlatEntries } from "@/lib/nds/plat-editor-bridge";
const PUB = "/home/user/zelda-arabic-magic-a76daea1/public/";
(globalThis as any).fetch = async (u: string) => ({ ok: true, json: async () => JSON.parse(readFileSync(PUB + u.replace(/^\//, ""), "utf8")) });

const NONLATIN = /[^\x00-\x7F]/;
async function main() {
  await ensurePlatTables();
  const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds"));
  const { entries } = extractPlatEntries(rom);
  const byFile = new Map<string, { n: number; jp: number; sample: string }>();
  for (const e of entries) {
    const f = byFile.get(e.msbtFile) ?? { n: 0, jp: 0, sample: e.original };
    f.n++;
    // kana / CJK ranges — the JP resources this US build still ships
    if (/[぀-ヿ一-鿿＀-￯]/.test(e.original)) f.jp++;
    byFile.set(e.msbtFile, f);
  }
  for (const f of ["platinum/seq_names","platinum/unk_0613","platinum/unk_0662","platinum/species_weight","platinum/unk_0451","platinum/npc_trainer_messages"]) {
    const es = entries.filter((e) => e.msbtFile === f).slice(0, 4);
    console.log(`\n${f}  (${entries.filter((e) => e.msbtFile === f).length} سطراً)`);
    for (const e of es) console.log("   ", JSON.stringify(e.original.slice(0, 70)));
  }
  // how many entries carry a { } tag at all
  const withTag = entries.filter((e) => /\{[^}]+\}/.test(e.original)).length;
  console.log(`\nأسطر فيها وسم { }: ${withTag} من ${entries.length}`);
  const kinds = new Map<string, number>();
  for (const e of entries) for (const m of e.original.match(/\{[^}]+\}/g) ?? []) {
    const name = m.slice(1).split(/[ }]/)[0];
    kinds.set(name, (kinds.get(name) ?? 0) + 1);
  }
  console.log("أنواع الوسوم:", [...kinds].sort((a,b)=>b[1]-a[1]).map(([k,n])=>`${k}:${n}`).join("  "));
}
main().catch((e) => { console.error(e); process.exit(1); });
