import { readFileSync } from "fs";
import path from "path";
const PUBLIC_DIR = "/home/user/zelda-arabic-magic-a76daea1/public";
globalThis.fetch = async (url) => {
  const p = path.join(PUBLIC_DIR, url.toString());
  return { ok: true, json: async () => JSON.parse(readFileSync(p, "utf-8")) };
};
const { extractPlatEntries } = await import("/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-editor-bridge.ts");
const { ensurePlatTables } = await import("/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap.ts");
await ensurePlatTables();

for (const [label, file] of [
  ["choice_test.nds", "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/choice_test.nds"],
  ["dialogue_test.nds", "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad/dialogue_test.nds"],
]) {
  const rom = new Uint8Array(readFileSync(file));
  const { entries } = extractPlatEntries(rom);
  const relevant = entries.filter(e => e.msbtFile === "platinum/rowan_intro" && [0,31,32,33].includes(e.index));
  console.log(`--- ${label} ---`);
  for (const e of relevant) console.log(e.index, JSON.stringify(e.original));
}
