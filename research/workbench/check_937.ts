import { readFileSync } from "node:fs";
const REPO = "/home/user/zelda-arabic-magic-a76daea1";
// @ts-ignore
globalThis.fetch = async (u: any) => ({ ok: true, json: async () => JSON.parse(readFileSync(`${REPO}/public/${String(u).replace(/^.*\//, "")}`, "utf8")) } as any);
import { ensurePlatTables } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap";
import { extractPlatEntries } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-editor-bridge";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
main();
async function main() {
  await ensurePlatTables();
  for (const f of ["base_font3.nds", "v4.nds"]) {
    const rom = new Uint8Array(readFileSync(`${SCR}/${f}`));
    const { entries } = extractPlatEntries(rom);
    const e = entries.find((e) => e.msbtFile === "platinum/battle_strings" && e.index === 937);
    console.log(`${f}: platinum/battle_strings:937 = ${JSON.stringify(e?.original)}`);
  }
}
