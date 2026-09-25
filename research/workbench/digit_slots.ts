import { readFileSync } from "node:fs";
const REPO = "/home/user/zelda-arabic-magic-a76daea1";
// @ts-ignore
globalThis.fetch = async (u: any) => ({ ok: true, json: async () => JSON.parse(readFileSync(`${REPO}/public/${String(u).replace(/^.*\//, "")}`, "utf8")) } as any);
import { ensurePlatTables, platCharmap } from "/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap";
main();
async function main() {
  await ensurePlatTables();
  const cm = platCharmap();
  for (const d of "0123456789") {
    const code = cm.toCode.get(d);
    console.log(`رقم "${d}" → charcode=${code} → خانة الرسمة (code-1)=${code !== undefined ? code - 1 : "غير موجود"}`);
  }
}
