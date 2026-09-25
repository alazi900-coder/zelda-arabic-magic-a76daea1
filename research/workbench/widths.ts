import { readFileSync, writeFileSync } from "node:fs";
const REPO = "/home/user/zelda-arabic-magic-a76daea1";
// @ts-ignore
globalThis.fetch = async (u: any) => ({ ok: true, json: async () => JSON.parse(readFileSync(`${REPO}/public/${String(u).replace(/^.*\//, "")}`, "utf8")) } as any);
import { ensurePlatTables, platCharmap } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
main();
async function main() {
  await ensurePlatTables();
  const cm = platCharmap();
  const out: Record<string, number> = {};
  for (const ch of "0123456789/ ") {
    const code = cm.toCode.get(ch);
    if (code !== undefined) out[ch] = code;
  }
  console.log(JSON.stringify(out));
  writeFileSync(`${SCR}/char_codes.json`, JSON.stringify(out));
}
