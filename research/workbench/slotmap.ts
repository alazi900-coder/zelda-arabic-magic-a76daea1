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
  const slot: Record<number, string> = {};
  for (const [code, ch] of cm.toChar) slot[code - 1] = ch;
  writeFileSync(`${SCR}/slotmap.json`, JSON.stringify(slot));
  // الخانات المنخفضة التي رأينا فيها كانا
  const low = [1, 3, 7, 9, 85, 114, 159, 175, 180, 190, 200, 220, 250, 270];
  console.log("ما الحرف الذي تشغّله كل خانة؟");
  for (const g of low) console.log(`  خانة ${String(g).padStart(3)} → ${slot[g] === undefined ? "(غير مستعملة في جدول الحروف)" : JSON.stringify(slot[g])}`);
  const used = Object.keys(slot).map(Number);
  console.log(`\nخانات يستعملها جدول الحروف: ${used.length} من 509`);
}
