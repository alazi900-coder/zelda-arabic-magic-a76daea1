import { readFileSync } from "fs";
import { ensurePlatTables } from "@/lib/nds/plat-charmap";
import { extractPlatEntries } from "@/lib/nds/plat-editor-bridge";
const PUB = "/home/user/zelda-arabic-magic-a76daea1/public/";
(globalThis as any).fetch = async (u: string) => ({ ok: true, json: async () => JSON.parse(readFileSync(PUB + u.replace(/^\//, ""), "utf8")) });
async function main() {
  await ensurePlatTables();
  const rom = new Uint8Array(readFileSync("/home/user/decomps/pokeplatinum/build/pokeplatinum.us.nds"));
  const { entries } = extractPlatEntries(rom);
  const plain = /\$\d+/g, full = /\$\d[\d,]*/g;
  let lines = 0, grouped = 0;
  const samples: string[] = [];
  for (const e of entries) {
    const all = e.original.match(full);
    if (!all) continue;
    lines++;
    for (const a of all) if (a.includes(",")) { grouped++; if (samples.length < 6) samples.push(a); }
  }
  console.log(`أسطر فيها مبلغ: ${lines} | مبالغ فيها فاصلة آلاف: ${grouped}`);
  console.log("عيّنة:", samples.join("  "));
  console.log('ما يراه الفحص الحالي من "$1,000":', JSON.stringify("It is $1,000 now".match(plain)));
  console.log('وما يراه لو وُسّع        :', JSON.stringify("It is $1,000 now".match(full)));
}
main().catch((e) => { console.error(e); process.exit(1); });
