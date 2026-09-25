import { readFileSync, writeFileSync } from "node:fs";
const REPO = "/home/user/zelda-arabic-magic-a76daea1";
// @ts-ignore
globalThis.fetch = async (u: any) => ({ ok: true, json: async () => JSON.parse(readFileSync(`${REPO}/public/${String(u).replace(/^.*\//, "")}`, "utf8")) } as any);
import { ensurePlatTables } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap";
import { extractPlatEntries } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-editor-bridge";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
main();
async function main() {
await ensurePlatTables();
const { entries } = extractPlatEntries(new Uint8Array(readFileSync(`${SCR}/base_font3.nds`)));
const orig = new Map<string, string>();
for (const e of entries) orig.set(`${e.msbtFile}:${e.index}`, e.original);
const keys = ["platinum/battle_arcade_scene:76","platinum/battle_arcade_scene:79","platinum/celestic_town_cave:11","platinum/eterna_city_condominiums_3f:1","platinum/jubilife_city:56","platinum/jubilife_city:76","platinum/mining_museum:19","platinum/tv_programs_interviews:47"];
const tr: Record<string,string> = JSON.parse(readFileSync(`${SCR}/translated.json`, "utf8"));
const out: any = {};
for (const k of keys) { out[k] = { english: orig.get(k), arabic: tr[k] }; console.log("### " + k + "\n--- الإنجليزي ---\n" + orig.get(k) + "\n--- العربي ---\n" + tr[k] + "\n"); }
writeFileSync(`${SCR}/breaks_pairs.json`, JSON.stringify(out, null, 2));
}
