import { readFileSync } from "node:fs";
const REPO = "/home/user/zelda-arabic-magic-a76daea1";
// @ts-ignore
globalThis.fetch = async (u: any) => ({ ok: true, json: async () => JSON.parse(readFileSync(`${REPO}/public/${String(u).replace(/^.*\//, "")}`, "utf8")) } as any);
import { ensurePlatTables } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap";
import { buildPlatRom } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-editor-bridge";
const SCR = "/tmp/claude-0/-home-user-zelda-arabic-magic-a76daea1/30195602-0f97-5db6-98d0-4ccab372886b/scratchpad";
main();
async function main() {
  await ensurePlatTables();
  const rom = new Uint8Array(readFileSync(`${SCR}/base_font3.nds`));
  for (const f of ["translated.json", "translated_fixed.json"]) {
    const tr = JSON.parse(readFileSync(`${SCR}/${f}`, "utf8"));
    const r = buildPlatRom(rom, tr);
    console.log(`\n=== ${f} (${Object.keys(tr).length} مدخلة) ===`);
    console.log("  أسطر كُتبت فعلاً :", r.translatedLines);
    console.log("  رُفضت لوسم مكسور:", r.brokenTags.length);
    console.log("  رُفضت لطولها    :", r.tooLong.length);
    console.log("  حروف بلا خانة   :", r.unmapped.join(" ") || "(لا شيء)");
    console.log("  فواصل ناقصة     :", r.lostBreaks.length, r.lostBreaks.join(", "));
  }
}
