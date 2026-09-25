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
  const rom = new Uint8Array(readFileSync(`${SCR}/base_font3.nds`));
  const { entries } = extractPlatEntries(rom);
  const hits = entries.filter((e) => /\{STRVAR_1[^}]*\}\s*\/\s*\{STRVAR_1[^}]*\}/.test(e.original));
  console.log("عدد المطابقات:", hits.length);
  for (const h of hits) console.log(`${h.msbtFile}:${h.index}  →  ${JSON.stringify(h.original)}`);
}
