import { readFileSync } from "fs";
import path from "path";
const PUBLIC_DIR = "/home/user/zelda-arabic-magic-a76daea1/public";
globalThis.fetch = async (url) => {
  const p = path.join(PUBLIC_DIR, url.toString());
  return { ok: true, json: async () => JSON.parse(readFileSync(p, "utf-8")) };
};
const { ensurePlatTables, platCharmap } = await import("/home/user/zelda-arabic-magic-a76daea1/src/lib/nds/plat-charmap.ts");
const { reshapeArabic } = await import("/home/user/zelda-arabic-magic-a76daea1/src/lib/arabic-processing.ts");
await ensurePlatTables();
const cm = platCharmap();
const shaped = reshapeArabic("معلومات");
for (const ch of shaped) {
  const code = cm.toCode.get(ch);
  console.log(ch, "U+"+ch.codePointAt(0).toString(16), "code=", code, "slot=", code!==undefined?code-1:null);
}
